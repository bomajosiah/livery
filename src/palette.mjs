// Primitive colour scales: Tailwind's palette (read from the project's own tailwindcss),
// references from semantic tokens ("neutral.900", "white / 10%"), and generated ramps.
import fs from "node:fs"
import path from "node:path"
import { parseColor, parseOklch, formatOklch, clampToGamut } from "./color.mjs"

export const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]

// Tailwind writes "oklch(57.7% 0.245 27.325)"; shadcn writes "oklch(0.577 0.245 27.325)".
function toShadcnFormat(value) {
  const m = value.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\)$/)
  if (!m) return null
  const l = Number((parseFloat(m[1]) / 100).toFixed(6)).toString()
  return `oklch(${l} ${m[2]} ${m[3] === "none" ? "0" : m[3]})`
}

// { red: { "50": "oklch(...)", ... }, ..., base: { white, black } }
export function loadTailwindPalette(projectDir) {
  const file = path.join(projectDir, "node_modules/tailwindcss/theme.css")
  const palette = { base: { white: "oklch(1 0 0)", black: "oklch(0 0 0)" } }
  if (!fs.existsSync(file)) return palette
  const css = fs.readFileSync(file, "utf8")
  for (const m of css.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) {
    const v = toShadcnFormat(m[3].trim())
    if (v) (palette[m[1]] ??= {})[m[2]] = v
  }
  return palette
}

// Split "oklch(1 0 0 / 10%)" into its opaque colour and alpha text.
function splitAlpha(value) {
  const m = value.match(/^(oklch\([^/)]+?)\s*\/\s*([^)]+)\)$/)
  return m ? { color: `${m[1]})`, alpha: m[2].trim() } : { color: value, alpha: null }
}

const REF = /^([a-z][a-z0-9-]*)\.([a-z0-9]+)(?: \/ (\S+))?$/

/** Find a primitive that renders to exactly this value. Returns "scale.step[ / alpha]" or null. */
export function toReference(value, palette, preferred = []) {
  const { color, alpha } = splitAlpha(value)
  if (!parseOklch(color)) return null
  const scales = [...preferred, "base", ...Object.keys(palette)].filter((s, i, a) => palette[s] && a.indexOf(s) === i)
  for (const scale of scales) {
    for (const [step, v] of Object.entries(palette[scale])) {
      if (v === color) return `${scale}.${step}${alpha ? ` / ${alpha}` : ""}`
    }
  }
  return null
}

/** Resolve "scale.step[ / alpha]" against primitives; anything else is returned as is. */
export function resolve(value, primitives) {
  const m = typeof value === "string" && value.match(REF)
  if (!m || !primitives?.[m[1]]?.[m[2]]) return value
  const base = primitives[m[1]][m[2]]
  return m[3] ? base.replace(/\)$/, ` / ${m[3]})`) : base
}

export function isReference(value, primitives) {
  const m = typeof value === "string" && value.match(REF)
  return Boolean(m && primitives?.[m[1]]?.[m[2]])
}

// --- generated ramps -----------------------------------------------------------
// Lightness and relative chroma per step, taken from Tailwind's neutral and blue scales.
const NEUTRAL_L = [0.985, 0.97, 0.922, 0.87, 0.708, 0.556, 0.439, 0.371, 0.269, 0.205, 0.145]
const CHROMA_L = [0.97, 0.932, 0.882, 0.809, 0.707, 0.623, 0.546, 0.488, 0.424, 0.379, 0.282]
const CHROMA_SHAPE = [0.057, 0.131, 0.253, 0.465, 0.673, 0.873, 1, 0.992, 0.812, 0.596, 0.371]
const NEUTRAL_SHAPE = [0.3, 0.4, 0.6, 0.8, 1, 1, 1, 1, 0.9, 0.8, 0.7]

/**
 * Generate an 11-step scale. Either { hue, chroma } (chroma = the peak), or { seed }
 * (any CSS colour; the scale passes through it at the step nearest its lightness).
 */
export function generateScale({ hue = 0, chroma = 0, seed } = {}) {
  let pinned = null
  if (seed) {
    const s = parseColor(seed)
    if (!s) throw new Error(`Can't read colour ${seed}`)
    hue = s.h
    const neutral = s.c < 0.04
    const L = neutral ? NEUTRAL_L : CHROMA_L
    const shape = neutral ? NEUTRAL_SHAPE : CHROMA_SHAPE
    const i = L.reduce((best, l, j) => (Math.abs(l - s.l) < Math.abs(L[best] - s.l) ? j : best), 0)
    chroma = s.c / shape[i]
    const sc = clampToGamut(s)
    pinned = { index: i, value: formatOklch({ ...sc, c: Math.floor(sc.c * 1000) / 1000 }) }
  }
  const neutral = chroma < 0.04
  const L = neutral ? NEUTRAL_L : CHROMA_L
  const shape = neutral ? NEUTRAL_SHAPE : CHROMA_SHAPE
  const scale = {}
  STEPS.forEach((step, i) => {
    // Round chroma down after gamut mapping, so rounding never pushes a step out of sRGB.
    const c = clampToGamut({ l: L[i], c: chroma * shape[i], h: hue })
    scale[step] = pinned?.index === i ? pinned.value : formatOklch({ ...c, c: Math.floor(c.c * 1000) / 1000 })
  })
  return scale
}
