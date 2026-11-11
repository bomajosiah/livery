// Token reach: for every token, which components use it and how often, read from the
// component recipes (the class strings), so a change shows what it touches before you make it.
import fs from "node:fs"
import path from "node:path"

// Split a class on ":" outside brackets and parentheses, and return the utility (last part).
function utilityOf(cls) {
  let depth = 0, start = 0
  for (let i = 0; i < cls.length; i++) {
    const ch = cls[i]
    if (ch === "[" || ch === "(") depth++
    else if (ch === "]" || ch === ")") depth--
    else if (ch === ":" && depth === 0) start = i + 1
  }
  return cls.slice(start).replace(/^!/, "").replace(/!$/, "")
}

const COLOR_UTIL =
  /^-?(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow|inset-shadow|inset-ring)-(.+?)(?:\/[\w.[\]%-]+)?$/
const SPACING_UTIL =
  /^-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|size|[hw]|min-[hw]|max-[hw]|inset(?:-[xy])?|top|left|right|bottom|start|end|translate-[xy]|scroll-[mp][xytrblse]?|indent|basis)-(?:\d+(?:\.\d+)?|px)$/
const TEXT_UTIL = /^text-(xs|sm|base|lg|xl|[2-9]xl)(?:\/.+)?$/
const SHADOW_UTIL = /^shadow(?:-(2xs|xs|sm|md|lg|xl|2xl))?$/
const RADIUS_UTIL = /^rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(xs|sm|md|lg|xl|2xl|3xl|4xl))?$/
const WEIGHT_UTIL = /^font-(normal|medium|semibold|bold)$/
const FONT_UTIL = /^font-(sans|heading|mono|serif)$/
const MOTION_UTIL = /^(?:transition(?:-\w+)?|ease-(?:in|out|in-out)|animate-.+)$/

/** Tokens a single class uses. colorNames: the system's theme colour roles. */
export function tokensOfClass(cls, colorNames) {
  const u = utilityOf(cls)
  const out = []
  for (const m of cls.matchAll(/var\(--([\w-]+)\)|\(--(?:color-)?([\w-]+)\)/g)) {
    const name = m[1] ?? m[2]
    if (colorNames.has(name)) out.push(name)
  }
  const c = u.match(COLOR_UTIL)
  if (c && colorNames.has(c[1])) out.push(c[1])
  if (SPACING_UTIL.test(u)) out.push("spacing")
  let m
  if ((m = u.match(TEXT_UTIL))) out.push(`text-${m[1]}`)
  if ((m = u.match(SHADOW_UTIL))) out.push(`shadow-${m[1] ?? "sm"}`)
  if ((m = u.match(RADIUS_UTIL))) out.push(m[1] ? `radius-${m[1]}` : "radius")
  if ((m = u.match(WEIGHT_UTIL))) out.push(`font-weight-${m[1]}`)
  if ((m = u.match(FONT_UTIL))) out.push(`font-${m[1]}`)
  if (MOTION_UTIL.test(u)) out.push(u.startsWith("ease-") ? u : "default-transition-duration")
  return out
}

function* classStrings(recipe) {
  for (const [slot, v] of Object.entries(recipe.parts ?? {})) yield [`part ${slot}`, v]
  for (const [name, entry] of Object.entries(recipe.cva ?? {})) {
    if (entry.base) yield [`${name} base`, entry.base]
    for (const [variant, values] of Object.entries(entry.variants ?? {})) {
      for (const [key, v] of Object.entries(values)) yield [`${name} ${variant}=${key}`, v]
    }
    for (const [i, v] of Object.entries(entry.compound ?? {})) yield [`${name} compound ${i}`, v]
  }
}

/**
 * { [token]: { components: [name…], uses: n } } for colour roles and foundations.
 * Radius tokens roll up into "radius" too, since every radius step derives from it.
 */
export function computeReach(systemDir, tokens) {
  const system = JSON.parse(fs.readFileSync(path.join(systemDir, "system.json"), "utf8"))
  const colorNames = new Set(Object.values(tokens.themes ?? {}).flatMap((t) => Object.keys(t)))
  const reach = {}
  const add = (token, component) => {
    const r = (reach[token] ??= { components: new Set(), uses: 0 })
    r.components.add(component)
    r.uses++
  }
  for (const name of system.components) {
    const recipe = JSON.parse(fs.readFileSync(path.join(systemDir, "components", `${name}.json`), "utf8"))
    for (const [, value] of classStrings(recipe)) {
      const classes = Array.isArray(value) ? value : value.raw.split(/\s+/)
      for (const cls of classes) {
        for (const t of tokensOfClass(cls, colorNames)) {
          add(t, name)
          if (t.startsWith("radius-")) add("radius", name)
        }
      }
    }
  }
  return Object.fromEntries(
    Object.entries(reach).map(([k, v]) => [k, { components: [...v.components].sort(), uses: v.uses }]),
  )
}
