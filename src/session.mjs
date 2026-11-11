// One open system: read it, apply named operations, compile the results into the project.
// The studio and the MCP server both work through this, so a person and an agent make the
// same edits with the same checks, and each sees the other's changes (everything is files).
import fs from "node:fs"
import path from "node:path"
import { compileSystem } from "./system.mjs"
import { compileTheme } from "./theme.mjs"
import { loadTailwindPalette, resolve } from "./palette.mjs"
import { applyOperation, operations } from "./edit.mjs"
import { contrastReport } from "./checks.mjs"
import { loadTailwindDefaults, GROUPS } from "./foundations.mjs"
import { computeReach, tokensOfClass } from "./reach.mjs"
import { applyRecipeOperation, readRecipe, writeRecipe, recipeOperations, compileComponentInto } from "./recipe-ops.mjs"
import { componentChecks, classLists } from "./component-checks.mjs"
import { oklchToHex, parseOklch } from "./color.mjs"

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures")

export const TOKEN_OPERATIONS = Object.keys(operations)
export const RECIPE_OPERATIONS = Object.keys(recipeOperations)

export function openSystem({ systemDir, projectDir }) {
  systemDir = path.resolve(systemDir)
  projectDir = path.resolve(projectDir)
  const system = JSON.parse(fs.readFileSync(path.join(systemDir, "system.json"), "utf8"))
  const tokensFile = path.join(systemDir, "tokens.json")
  const palette = loadTailwindPalette(projectDir)
  const defaults = loadTailwindDefaults(projectDir)
  const previewDir = path.join(projectDir, "livery-preview")

  const readTokens = () => JSON.parse(fs.readFileSync(tokensFile, "utf8"))
  const writeTokens = (tokens) => {
    fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2) + "\n")
    const skeleton = fs.readFileSync(path.join(systemDir, "skeleton", system.paths.css), "utf8")
    fs.writeFileSync(path.join(projectDir, system.paths.css), compileTheme(tokens, skeleton))
  }

  // The variant sheets: for each component, its cva entries and the export that renders them.
  const writeSheets = () => {
    if (!fs.existsSync(previewDir)) return
    const sheets = {}
    for (const name of system.components) {
      const recipe = readRecipe(systemDir, name)
      const entries = Object.entries(recipe.cva ?? {})
        .filter(([, e]) => e.usedBy?.length && Object.keys(e.variants ?? {}).length)
        .map(([cva, e]) => ({ cva, export: e.usedBy[0], variants: Object.fromEntries(Object.entries(e.variants).map(([d, keys]) => [d, Object.keys(keys)])), defaults: e.defaults ?? {} }))
      if (entries.length) sheets[name] = entries
    }
    const file = path.join(previewDir, "sheets.json")
    const text = JSON.stringify(sheets, null, 2) + "\n"
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) fs.writeFileSync(file, text)
  }

  /** Compile the whole system into the project and install the preview entry. */
  const installPreview = () => {
    compileSystem(systemDir, projectDir)
    fs.mkdirSync(previewDir, { recursive: true })
    for (const f of ["preview.tsx", "Specimen.tsx", "Sheet.tsx"]) fs.copyFileSync(path.join(FIXTURES, f), path.join(previewDir, f))
    fs.copyFileSync(path.join(FIXTURES, "preview.html"), path.join(projectDir, "livery-preview.html"))
    writeSheets()
  }

  const tokenOp = (op, args) => {
    const tokens = readTokens()
    applyOperation(tokens, op, args ?? {}, { palette, defaults })
    writeTokens(tokens)
    return tokens
  }

  const recipeOp = (op, args) => {
    const recipe = applyRecipeOperation(systemDir, op, args ?? {}, projectDir)
    writeSheets()
    return recipe
  }

  // Several operations at once, all or nothing: if one fails, nothing is written.
  const tokenOps = (ops) => {
    const tokens = readTokens()
    ops.forEach(({ op, args }, i) => {
      try {
        applyOperation(tokens, op, args ?? {}, { palette, defaults })
      } catch (e) {
        e.message = `Operation ${i + 1} (${op}): ${e.message}. Nothing was changed.`
        throw e
      }
    })
    writeTokens(tokens)
    return tokens
  }

  const recipeOps = (component, ops) => {
    const recipe = readRecipe(systemDir, component)
    ops.forEach(({ op, args }, i) => {
      const fn = recipeOperations[op]
      try {
        if (!fn) throw Object.assign(new Error(`Unknown operation ${op}`), { status: 400 })
        fn(recipe, { ...(args ?? {}), component })
      } catch (e) {
        e.message = `Operation ${i + 1} (${op}): ${e.message}. Nothing was changed.`
        throw e
      }
    })
    writeRecipe(systemDir, component, recipe)
    compileComponentInto(systemDir, component, projectDir)
    writeSheets()
    return recipe
  }

  const hexOf = (tokens, v) => {
    const c = parseOklch(resolve(v, tokens.primitives))
    return c ? { hex: oklchToHex(c), alpha: c.alpha ?? 1 } : null
  }

  // Everything the studio's UI needs, with colours resolved to hex for swatches.
  const state = () => {
    const tokens = readTokens()
    const swatches = {}
    for (const [theme, values] of Object.entries(tokens.themes)) {
      swatches[theme] = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, hexOf(tokens, v)]))
    }
    const scales = Object.fromEntries(
      Object.entries(tokens.primitives ?? {}).map(([s, steps]) => [s, Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, { value: v, hex: oklchToHex(parseOklch(v)) }]))]),
    )
    return {
      name: path.basename(systemDir),
      source: system.source,
      tokens,
      swatches,
      scales,
      paletteScales: Object.keys(palette).filter((s) => s !== "base"),
      checks: contrastReport(tokens),
      defaults,
      groups: GROUPS,
      foundations: effectiveFoundations(tokens),
      overridden: Object.keys(tokens.foundations ?? {}),
      reach: computeReach(systemDir, tokens),
      version: version(),
    }
  }

  const effectiveFoundations = (tokens) => Object.fromEntries(Object.keys(defaults).map((k) => [k, tokens.foundations?.[k] ?? defaults[k]]))

  const colorNames = (tokens) => new Set(Object.values(tokens.themes ?? {}).flatMap((t) => Object.keys(t)))

  const componentList = () =>
    system.components.map((name) => {
      const recipe = readRecipe(systemDir, name)
      return {
        name,
        parts: Object.keys(recipe.parts ?? {}).length,
        variants: Object.values(recipe.cva ?? {}).reduce((n, e) => n + Object.keys(e.variants ?? {}).length, 0),
        checks: componentChecks(recipe).length,
      }
    })

  const componentDetail = (name) => {
    const tokens = readTokens()
    const recipe = readRecipe(systemDir, name)
    const names = colorNames(tokens)
    const used = {}
    for (const [, value] of classLists(recipe)) {
      for (const cls of Array.isArray(value) ? value : value.raw.split(/\s+/)) {
        for (const t of tokensOfClass(cls, names)) used[t] = (used[t] ?? 0) + 1
      }
    }
    return { name, recipe, checks: componentChecks(recipe), tokens: used }
  }

  // Changes on disk (from the studio, an agent or a person editing files), as one number.
  const version = () => {
    let v = fs.statSync(tokensFile).mtimeMs
    const dir = path.join(systemDir, "components")
    for (const f of fs.readdirSync(dir)) v = Math.max(v, fs.statSync(path.join(dir, f)).mtimeMs)
    return v
  }

  return {
    systemDir, projectDir, system, palette, defaults, previewDir,
    readTokens, writeTokens, writeSheets, installPreview, tokenOp, recipeOp, tokenOps, recipeOps,
    state, componentList, componentDetail, effectiveFoundations, hexOf, version,
    compile: (into = projectDir) => compileSystem(systemDir, path.resolve(into)),
  }
}
