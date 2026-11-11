// Foundations Tailwind defines and shadcn components use without naming in index.css:
// spacing, type, weights, elevation and motion. Livery reads the defaults from the
// project's own tailwindcss, stores only what you change (tokens.foundations), and
// compiles those as one @theme block appended to the CSS. No changes → no block, so
// stock projects still round-trip byte for byte.
import fs from "node:fs"
import path from "node:path"
import postcss from "postcss"
import { parseColor, parseOklch, formatOklch } from "./color.mjs"
import { resolve } from "./palette.mjs"

const TEXT = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"]
export const GROUPS = {
  spacing: ["spacing"],
  type: TEXT.flatMap((s) => [`text-${s}`, `text-${s}--line-height`]),
  weight: ["font-weight-normal", "font-weight-medium", "font-weight-semibold", "font-weight-bold"],
  tracking: ["tracking-tight", "tracking-normal", "tracking-wide"],
  elevation: ["shadow-2xs", "shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl"],
  motion: ["default-transition-duration", "default-transition-timing-function", "ease-in", "ease-out", "ease-in-out"],
}
export const FOUNDATION_NAMES = Object.values(GROUPS).flat()

/** Tailwind's defaults for every foundation variable, from the project's tailwindcss/theme.css. */
export function loadTailwindDefaults(projectDir) {
  const file = path.join(projectDir, "node_modules/tailwindcss/theme.css")
  const out = {}
  if (!fs.existsSync(file)) return out
  const root = postcss.parse(fs.readFileSync(file, "utf8"))
  root.walkAtRules("theme", (rule) => {
    if (!/^default\b/.test(rule.params) || /reference/.test(rule.params)) return
    rule.walkDecls((d) => {
      const name = d.prop.slice(2)
      if (FOUNDATION_NAMES.includes(name) && !(name in out)) out[name] = d.value.replace(/\s+/g, " ").trim()
    })
  })
  return out
}

export const MARKER = "/* Livery foundations */"

/** The @theme block for overrides, or "" when there are none. */
export function foundationsCss(foundations) {
  const entries = FOUNDATION_NAMES.filter((n) => foundations?.[n] != null).map((n) => [n, foundations[n]])
  if (!entries.length) return ""
  return `\n${MARKER}\n@theme {\n${entries.map(([n, v]) => `  --${n}: ${v};\n`).join("")}}\n`
}

// --- generators ---------------------------------------------------------------

// Steps from base: xs −2, sm −1, base 0, lg +1 … 4xl +5. Line height tightens as size grows.
const STEP = { xs: -2, sm: -1, base: 0, lg: 1, xl: 2, "2xl": 3, "3xl": 4, "4xl": 5 }
const LEADING = { xs: 1.5, sm: 1.45, base: 1.5, lg: 1.45, xl: 1.4, "2xl": 1.3, "3xl": 1.2, "4xl": 1.1 }

/** A modular type scale: { base: 1 (rem), ratio: 1.2 } → text-* sizes and line heights. */
export function typeScale({ base = 1, ratio = 1.2 }) {
  const out = {}
  for (const s of TEXT) {
    out[`text-${s}`] = `${Number((base * ratio ** STEP[s]).toFixed(3))}rem`
    out[`text-${s}--line-height`] = String(LEADING[s])
  }
  return out
}

/**
 * Re-tint and re-weight Tailwind's shadows: every rgb(0 0 0 / a) becomes the given colour
 * at a × intensity. color is a primitive reference ("neutral.950") or any colour.
 */
export function shadowScale(defaults, { intensity = 1, color = "#000" }, primitives) {
  const c = parseOklch(resolve(color, primitives)) ?? parseColor(color)
  if (!c) throw new Error(`Can't read colour ${color}`)
  const base = formatOklch(c).replace(/\)$/, "")
  const out = {}
  for (const name of GROUPS.elevation) {
    if (!defaults[name]) continue
    out[name] = defaults[name].replace(/rgb\(0 0 0 \/ ([\d.]+)\)/g, (_, a) => `${base} / ${Number(Math.min(1, a * intensity).toFixed(3))})`)
  }
  return out
}
