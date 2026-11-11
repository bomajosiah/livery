// OKLCH parsing, formatting, sRGB gamut mapping and WCAG contrast. No dependencies.

// Parse "oklch(0.577 0.245 27.325)", "oklch(57.7% 0.245 27.325 / 10%)", "oklch(20.5% 0 none)".
export function parseOklch(text) {
  const m = String(text).trim().match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+|none)\s*(?:\/\s*([\d.]+%?))?\s*\)$/i)
  if (!m) return null
  const num = (v, scale) => (v.endsWith("%") ? (parseFloat(v) / 100) * scale : parseFloat(v))
  return {
    l: num(m[1], 1),
    c: num(m[2], 0.4),
    h: m[3] === "none" ? 0 : parseFloat(m[3]),
    alpha: m[4] === undefined ? undefined : num(m[4], 1),
  }
}

// Parse "#fff" / "#ffffff" to OKLCH.
export function parseHex(text) {
  let h = String(text).trim().replace(/^#/, "")
  if (h.length === 3) h = [...h].map((c) => c + c).join("")
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return rgbToOklch({ r, g, b })
}

export function parseColor(text) {
  return parseOklch(text) ?? parseHex(text)
}

const round = (x, digits) => {
  const s = Number(x.toFixed(digits)).toString()
  return s === "-0" ? "0" : s
}

// shadcn's format: oklch(0.577 0.245 27.325), no percent, 0 for no hue.
export function formatOklch({ l, c, h }) {
  const hue = c < 0.0005 ? 0 : h
  return `oklch(${round(l, 3)} ${round(c, 3)} ${round(hue, 3)})`
}

// --- conversions -------------------------------------------------------------

function oklchToOklab({ l, c, h }) {
  const r = (h * Math.PI) / 180
  return { L: l, a: c * Math.cos(r), b: c * Math.sin(r) }
}

function oklabToLinearRgb({ L, a, b }) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

function rgbToOklch({ r, g, b }) {
  const [R, G, B] = [r, g, b].map(toLinear)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(a, bb)
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

export function oklchToLinearRgb(color) {
  return oklabToLinearRgb(oklchToOklab(color))
}

export function oklchToHex(color) {
  const { r, g, b } = oklchToLinearRgb(clampToGamut(color))
  const hex = (v) => Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255).toString(16).padStart(2, "0")
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export function inGamut(color, eps = 0.0001) {
  const { r, g, b } = oklchToLinearRgb(color)
  return [r, g, b].every((v) => v >= -eps && v <= 1 + eps)
}

// Reduce chroma (keeping lightness and hue) until the colour fits in sRGB.
export function clampToGamut(color) {
  if (inGamut(color)) return color
  let lo = 0, hi = color.c
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut({ ...color, c: mid })) lo = mid
    else hi = mid
  }
  return { ...color, c: lo }
}

// --- contrast ----------------------------------------------------------------

function luminance(color) {
  const { r, g, b } = oklchToLinearRgb(clampToGamut(color))
  const c = (v) => Math.min(1, Math.max(0, v))
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

// Composite a translucent colour over an opaque background, in linear sRGB.
export function over(fg, bg) {
  const a = fg.alpha ?? 1
  if (a >= 1) return fg
  const F = oklchToLinearRgb(clampToGamut(fg)), B = oklchToLinearRgb(clampToGamut(bg))
  const mix = (x, y) => fromLinear(x * a + y * (1 - a))
  return rgbToOklch({ r: mix(F.r, B.r), g: mix(F.g, B.g), b: mix(F.b, B.b) })
}

export function contrast(fg, bg) {
  const solidBg = { ...bg, alpha: undefined }
  const L1 = luminance(over(fg, solidBg)), L2 = luminance(solidBg)
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1]
  return (hi + 0.05) / (lo + 0.05)
}
