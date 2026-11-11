// Named operations on a system's tokens. The studio and (later) the MCP server use the
// same functions, so a person and an agent can do exactly the same things.
import { parseColor, formatOklch } from "./color.mjs"
import { generateScale, isReference, STEPS } from "./palette.mjs"

function fail(message) {
  const e = new Error(message)
  e.status = 400
  throw e
}

const NAME = /^[a-z][a-z0-9-]*$/

// A theme value is a primitive reference ("blue.600", "base.white / 10%"), a colour, or
// any other CSS value (lengths, fonts).
function checkValue(tokens, value) {
  if (typeof value !== "string" || !value.trim()) fail("A value is required")
  const ref = value.match(/^([a-z][a-z0-9-]*)\.([a-z0-9]+)(?: \/ (\S+))?$/)
  if (ref && !isReference(value, tokens.primitives)) fail(`${ref[1]}.${ref[2]} isn't a primitive in this system`)
  return value.trim()
}

export const operations = {
  /** Set a theme token: { theme: "light", name: "primary", value: "blue.600" } */
  set_token(tokens, { theme, name, value }) {
    if (!tokens.themes?.[theme]) fail(`No theme ${theme}`)
    if (!(name in tokens.themes[theme])) fail(`No token ${name} in ${theme}`)
    tokens.themes[theme][name] = checkValue(tokens, value)
  },

  /** Set an @theme variable, e.g. { name: "font-sans", value: "'Inter Variable', sans-serif" } */
  set_theme_var(tokens, { name, value }) {
    if (!(name in (tokens.theme ?? {}))) fail(`No @theme variable ${name}`)
    tokens.theme[name] = checkValue(tokens, value)
  },

  /**
   * Create or regenerate a primitive scale: { scale: "brand", seed: "#4f46e5" }
   * or { scale: "neutral", hue: 260, chroma: 0.02 }. Semantic tokens that reference the
   * scale pick up the new values.
   */
  set_scale(tokens, { scale, seed, hue, chroma }) {
    if (!NAME.test(scale ?? "") || scale === "base") fail("Scale names are lowercase words, and base is reserved")
    const params = seed ? { seed } : { hue: Number(hue), chroma: Number(chroma) }
    if (!seed && (!Number.isFinite(params.hue) || !Number.isFinite(params.chroma))) fail("Give a seed colour, or a hue and chroma")
    tokens.primitives ??= {}
    tokens.primitives[scale] = generateScale(params)
    tokens.generators = { ...(tokens.generators ?? {}), [scale]: params }
  },

  /** Copy a scale from the project's Tailwind palette into the system: { scale: "emerald" } */
  add_palette_scale(tokens, { scale }, { palette }) {
    if (!palette?.[scale]) fail(`No Tailwind scale ${scale}`)
    tokens.primitives = { ...(tokens.primitives ?? {}), [scale]: { ...palette[scale] } }
    if (tokens.generators) delete tokens.generators[scale]
  },

  /** Set one step of a scale by hand: { scale: "brand", step: "500", value: "#4f46e5" } */
  set_step(tokens, { scale, step, value }) {
    if (!tokens.primitives?.[scale]) fail(`No scale ${scale}`)
    if (!STEPS.includes(step) && scale !== "base") fail(`No step ${step}`)
    const c = parseColor(value)
    if (!c) fail(`Can't read colour ${value}`)
    tokens.primitives[scale][step] = formatOklch(c)
    if (tokens.generators) delete tokens.generators[scale]
  },
}

export function applyOperation(tokens, op, args, context = {}) {
  const fn = operations[op]
  if (!fn) fail(`Unknown operation ${op}`)
  fn(tokens, args ?? {}, context)
  return tokens
}
