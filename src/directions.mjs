// Directions: alternative takes on a system, each a list of named operations on top of the
// current system, with a name and a rationale. An agent (or a person) drafts several from a
// brief; each renders in its own preview; the one picked is applied to the system. Because a
// direction is operations, its diff is readable and it replays onto later versions.
import fs from "node:fs"
import path from "node:path"
import { operations as tokenOperations, applyOperation } from "./edit.mjs"
import { recipeOperations } from "./recipe-ops.mjs"
import { compileComponent } from "./components.mjs"
import { compileTheme } from "./theme.mjs"
import { contrastReport } from "./checks.mjs"
import { componentChecks, classLists } from "./component-checks.mjs"

function fail(message) {
  const e = new Error(message)
  e.status = 400
  throw e
}

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/
export const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)

const dirOf = (systemDir) => path.join(systemDir, "directions")
const fileOf = (systemDir, id) => {
  if (!ID.test(id ?? "")) fail(`No direction ${id}`)
  return path.join(dirOf(systemDir), `${id}.json`)
}

export function listDirections(systemDir) {
  if (!fs.existsSync(dirOf(systemDir))) return []
  return fs
    .readdirSync(dirOf(systemDir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ id: f.slice(0, -5), ...JSON.parse(fs.readFileSync(path.join(dirOf(systemDir), f), "utf8")) }))
    .sort((a, b) => String(a.created).localeCompare(String(b.created)))
}

export function readDirection(systemDir, id) {
  const file = fileOf(systemDir, id)
  if (!fs.existsSync(file)) fail(`No direction ${id}`)
  return { id, ...JSON.parse(fs.readFileSync(file, "utf8")) }
}

export function writeDirection(systemDir, { id, ...d }) {
  fs.mkdirSync(dirOf(systemDir), { recursive: true })
  fs.writeFileSync(fileOf(systemDir, id), JSON.stringify(d, null, 2) + "\n")
}

export function deleteDirection(systemDir, id) {
  const file = fileOf(systemDir, id)
  if (!fs.existsSync(file)) fail(`No direction ${id}`)
  fs.rmSync(file)
}

/**
 * Apply a mixed list of operations to copies of the tokens and recipes, all or nothing.
 * Token operations take their args as usual; component operations need args.component.
 * Returns { tokens, recipes: { [component]: recipe } } for what changed.
 */
export function applyOps({ tokens, readRecipe, components }, ops, context) {
  if (!Array.isArray(ops)) fail("ops is a list of { op, args }")
  tokens = structuredClone(tokens)
  const recipes = {}
  ops.forEach(({ op, args = {} } = {}, i) => {
    try {
      if (tokenOperations[op]) applyOperation(tokens, op, args, context)
      else if (recipeOperations[op]) {
        const name = args.component
        if (!components.includes(name)) fail(`No component ${name}`)
        recipes[name] ??= structuredClone(readRecipe(name))
        recipeOperations[op](recipes[name], args)
      } else fail(`Unknown operation ${op}`)
    } catch (e) {
      e.message = `Operation ${i + 1} (${op}): ${e.message}`
      e.status ??= 400
      throw e
    }
  })
  return { tokens, recipes }
}

const flat = (v) => (Array.isArray(v) ? v : v.raw.split(/\s+/).filter(Boolean))

