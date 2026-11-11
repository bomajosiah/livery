// The studio: a local server for editing a system's foundations, with the real components
// rendered live by the project's own Vite (one frame per theme).
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { compileSystem } from "./system.mjs"
import { compileTheme } from "./theme.mjs"
import { loadTailwindPalette, resolve } from "./palette.mjs"
import { applyOperation } from "./edit.mjs"
import { contrastReport } from "./checks.mjs"
import { loadTailwindDefaults, GROUPS } from "./foundations.mjs"
import { computeReach, tokensOfClass } from "./reach.mjs"
import { applyRecipeOperation, readRecipe } from "./recipe-ops.mjs"
import { componentChecks, classLists } from "./component-checks.mjs"
import { oklchToHex, parseOklch } from "./color.mjs"

const UI = path.resolve(import.meta.dirname, "../studio")
const FIXTURES = path.resolve(import.meta.dirname, "../fixtures")
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }

export async function startStudio({ systemDir, projectDir, port = 5310, previewPort = port + 1 }) {
  const system = JSON.parse(fs.readFileSync(path.join(systemDir, "system.json"), "utf8"))
  const tokensFile = path.join(systemDir, "tokens.json")
  const palette = loadTailwindPalette(projectDir)
  const defaults = loadTailwindDefaults(projectDir)

  // Compile the whole system into the project once, then install the preview entry.
  compileSystem(systemDir, projectDir)
  const previewDir = path.join(projectDir, "livery-preview")
  fs.mkdirSync(previewDir, { recursive: true })
  for (const f of ["preview.tsx", "Specimen.tsx", "Sheet.tsx"]) fs.copyFileSync(path.join(FIXTURES, f), path.join(previewDir, f))
  // The variant sheets: for each component, its cva entries and the export that renders them.
  const writeSheets = () => {
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
  writeSheets()
  fs.copyFileSync(path.join(FIXTURES, "preview.html"), path.join(projectDir, "livery-preview.html"))

  const vite = spawn("npx", ["vite", "--port", String(previewPort), "--strictPort", "--clearScreen", "false"], {
    cwd: projectDir,
    stdio: ["ignore", "inherit", "inherit"],
  })
  process.on("exit", () => vite.kill())
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0))

  const readTokens = () => JSON.parse(fs.readFileSync(tokensFile, "utf8"))
  const writeTokens = (tokens) => {
    fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2) + "\n")
    const skeleton = fs.readFileSync(path.join(systemDir, "skeleton", system.paths.css), "utf8")
    fs.writeFileSync(path.join(projectDir, system.paths.css), compileTheme(tokens, skeleton))
  }

  // Everything the UI needs, with colours resolved to hex for swatches.
  const state = () => {
    const tokens = readTokens()
    const hex = (v) => {
      const c = parseOklch(resolve(v, tokens.primitives))
      return c ? { hex: oklchToHex(c), alpha: c.alpha ?? 1 } : null
    }
    const swatches = {}
    for (const [theme, values] of Object.entries(tokens.themes)) {
      swatches[theme] = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, hex(v)]))
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
      foundations: Object.fromEntries(Object.keys(defaults).map((k) => [k, tokens.foundations?.[k] ?? defaults[k]])),
      overridden: Object.keys(tokens.foundations ?? {}),
      reach: computeReach(systemDir, tokens),
      preview: `http://localhost:${previewPort}/livery-preview.html`,
    }
  }

  const colorNames = (tokens) => new Set(Object.values(tokens.themes ?? {}).flatMap((t) => Object.keys(t)))
  const componentList = (tokens) =>
    system.components.map((name) => {
      const recipe = readRecipe(systemDir, name)
      const checks = componentChecks(recipe)
      return {
        name,
        parts: Object.keys(recipe.parts ?? {}).length,
        variants: Object.values(recipe.cva ?? {}).reduce((n, e) => n + Object.keys(e.variants ?? {}).length, 0),
        checks: checks.length,
      }
    })
  const componentDetail = (name, tokens) => {
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

  const server = http.createServer(async (req, res) => {
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" })
      res.end(type === "application/json" ? JSON.stringify(body) : body)
    }
    try {
      const url = new URL(req.url, "http://localhost")
      if (url.pathname === "/api/state" && req.method === "GET") return send(200, state())
      if (url.pathname === "/api/components" && req.method === "GET") {
        const tokens = readTokens()
        return send(200, componentList(tokens))
      }
      const m = url.pathname.match(/^\/api\/components\/([a-z0-9-]+)$/)
      if (m && req.method === "GET") return send(200, componentDetail(m[1], readTokens()))
      if (url.pathname === "/api/recipe-op" && req.method === "POST") {
        let body = ""
        for await (const chunk of req) body += chunk
        const { op, args } = JSON.parse(body || "{}")
        applyRecipeOperation(systemDir, op, args, projectDir)
        writeSheets()
        return send(200, componentDetail(args.component, readTokens()))
      }
      if (url.pathname === "/api/op" && req.method === "POST") {
        let body = ""
        for await (const chunk of req) body += chunk
        const { op, args } = JSON.parse(body || "{}")
        const tokens = readTokens()
        applyOperation(tokens, op, args, { palette, defaults })
        writeTokens(tokens)
        return send(200, state())
      }
      const file = path.join(UI, url.pathname === "/" ? "index.html" : path.normalize(url.pathname))
      if (!file.startsWith(UI) || !fs.existsSync(file)) return send(404, "Not found", "text/plain")
      return send(200, fs.readFileSync(file), TYPES[path.extname(file)] ?? "application/octet-stream")
    } catch (e) {
      return send(e.status ?? 500, { error: e.message })
    }
  })
  await new Promise((r) => server.listen(port, "127.0.0.1", r))
  console.log(`Livery studio: http://localhost:${port} (preview on :${previewPort})`)
  return server
}
