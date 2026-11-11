// Checks on component recipes: classes that bypass the system. Components should reference
// roles and foundations, not raw colours or one-off sizes, so the system stays the source.
const PALETTE = /^(?:bg|text|border(?:-[xytrblse])?|ring|outline|fill|stroke|from|via|to|divide|decoration|shadow|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/.+)?$/
// Colours written as values; relative colours built from a role (oklch(from var(--primary) …)) are fine.
const RAW_COLOR = /\[[^\]]*(?:#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\((?!from_var|var))[^\]]*\]/i
const RAW_SIZE = /\[[^\]]*\d(?:px|rem|em)\b[^\]]*\]/
const FIXED_DURATION = /^duration-\d+$/

function utilityOf(cls) {
  let depth = 0, start = 0
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i]
    if (ch === "[" || ch === "(") depth++
    else if (ch === "]" || ch === ")") depth--
    else if (ch === ":" && depth === 0) start = i + 1
  }
  return cls.slice(start)
}

export function* classLists(recipe) {
  for (const [slot, v] of Object.entries(recipe.parts ?? {})) yield [`parts.${slot}`, v]
  for (const [name, entry] of Object.entries(recipe.cva ?? {})) {
    if (entry.base) yield [`cva.${name}.base`, entry.base]
    for (const [variant, values] of Object.entries(entry.variants ?? {})) {
      for (const [key, v] of Object.entries(values)) yield [`cva.${name}.variants.${variant}.${key}`, v]
    }
    for (const [i, v] of Object.entries(entry.compound ?? {})) yield [`cva.${name}.compound.${i}`, v]
  }
}

/** [{ path, class, kind: "palette" | "raw-color" | "raw-size" | "fixed-duration" }] */
export function componentChecks(recipe) {
  const out = []
  for (const [p, value] of classLists(recipe)) {
    const list = Array.isArray(value) ? value : value.raw.split(/\s+/)
    for (const cls of list) {
      const u = utilityOf(cls)
      if (PALETTE.test(u)) out.push({ path: p, class: cls, kind: "palette" })
      else if (RAW_COLOR.test(u)) out.push({ path: p, class: cls, kind: "raw-color" })
      else if (RAW_SIZE.test(u)) out.push({ path: p, class: cls, kind: "raw-size" })
      else if (FIXED_DURATION.test(u)) out.push({ path: p, class: cls, kind: "fixed-duration" })
    }
  }
  return out
}
