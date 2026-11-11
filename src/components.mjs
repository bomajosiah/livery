// Decompile a shadcn component file into a recipe (every class string, named)
// plus a skeleton (the rest of the source, with placeholders), and compile back.
import ts from "typescript"

export const MARK = "__livery__:"

// Split a class string into a list when that is lossless; otherwise keep it raw.
function toClasses(text) {
  const list = text.split(/\s+/).filter(Boolean)
  return list.join(" ") === text ? list : { raw: text }
}

function fromClasses(value) {
  return Array.isArray(value) ? value.join(" ") : value.raw
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null
}

function propName(node) {
  if (!node.name) return null
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text
  return null
}

function calleeName(call) {
  const e = call.expression
  return ts.isIdentifier(e) ? e.text : null
}

// The data-slot value (or component name) for the JSX element owning an attribute.
function ownerSlot(attr) {
  const attrs = attr.parent
  for (const a of attrs.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === "data-slot" && a.initializer && ts.isStringLiteral(a.initializer)) {
      return a.initializer.text
    }
  }
  let fn = attr
  while (fn && !ts.isFunctionDeclaration(fn) && !ts.isVariableDeclaration(fn)) fn = fn.parent
  const name = fn?.name?.getText?.() ?? "anonymous"
  return `@${name}`
}

/**
 * Find the recipe path for a string literal, or null if it isn't a class string
 * we own. Paths:
 *   cva.<var>.base | cva.<var>.variants.<variant>.<key> | cva.<var>.compound.<i>
 *   parts.<slot>   (className strings on the element with that data-slot)
 */
function classify(node) {
  // A quoted object key: only a class string when it's a key of cn({ "classes": condition }).
  if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) {
    const obj = node.parent.parent
    const call = obj?.parent
    if (ts.isObjectLiteralExpression(obj) && call && ts.isCallExpression(call) && ["cn", "clsx"].includes(calleeName(call))) {
      let q = call.parent
      while (q && (ts.isParenthesizedExpression(q) || ts.isJsxExpression(q))) q = q.parent
      if (q && ts.isJsxAttribute(q) && q.name.getText() === "className") return { kind: "part", slot: ownerSlot(q) }
    }
    return null
  }
  // A string inside a cva config: variants.<v>.<k> or compoundVariants[i].className
  if (ts.isPropertyAssignment(node.parent)) {
    const r = cvaPathOf(node.parent)
    if (r) return r
  }
  // Walk up through expressions that only pass the string along.
  let child = node
  let p = node.parent
  while (
    p &&
    (ts.isConditionalExpression(p) || ts.isBinaryExpression(p) || ts.isParenthesizedExpression(p) || ts.isArrayLiteralExpression(p))
  ) {
    if (ts.isConditionalExpression(p) && child === p.condition) return null
    child = p
    p = p.parent
  }
  if (!p) return null

  // cva("base", {...})
  if (ts.isCallExpression(p) && calleeName(p) === "cva" && p.arguments[0] === child) {
    return { kind: "cva", name: cvaName(p), path: ["base"] }
  }

  // className="..." or className={"..."} or className={cn("...", ...)}
  if (ts.isJsxExpression(p)) p = p.parent
  if (ts.isJsxAttribute(p) && p.name.getText() === "className") {
    return { kind: "part", slot: ownerSlot(p) }
  }
  if (ts.isCallExpression(p) && (calleeName(p) === "cn" || calleeName(p) === "clsx")) {
    let q = p.parent
    while (q && (ts.isParenthesizedExpression(q) || ts.isJsxExpression(q))) q = q.parent
    if (q && ts.isJsxAttribute(q) && q.name.getText() === "className") {
      return { kind: "part", slot: ownerSlot(q) }
    }
    // cn(...) outside JSX: name it by the enclosing function or variable.
    let fn = p
    while (fn && !ts.isFunctionDeclaration(fn) && !ts.isVariableDeclaration(fn)) fn = fn.parent
    return { kind: "part", slot: `@${fn?.name?.getText?.() ?? "anonymous"}` }
  }
  return null
}

function cvaName(call) {
  const d = call.parent
  return d && ts.isVariableDeclaration(d) ? d.name.getText() : "anonymous"
}

