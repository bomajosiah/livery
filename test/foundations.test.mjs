import { test } from "node:test"
import assert from "node:assert/strict"
import { parseColor, contrast, formatOklch, inGamut, parseOklch } from "../src/color.mjs"
import { toReference, resolve, generateScale, STEPS } from "../src/palette.mjs"
import { applyOperation } from "../src/edit.mjs"
import { contrastReport } from "../src/checks.mjs"

const palette = {
  base: { white: "oklch(1 0 0)", black: "oklch(0 0 0)" },
  neutral: { "50": "oklch(0.985 0 0)", "500": "oklch(0.556 0 0)", "900": "oklch(0.205 0 0)", "950": "oklch(0.145 0 0)" },
}

test("contrast matches WCAG at the extremes", () => {
  assert.equal(Math.round(contrast(parseColor("#000"), parseColor("#fff"))), 21)
  assert.equal(Math.round(contrast(parseColor("#777"), parseColor("#777")) * 100) / 100, 1)
})

test("theme values become primitive references and resolve back exactly", () => {
  assert.equal(toReference("oklch(0.205 0 0)", palette), "neutral.900")
  assert.equal(toReference("oklch(1 0 0 / 10%)", palette), "base.white / 10%")
  assert.equal(toReference("oklch(0.5 0.1 20)", palette), null)
  assert.equal(resolve("base.white / 10%", palette), "oklch(1 0 0 / 10%)")
  assert.equal(resolve("0.625rem", palette), "0.625rem")
})

test("a generated scale has 11 in-gamut steps, light to dark, through its seed", () => {
  const scale = generateScale({ seed: "#e8590c" })
  assert.deepEqual(Object.keys(scale), STEPS)
  const ls = Object.values(scale).map((v) => parseOklch(v).l)
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i] < ls[i - 1], `step ${STEPS[i]} is darker than ${STEPS[i - 1]}`)
  for (const v of Object.values(scale)) assert.ok(inGamut(parseOklch(v)), v)
  assert.ok(Object.values(scale).some((v) => Math.abs(parseOklch(v).l - parseColor("#e8590c").l) < 0.001), "passes through the seed")
})

test("operations validate references and regenerate scales", () => {
  const tokens = { primitives: structuredClone(palette), themes: { light: { primary: "neutral.900", "primary-foreground": "neutral.50" } }, theme: {} }
  assert.throws(() => applyOperation(tokens, "set_token", { theme: "light", name: "primary", value: "brand.600" }), /isn't a primitive/)
  applyOperation(tokens, "set_scale", { scale: "brand", seed: "#e8590c" })
  applyOperation(tokens, "set_token", { theme: "light", name: "primary", value: "brand.600" })
  assert.equal(tokens.themes.light.primary, "brand.600")
  assert.deepEqual(tokens.generators.brand, { seed: "#e8590c" })
  assert.throws(() => applyOperation(tokens, "nope", {}), /Unknown operation/)
})

test("contrast checks pair every role with its foreground", () => {
  const tokens = {
    primitives: palette,
    themes: { light: { background: "base.white", foreground: "neutral.950", muted: "neutral.50", "muted-foreground": "neutral.500" } },
  }
  const report = contrastReport(tokens)
  assert.ok(report.find((r) => r.fg === "foreground" && r.bg === "background" && r.pass))
  assert.ok(report.find((r) => r.fg === "muted-foreground" && r.bg === "muted"))
})
