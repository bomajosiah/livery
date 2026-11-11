import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { foundationsCss, typeScale, shadowScale, loadTailwindDefaults, FOUNDATION_NAMES, MARKER } from "../src/foundations.mjs"
import { compileTheme } from "../src/theme.mjs"
import { applyOperation } from "../src/edit.mjs"
import { tokensOfClass } from "../src/reach.mjs"

test("no overrides compiles to nothing extra; overrides become one @theme block", () => {
  assert.equal(foundationsCss({}), "")
  assert.equal(foundationsCss(undefined), "")
  const css = foundationsCss({ spacing: "0.3rem", "ease-out": "linear" })
  assert.ok(css.includes(MARKER))
  assert.ok(css.includes("@theme {\n  --spacing: 0.3rem;\n  --ease-out: linear;\n}"))
  assert.equal(compileTheme({ themes: {}, theme: {}, foundations: { spacing: "0.3rem" } }, "a {}\n"), "a {}\n" + css.replace("  --ease-out: linear;\n", ""))
})

test("a type scale steps by the ratio around the base", () => {
  const t = typeScale({ base: 1, ratio: 1.25 })
  assert.equal(t["text-base"], "1rem")
  assert.equal(t["text-lg"], "1.25rem")
  assert.equal(t["text-sm"], "0.8rem")
  assert.equal(t["text-xs"], "0.64rem")
})

test("shadows keep their geometry and take the new tint and strength", () => {
  const defaults = { "shadow-sm": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)" }
  const s = shadowScale(defaults, { intensity: 2, color: "#000" })
  assert.equal(s["shadow-sm"], "0 1px 3px 0 oklch(0 0 0 / 0.2), 0 1px 2px -1px oklch(0 0 0 / 0.2)")
})

test("foundation operations validate names and reset by group", () => {
  const tokens = { themes: { light: {} }, theme: {} }
  assert.throws(() => applyOperation(tokens, "set_foundation", { name: "color-red-500", value: "red" }), /isn't a foundation/)
  applyOperation(tokens, "set_foundation", { name: "spacing", value: "0.3rem" })
  applyOperation(tokens, "set_type_scale", { base: 1, ratio: 1.2 })
  assert.equal(tokens.foundations.spacing, "0.3rem")
  assert.deepEqual(tokens.generators["@type"], { base: 1, ratio: 1.2 })
  applyOperation(tokens, "reset_foundation", { group: "type" })
  assert.equal(tokens.generators["@type"], undefined)
  assert.deepEqual(Object.keys(tokens.foundations), ["spacing"])
  applyOperation(tokens, "reset_foundation", { names: ["spacing"] })
  assert.equal(tokens.foundations, undefined)
})

test("reach reads tokens out of classes, through variants and arbitrary values", () => {
  const roles = new Set(["primary", "primary-foreground", "ring", "secondary", "foreground"])
  assert.deepEqual(tokensOfClass("hover:bg-primary/80", roles), ["primary"])
  assert.deepEqual(tokensOfClass("text-primary-foreground", roles), ["primary-foreground"])
  assert.deepEqual(tokensOfClass("focus-visible:ring-ring/50", roles), ["ring"])
  assert.deepEqual(tokensOfClass("hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]", roles), ["secondary", "foreground"])
  assert.deepEqual(tokensOfClass("has-data-[icon=inline-end]:pr-2", roles), ["spacing"])
  assert.deepEqual(tokensOfClass("[&_svg:not([class*='size-'])]:size-4", roles), ["spacing"])
  assert.deepEqual(tokensOfClass("text-sm", roles), ["text-sm"])
  assert.deepEqual(tokensOfClass("rounded-[min(var(--radius-md),10px)]", roles), [])
  assert.deepEqual(tokensOfClass("shadow-md", roles), ["shadow-md"])
})

const stock = path.resolve(import.meta.dirname, "../.work/stock")
test("Tailwind defaults load for every foundation", { skip: !fs.existsSync(stock) && "run `npm run baseline` first" }, () => {
  const d = loadTailwindDefaults(stock)
  assert.deepEqual(FOUNDATION_NAMES.filter((n) => !(n in d)), [])
  assert.equal(d.spacing, "0.25rem")
})