// For a property assignment holding a string inside a cva config, return its path.
function cvaPathOf(prop) {
  const keys = []
  let n = prop
  let compoundIndex = null
  while (n) {
    if (ts.isPropertyAssignment(n)) keys.unshift(propName(n))
    if (ts.isArrayLiteralExpression(n.parent ?? {}) && ts.isObjectLiteralExpression(n)) {
      compoundIndex = n.parent.elements.indexOf(n)
    }
    if (ts.isCallExpression(n) && calleeName(n) === "cva") {
      const name = cvaName(n)
      // keys: [variants, v, k] | [compoundVariants, className]
      if (keys[0] === "variants" && keys.length === 3) return { kind: "cva", name, path: ["variants", keys[1], keys[2]] }
      if (keys[0] === "compoundVariants" && (keys[1] === "className" || keys[1] === "class")) {
        return { kind: "cva", name, path: ["compound", String(compoundIndex)] }
      }
      return null
    }
    n = n.parent
  }
  return null
}

export function decompileComponent(source, fileName) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits = [] // { start, end, id }
  const recipe = { file: fileName, cva: {}, parts: {} }
  const partCounts = {}

  const visit = (node) => {
    const text = literalText(node)
    if (text !== null && text.trim() !== "") {
      const c = classify(node)
      if (c) {
        let id
        if (c.kind === "cva") {
          const entry = (recipe.cva[c.name] ??= { base: null, variants: {}, compound: {} })
          if (c.path[0] === "base") entry.base = toClasses(text), (id = `cva.${c.name}.base`)
          else if (c.path[0] === "variants") {
            ;(entry.variants[c.path[1]] ??= {})[c.path[2]] = toClasses(text)
            id = `cva.${c.name}.variants.${c.path[1]}.${c.path[2]}`
          } else {
            entry.compound[c.path[1]] = toClasses(text)
            id = `cva.${c.name}.compound.${c.path[1]}`
          }
        } else {
          const n = (partCounts[c.slot] = (partCounts[c.slot] ?? 0) + 1)
          const key = n === 1 ? c.slot : `${c.slot}#${n}`
          recipe.parts[key] = toClasses(text)
          id = `parts.${key}`
        }
        // Replace only the literal's contents, keeping its quotes.
        edits.push({ start: node.getStart(sf) + 1, end: node.getEnd() - 1, id })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  let skeleton = source
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    skeleton = skeleton.slice(0, e.start) + MARK + e.id + skeleton.slice(e.end)
  }
  for (const k of Object.keys(recipe.cva)) {
    if (!Object.keys(recipe.cva[k].compound).length) delete recipe.cva[k].compound
  }
  if (!Object.keys(recipe.cva).length) delete recipe.cva
  return { recipe, skeleton, lifted: edits.length }
}

function lookup(recipe, id) {
  const [kind, ...rest] = id.split(".")
  if (kind === "parts") return recipe.parts?.[rest.join(".")]
  // cva.<name>.base | cva.<name>.variants.<v>.<k> | cva.<name>.compound.<i>
  const [name, section, ...path] = rest
  const entry = recipe.cva?.[name]
  if (!entry) return undefined
  if (section === "base") return entry.base
  if (section === "variants") return entry.variants?.[path[0]]?.[path[1]]
  if (section === "compound") return entry.compound?.[path[0]]
}

export function compileComponent(recipe, skeleton) {
  const re = new RegExp(MARK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([A-Za-z0-9_@#.\\-]+)", "g")
  return skeleton.replace(re, (_, id) => {
    const value = lookup(recipe, id)
    if (value === undefined) throw new Error(`${recipe.file}: no recipe entry for ${id}`)
    return fromClasses(value)
  })
}

// Class-looking string literals left in the skeleton: candidates we didn't lift.
export function unliftedClassStrings(skeleton, fileName) {
  const sf = ts.createSourceFile(fileName, skeleton, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  const looksLikeClasses = (s) =>
    /\s/.test(s.trim()) && s.split(/\s+/).filter(Boolean).every((t) => /^[!\-\[\]&@:a-z0-9_./%()=*'"~>+,#]+$/i.test(t)) && /(^|\s)-?[a-z]+-[a-z0-9\[]/.test(s)
  const visit = (node) => {
    const t = literalText(node)
    if (t && !t.startsWith(MARK) && looksLikeClasses(t)) found.push(t)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}
