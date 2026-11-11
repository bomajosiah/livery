// Named operations on component recipes: every class of every part, variant and state, plus
// variant keys and defaults. The studio and (later) the MCP server use these, so a person and
// an agent make the same edits with the same checks.
import fs from "node:fs"
import path from "node:path"
import { compileComponent } from "./components.mjs"

function fail(message) {
  const e = new Error(message)
  e.status = 400
  throw e
}

const KEY = /^[a-z0-9][a-z0-9-]*$/

export function recipeFile(systemDir, component) {
  if (!/^[a-z0-9-]+$/.test(component ?? "")) fail(`No component ${component}`)
  const file = path.join(systemDir, "components", `${component}.json`)
  if (!fs.existsSync(file)) fail(`No component ${component}`)
  return file
}

export const readRecipe = (systemDir, component) => JSON.parse(fs.readFileSync(recipeFile(systemDir, component), "utf8"))

export function writeRecipe(systemDir, component, recipe) {
  fs.writeFileSync(recipeFile(systemDir, component), JSON.stringify(recipe, null, 2) + "\n")
}

/** Compile one component into the project. */
export function compileComponentInto(systemDir, component, projectDir) {
  const system = JSON.parse(fs.readFileSync(path.join(systemDir, "system.json"), "utf8"))
  const recipe = readRecipe(systemDir, component)
  const skeleton = fs.readFileSync(path.join(systemDir, "skeleton", system.paths.ui, `${component}.tsx`), "utf8")
  fs.writeFileSync(path.join(projectDir, system.paths.ui, `${component}.tsx`), compileComponent(recipe, skeleton))
}

// Paths, as in the skeleton's placeholders:
//   parts.<slot> · cva.<name>.base · cva.<name>.variants.<variant>.<key> · cva.<name>.compound.<i>
function locate(recipe, p) {
  const [kind, ...rest] = String(p ?? "").split(".")
  if (kind === "parts") {
    const slot = rest.join(".")
    if (!(slot in (recipe.parts ?? {}))) fail(`No part ${slot}`)
    return [recipe.parts, slot]
  }
  if (kind === "cva") {
    const [name, section, a, b] = rest
    const entry = recipe.cva?.[name]
    if (!entry) fail(`No cva ${name}`)
    if (section === "base" && entry.base) return [entry, "base"]
    if (section === "variants" && entry.variants?.[a] && b in entry.variants[a]) return [entry.variants[a], b]
    if (section === "compound" && entry.compound && a in entry.compound) return [entry.compound, a]
  }
  fail(`No class list at ${p}`)
}

function checkClasses(classes) {
  const list = typeof classes === "string" ? classes.split(/\s+/).filter(Boolean) : classes
  if (!Array.isArray(list) || list.some((c) => typeof c !== "string" || !c || /\s/.test(c))) fail("Classes are a list of single class names")
  return list
}

function cvaEntry(recipe, name, variant) {
  const entry = recipe.cva?.[name]
  if (!entry) fail(`No cva ${name}`)
  if (!entry.variants?.[variant]) fail(`No variant ${variant} in ${name}`)
  return entry
}

export const recipeOperations = {
  /** Replace a class list: { component: "button", path: "cva.buttonVariants.variants.size.sm", classes: ["h-7", "px-3"] } */
  set_classes(recipe, { path: p, classes }) {
    const [obj, key] = locate(recipe, p)
    obj[key] = checkClasses(classes)
  },

  /** Add classes to a list: { component, path, classes: "rounded-full shadow-sm" } */
  add_classes(recipe, { path: p, classes }) {
    const [obj, key] = locate(recipe, p)
    const current = Array.isArray(obj[key]) ? obj[key] : obj[key].raw.split(/\s+/).filter(Boolean)
    obj[key] = [...current, ...checkClasses(classes).filter((c) => !current.includes(c))]
  },

  /** Remove one class: { component, path, class: "rounded-lg" } */
  remove_class(recipe, { path: p, class: cls }) {
    const [obj, key] = locate(recipe, p)
    const current = Array.isArray(obj[key]) ? obj[key] : obj[key].raw.split(/\s+/).filter(Boolean)
    if (!current.includes(cls)) fail(`${cls} isn't in ${p}`)
    obj[key] = current.filter((c) => c !== cls)
  },

  /** Replace one class everywhere in the component: { component, from: "duration-100", to: "duration-200" } */
  replace_class(recipe, { from, to }) {
    checkClasses([from, to])
    let n = 0
    const swap = (list) => (Array.isArray(list) ? list.map((c) => (c === from ? (n++, to) : c)) : list)
    for (const k of Object.keys(recipe.parts ?? {})) recipe.parts[k] = swap(recipe.parts[k])
    for (const entry of Object.values(recipe.cva ?? {})) {
      entry.base = swap(entry.base)
      for (const v of Object.values(entry.variants ?? {})) for (const k of Object.keys(v)) v[k] = swap(v[k])
      for (const k of Object.keys(entry.compound ?? {})) entry.compound[k] = swap(entry.compound[k])
    }
    if (!n) fail(`${from} isn't used in this component`)
  },

  /** Add a variant key: { component, cva: "buttonVariants", variant: "size", key: "xl", copyFrom: "lg" } */
  add_variant_key(recipe, { cva, variant, key, copyFrom, classes }) {
    const entry = cvaEntry(recipe, cva, variant)
    if (!KEY.test(key ?? "")) fail("Keys are lowercase words, digits and dashes")
    if (key in entry.variants[variant]) fail(`${variant}=${key} already exists`)
    if (copyFrom && !(copyFrom in entry.variants[variant])) fail(`No ${variant}=${copyFrom} to copy`)
    const from = copyFrom ? entry.variants[variant][copyFrom] : []
    entry.variants[variant][key] = classes ? checkClasses(classes) : Array.isArray(from) ? [...from] : from.raw.split(/\s+/)
  },

  /** Remove a variant key (not the default): { component, cva, variant, key } */
  remove_variant_key(recipe, { cva, variant, key }) {
    const entry = cvaEntry(recipe, cva, variant)
    if (!(key in entry.variants[variant])) fail(`No ${variant}=${key}`)
    if (entry.defaults?.[variant] === key) fail(`${variant}=${key} is the default; choose another default first`)
    if (Object.values(entry.compound ?? {}).length) {
      // Compound variants may name the key; keep it simple and refuse rather than break them.
      const src = JSON.stringify(entry.compound)
      if (src.includes(`"${key}"`)) fail(`${key} is used by a compound variant`)
    }
    delete entry.variants[variant][key]
  },

  /** Set the default key: { component, cva, variant, key } */
  set_default(recipe, { cva, variant, key }) {
    const entry = cvaEntry(recipe, cva, variant)
    if (!(key in entry.variants[variant])) fail(`No ${variant}=${key}`)
    if (!entry.defaults || !(variant in entry.defaults)) fail(`${variant} has no default in the source`)
    entry.defaults[variant] = key
  },
}

/** Apply an operation to a component's recipe, then write it and (optionally) compile it into a project. */
export function applyRecipeOperation(systemDir, op, args, projectDir) {
  const fn = recipeOperations[op]
  if (!fn) fail(`Unknown operation ${op}`)
  const recipe = readRecipe(systemDir, args?.component)
  fn(recipe, args)
  writeRecipe(systemDir, args.component, recipe)
  if (projectDir) compileComponentInto(systemDir, args.component, projectDir)
  return recipe
}
