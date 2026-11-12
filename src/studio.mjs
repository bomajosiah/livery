// The studio: a local server for editing a system, with the real components rendered live
// by the project's own Vite (one frame per theme). Agents edit the same files through the
// MCP server; the UI picks their changes up from /api/version.
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { openSystem } from "./session.mjs"

const UI = path.resolve(import.meta.dirname, "../studio")
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }

/** Run the project's Vite on a port; resolves once it answers. */
export async function startPreview(projectDir, port, { quiet = false } = {}) {
  const vite = spawn("npx", ["vite", "--port", String(port), "--strictPort", "--clearScreen", "false"], {
    cwd: projectDir,
    stdio: ["ignore", quiet ? "ignore" : "inherit", quiet ? "ignore" : "inherit"],
  })
  process.on("exit", () => vite.kill())
  const url = `http://localhost:${port}/livery-preview.html`
  const t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    if (vite.exitCode !== null) throw new Error(`Vite exited (${vite.exitCode}); is port ${port} free?`)
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return { url, vite }
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("Vite didn't start in 30s")
}

export async function startStudio({ systemDir, projectDir, port = 5310, previewPort = port + 1 }) {
  const s = openSystem({ systemDir, projectDir })
  s.installPreview()
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0))
  const { url: preview } = await startPreview(s.projectDir, previewPort)

  const readBody = async (req) => {
    let body = ""
    for await (const chunk of req) body += chunk
    return JSON.parse(body || "{}")
  }

  const server = http.createServer(async (req, res) => {
    const send = (status, body, type = "application/json") => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" })
      res.end(type === "application/json" ? JSON.stringify(body) : body)
    }
    try {
      const url = new URL(req.url, "http://localhost")
      if (url.pathname === "/api/meta") return send(200, { tool: "livery", systemDir: s.systemDir, projectDir: s.projectDir, preview })
      if (url.pathname === "/api/version") return send(200, { version: s.version() })
      if (url.pathname === "/api/state" && req.method === "GET") return send(200, { ...s.state(), preview })
      if (url.pathname === "/api/brief" && req.method === "POST") {
        s.writeBrief((await readBody(req)).text)
        return send(200, { brief: s.readBrief() })
      }
      if (url.pathname === "/api/directions" && req.method === "GET") {
        const origin = new URL(preview).origin
        return send(200, { brief: s.readBrief(), directions: s.listDirections().map((d) => { const x = s.showDirection(d); return { ...x, preview: `${origin}/${x.preview}` } }) })
      }
      const dm = url.pathname.match(/^\/api\/directions\/([a-z0-9-]+)(\/apply)?$/)
      if (dm && req.method === "POST" && dm[2]) {
        s.applyDirection(dm[1])
        return send(200, { ok: true })
      }
      if (dm && req.method === "DELETE") {
        s.deleteDirection(dm[1])
        return send(200, { ok: true })
      }
      if (url.pathname === "/api/components" && req.method === "GET") return send(200, s.componentList())
      const m = url.pathname.match(/^\/api\/components\/([a-z0-9-]+)$/)
      if (m && req.method === "GET") return send(200, s.componentDetail(m[1]))
      if (url.pathname === "/api/recipe-op" && req.method === "POST") {
        const { op, args } = await readBody(req)
        s.recipeOp(op, args)
        return send(200, s.componentDetail(args.component))
      }
      if (url.pathname === "/api/op" && req.method === "POST") {
        const { op, args } = await readBody(req)
        s.tokenOp(op, args)
        return send(200, { ...s.state(), preview })
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