/** What a direction changes, readable: tokens before → after, classes added and removed. */
export function diff(base, next) {
  const out = []
  for (const [theme, roles] of Object.entries(next.tokens.themes ?? {})) {
    for (const [k, v] of Object.entries(roles)) if (base.tokens.themes?.[theme]?.[k] !== v) out.push(`${theme}.${k}: ${base.tokens.themes?.[theme]?.[k] ?? "—"} → ${v}`)
  }
  for (const [k, v] of Object.entries(next.tokens.theme ?? {})) if (base.tokens.theme?.[k] !== v) out.push(`@theme ${k}: ${base.tokens.theme?.[k] ?? "—"} → ${v}`)
  const keys = new Set([...Object.keys(base.tokens.foundations ?? {}), ...Object.keys(next.tokens.foundations ?? {})])
  for (const k of keys) {
    const a = base.tokens.foundations?.[k], b = next.tokens.foundations?.[k]
    if (a !== b) out.push(`${k}: ${a ?? "default"} → ${b ?? "default"}`)
  }
  for (const [s, steps] of Object.entries(next.tokens.primitives ?? {})) {
    if (!base.tokens.primitives?.[s]) out.push(`scale ${s} added${next.tokens.generators?.[s]?.seed ? ` (seed ${next.tokens.generators[s].seed})` : ""}`)
    else if (JSON.stringify(base.tokens.primitives[s]) !== JSON.stringify(steps)) out.push(`scale ${s} changed`)
  }
  for (const [name, recipe] of Object.entries(next.recipes)) {
    const before = Object.fromEntries(classLists(base.readRecipe(name)))
    const after = Object.fromEntries(classLists(recipe))
    for (const p of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const a = before[p] ? flat(before[p]) : null, b = after[p] ? flat(after[p]) : null
      if (!a) out.push(`${name} ${p}: added`)
      else if (!b) out.push(`${name} ${p}: removed`)
      else {
        const minus = a.filter((c) => !b.includes(c)), plus = b.filter((c) => !a.includes(c))
        if (minus.length || plus.length) out.push(`${name} ${p}: ${[...minus.map((c) => `−${c}`), ...plus.map((c) => `+${c}`)].join(" ")}`)
      }
    }
    for (const [cva, e] of Object.entries(recipe.cva ?? {})) {
      for (const [dim, v] of Object.entries(e.defaults ?? {})) {
        const was = base.readRecipe(name).cva?.[cva]?.defaults?.[dim]
        if (was !== v) out.push(`${name} default ${dim}: ${was} → ${v}`)
      }
    }
  }
  return out
}

/** Checks for a built direction: contrast failures, and bypassing classes in what it changed. */
export function directionChecks(built) {
  return {
    contrast: contrastReport(built.tokens).filter((r) => !r.pass),
    components: Object.entries(built.recipes).flatMap(([name, r]) => componentChecks(r).map((c) => ({ component: name, ...c }))),
  }
}

// Rewrite imports so a direction's copies use each other instead of the project's.
const localize = (src, ui) =>
  src
    .replaceAll(`"@/${ui}/`, `"./ui/`)
    .replaceAll(`"../src/${ui}/`, `"./ui/`)
    .replaceAll("`../src/" + ui + "/", "`./ui/")
    .replaceAll(`"../src/index.css"`, `"./index.css"`)

/**
 * Write a direction's preview into the project: livery-preview/d/<id>/ holds its compiled
 * components and CSS, and the preview entry rewired to them. One Vite serves every direction.
 */
export function materialize({ systemDir, projectDir, system, readRecipe, fixturesDir, sheets }, id, built) {
  const out = path.join(projectDir, "livery-preview", "d", id)
  fs.mkdirSync(path.join(out, "ui"), { recursive: true })
  // Write only what changed, so open previews reload only when the direction did.
  const put = (file, text) => {
    const f = path.join(out, file)
    if (!fs.existsSync(f) || fs.readFileSync(f, "utf8") !== text) fs.writeFileSync(f, text)
  }
  const ui = system.paths.ui.replace(/^src\//, "")
  for (const name of system.components) {
    const skeleton = fs.readFileSync(path.join(systemDir, "skeleton", system.paths.ui, `${name}.tsx`), "utf8")
    put(path.join("ui", `${name}.tsx`), compileComponent(built.recipes[name] ?? readRecipe(name), skeleton).replaceAll(`"@/${ui}/`, `"./`))
  }
  put("index.css", compileTheme(built.tokens, fs.readFileSync(path.join(systemDir, "skeleton", system.paths.css), "utf8")))
  for (const f of ["preview.tsx", "Specimen.tsx", "Sheet.tsx"]) put(f, localize(fs.readFileSync(path.join(fixturesDir, f), "utf8"), ui))
  put("sheets.json", JSON.stringify(sheets(built.recipes), null, 2) + "\n")
  put("index.html", fs.readFileSync(path.join(fixturesDir, "preview.html"), "utf8").replace("/livery-preview/preview.tsx", "./preview.tsx"))
  return `livery-preview/d/${id}/index.html`
}

/** Remove the previews of directions that no longer exist. */
export function prunePreviews(projectDir, ids) {
  const dir = path.join(projectDir, "livery-preview", "d")
  if (!fs.existsSync(dir)) return
  for (const d of fs.readdirSync(dir)) if (!ids.includes(d)) fs.rmSync(path.join(dir, d), { recursive: true, force: true })
}
