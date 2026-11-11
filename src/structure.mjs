// Structural edits to cva calls: add or remove variant keys and change defaults. The
// skeleton keeps the original source shape; when a recipe differs from it, these edits
// rewrite just the affected properties, in the file's own indentation. No differences,
// no edits, so an untouched component still compiles byte for byte.
import ts from "typescript"
import { MARK } from "./components.mjs"

const isIdent = (s) => /^[A-Za-z_$][\w$]*$/.test(s)
const keyText = (k) => (isIdent(k) ? k : JSON.stringify(k))

function propName(p) {
  if (!p.name) return null
  return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null
}
function prop(obj, name) {
  return obj?.properties.find((p) => ts.isPropertyAssignment(p) && propName(p) === name)
}

/** Every cva call in a file: its variant keys, defaults, and the functions that call it. */
export function readCva(source, fileName = "file.tsx") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = {}
  const fns = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "cva") {
      const decl = node.parent
      const name = decl && ts.isVariableDeclaration(decl) ? decl.name.getText(sf) : null
      const config = node.arguments[1]
      if (name && config && ts.isObjectLiteralExpression(config)) {
        const variants = prop(config, "variants")?.initializer
        const defaults = prop(config, "defaultVariants")?.initializer
        out[name] = { call: node, config, variants, defaults, dims: {}, defaultValues: {}, usedBy: [] }
        if (variants && ts.isObjectLiteralExpression(variants)) {
          for (const d of variants.properties) {
            if (ts.isPropertyAssignment(d) && ts.isObjectLiteralExpression(d.initializer)) out[name].dims[propName(d)] = d.initializer
          }
        }
        if (defaults && ts.isObjectLiteralExpression(defaults)) {
          for (const p of defaults.properties) {
            if (ts.isPropertyAssignment(p) && ts.isStringLiteral(p.initializer)) out[name].defaultValues[propName(p)] = p.initializer.text
          }
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) fns.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  for (const fn of fns) {
    const body = fn.body?.getText(sf) ?? ""
    for (const [name, entry] of Object.entries(out)) {
      if (new RegExp(`\\b${name}\\(`).test(body)) entry.usedBy.push(fn.name.text)
    }
  }
  return { sf, cva: out, fns }
}

/** Defaults and users of each cva, for the recipe (so people and agents can see them). */
export function cvaInfo(source, fileName) {
  const { cva } = readCva(source, fileName)
  return Object.fromEntries(Object.entries(cva).map(([k, v]) => [k, { defaults: v.defaultValues, usedBy: v.usedBy }]))
}

function lineIndent(text, pos) {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1
  return text.slice(lineStart, pos).match(/^\s*/)[0]
}

/** Rewrite the skeleton so its cva structure matches the recipe. */
export function applyStructure(skeleton, recipe, fileName = "file.tsx") {
  if (!recipe.cva) return skeleton
  const { sf, cva, fns } = readCva(skeleton, fileName)
  const edits = []
  for (const [name, entry] of Object.entries(recipe.cva)) {
    const found = cva[name]
    if (!found) continue
    // Variant keys
    for (const [dim, obj] of Object.entries(found.dims)) {
      const want = Object.keys(entry.variants?.[dim] ?? {})
      const props = obj.properties.filter(ts.isPropertyAssignment)
      const have = props.map(propName)
      for (const p of props) {
        if (want.includes(propName(p))) continue
        // Remove the property with its leading line break and trailing comma.
        let end = p.getEnd()
        if (skeleton[end] === ",") end++
        edits.push({ start: p.getFullStart(), end, text: "" })
      }
      const added = want.filter((k) => !have.includes(k))
      if (added.length) {
        const last = props[props.length - 1]
        const indent = last ? lineIndent(skeleton, last.getStart(sf)) : lineIndent(skeleton, obj.getStart(sf)) + "  "
        let at = last ? last.getEnd() : obj.getStart(sf) + 1
        const needsComma = last && skeleton[at] !== ","
        if (last && skeleton[at] === ",") at++
        const text = (needsComma ? "," : "") + added.map((k) => `\n${indent}${keyText(k)}: "${MARK}cva.${name}.variants.${dim}.${k}",`).join("")
        edits.push({ start: at, end: at, text })
      }
    }
    // Defaults: the defaultVariants literal and each user's parameter default.
    for (const [dim, value] of Object.entries(entry.defaults ?? {})) {
      const old = found.defaultValues[dim]
      if (old === undefined || old === value) continue
      const p = prop(found.defaults, dim)
      edits.push({ start: p.initializer.getStart(sf) + 1, end: p.initializer.getEnd() - 1, text: value })
      for (const fn of fns.filter((f) => found.usedBy.includes(f.name.text))) {
        const visit = (n) => {
          if (ts.isBindingElement(n) && n.name.getText(sf) === dim && n.initializer && ts.isStringLiteral(n.initializer) && n.initializer.text === old) {
            edits.push({ start: n.initializer.getStart(sf) + 1, end: n.initializer.getEnd() - 1, text: value })
          }
          ts.forEachChild(n, visit)
        }
        fn.parameters.forEach(visit)
      }
    }
  }
  let out = skeleton
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}
