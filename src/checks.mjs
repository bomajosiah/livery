// Checks on a system's tokens: WCAG contrast for every text-on-surface pair, per theme.
import { parseOklch, contrast } from "./color.mjs"
import { resolve } from "./palette.mjs"

// Pairs: every "x" / "x-foreground", plus text roles shadcn uses on the page background.
function pairs(theme) {
  const out = []
  for (const name of Object.keys(theme)) {
    if (name.endsWith("-foreground")) {
      const bg = name === "foreground" ? "background" : name.slice(0, -"-foreground".length)
      if (bg in theme) out.push({ fg: name, bg, kind: "text" })
    }
  }
  if ("foreground" in theme && "background" in theme) out.unshift({ fg: "foreground", bg: "background", kind: "text" })
  for (const [fg, kind] of [["muted-foreground", "text"], ["destructive", "text"], ["ring", "ui"]]) {
    if (fg in theme && "background" in theme && !out.some((p) => p.fg === fg && p.bg === "background")) {
      out.push({ fg, bg: "background", kind })
    }
  }
  return out
}

const MIN = { text: 4.5, ui: 3 }

export function contrastReport(tokens) {
  const report = []
  for (const [themeName, theme] of Object.entries(tokens.themes ?? {})) {
    for (const p of pairs(theme)) {
      const fg = parseOklch(resolve(theme[p.fg], tokens.primitives))
      const bg = parseOklch(resolve(theme[p.bg], tokens.primitives))
      if (!fg || !bg) continue
      const ratio = contrast(fg, bg)
      report.push({ theme: themeName, ...p, ratio: Math.round(ratio * 100) / 100, min: MIN[p.kind], pass: ratio >= MIN[p.kind] })
    }
  }
  return report
}
