// Decompile shadcn's theme CSS (index.css) into tokens, and compile back.
// Every custom property in :root, .dark (or any theme selector) and @theme becomes a
// named token; the rest of the file stays as a skeleton with placeholders.
import postcss from "postcss"
import { MARK } from "./components.mjs"
import { toReference, resolve } from "./palette.mjs"
import { foundationsCss } from "./foundations.mjs"

// The theme a rule belongs to: ":root" → light, ".dark" → dark, ".theme-x" → x.
function themeName(selector) {
  if (selector === ":root") return "light"
  const m = selector.match(/^\.([\w-]+)$/) || selector.match(/^\[data-theme=['"]?([\w-]+)['"]?\]$/)
  return m ? m[1].replace(/^theme-/, "") : null
}

/**
 * palette: primitive scales (see palette.mjs). When given, theme colours that match a
 * primitive are stored as references ("neutral.900", "base.white / 10%"), and the scales
 * they use are kept in tokens.primitives.
 */
export function decompileTheme(css, fileName = "index.css", { palette, preferred = [] } = {}) {
  const root = postcss.parse(css, { from: fileName })
  const tokens = { file: fileName, primitives: {}, themes: {}, theme: {} }
  const edits = []

  root.walkDecls((decl) => {
    if (!decl.prop.startsWith("--")) return
    const parent = decl.parent
    let group, key
    if (parent.type === "atrule" && parent.name === "theme") {
      group = tokens.theme
      key = `theme.${decl.prop.slice(2)}`
    } else if (parent.type === "rule" && themeName(parent.selector)) {
      const t = themeName(parent.selector)
      group = tokens.themes[t] ??= {}
      key = `themes.${t}.${decl.prop.slice(2)}`
    } else return
    const ref = palette && group !== tokens.theme ? toReference(decl.value, palette, preferred) : null
    if (ref) tokens.primitives[ref.split(".")[0]] = palette[ref.split(".")[0]]
    group[decl.prop.slice(2)] = ref ?? decl.value
    // Locate the value text in the source so we replace it exactly.
    const start = decl.source.start.offset
    const declText = css.slice(start, decl.source.end.offset)
    const valueAt = declText.indexOf(decl.value, decl.prop.length)
    if (valueAt < 0) throw new Error(`${fileName}: can't locate value for ${decl.prop}`)
    edits.push({ start: start + valueAt, end: start + valueAt + decl.value.length, id: key })
  })

  let skeleton = css
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    skeleton = skeleton.slice(0, e.start) + MARK + e.id + skeleton.slice(e.end)
  }
  if (!Object.keys(tokens.primitives).length) delete tokens.primitives
  return { tokens, skeleton, lifted: edits.length }
}

export function compileTheme(tokens, skeleton) {
  const css = skeleton.replace(new RegExp(MARK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([\\w.-]+)", "g"), (_, id) => {
    const [section, ...rest] = id.split(".")
    const value =
      section === "theme" ? tokens.theme?.[rest.join(".")] : tokens.themes?.[rest[0]]?.[rest.slice(1).join(".")]
    if (value === undefined) throw new Error(`${tokens.file}: no token for ${id}`)
    return resolve(value, tokens.primitives)
  })
  return fontImports(tokens.fonts) + css + foundationsCss(tokens.foundations)
}

/** @import lines for Google-hosted fonts, first in the file as CSS requires. */
export function fontImports(fonts) {
  const families = [...new Set(Object.values(fonts ?? {}).filter((f) => f.source === "google").map((f) => f.family))]
  if (!families.length) return ""
  const q = families.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&")
  return `@import url("https://fonts.googleapis.com/css2?${q}&display=swap");
`
}
