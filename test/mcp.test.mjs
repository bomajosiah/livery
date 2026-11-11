import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { decompileProject } from "../src/system.mjs"

const stock = path.resolve(import.meta.dirname, "../.work/stock")
const bin = path.resolve(import.meta.dirname, "../bin/livery.mjs")

// A client over stdio: send JSON-RPC lines, match replies by id.
function client(args) {
  const proc = spawn(process.execPath, [bin, "mcp", ...args], { stdio: ["pipe", "pipe", "ignore"] })
  const waiting = new Map()
  createInterface({ input: proc.stdout }).on("line", (l) => {
    const m = JSON.parse(l)
    waiting.get(m.id)?.(m)
  })
  let id = 0
  const request = (method, params) =>
    new Promise((ok) => {
      const n = ++id
      waiting.set(n, ok)
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n")
    })
  const call = async (name, args = {}) => (await request("tools/call", { name, arguments: args })).result
  return { request, call, close: () => proc.kill() }
}

test("an agent reads, edits and checks a system over MCP", { skip: !fs.existsSync(stock) && "run npm run baseline first" }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "livery-mcp-"))
  const project = path.join(tmp, "project")
  fs.mkdirSync(project)
  fs.cpSync(path.join(stock, "src"), path.join(project, "src"), { recursive: true })
  for (const f of ["components.json", "package.json"]) fs.copyFileSync(path.join(stock, f), path.join(project, f))
  fs.symlinkSync(path.join(stock, "node_modules"), path.join(project, "node_modules"))
  const system = path.join(tmp, "system")
  decompileProject(project, system)

  const c = client([system, "--project", project])
  try {
    const init = await c.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } })
    assert.equal(init.result.serverInfo.name, "livery")
    const { result } = await c.request("tools/list")
    assert.deepEqual(result.tools.map((t) => t.name), ["get_system", "get_tokens", "edit_tokens", "list_components", "get_component", "edit_component", "check", "screenshot", "compile"])

    const overview = (await c.call("get_system")).content[0].text
    assert.match(overview, /Components: \d+/)

    // Tokens: a brand scale, used for primary; the CSS compiles with it.
    const edited = await c.call("edit_tokens", { ops: [
      { op: "set_scale", args: { scale: "brand", seed: "#4f46e5" } },
      { op: "set_token", args: { theme: "light", name: "primary", value: "brand.600" } },
    ] })
    assert.ok(!edited.isError, edited.content[0].text)
    const tokens = JSON.parse(fs.readFileSync(path.join(system, "tokens.json"), "utf8"))
    assert.equal(tokens.themes.light.primary, "brand.600")
    assert.match(fs.readFileSync(path.join(project, "src/index.css"), "utf8"), new RegExp(tokens.primitives.brand["600"].replace(/[()]/g, "\\$&")))

    // All or nothing: a bad second operation leaves the first unapplied.
    const bad = await c.call("edit_tokens", { ops: [
      { op: "set_token", args: { theme: "light", name: "primary", value: "brand.700" } },
      { op: "set_token", args: { theme: "light", name: "no-such-role", value: "brand.700" } },
    ] })
    assert.equal(bad.isError, true)
    assert.match(bad.content[0].text, /Operation 2 \(set_token\).*Nothing was changed/)
    assert.equal(JSON.parse(fs.readFileSync(path.join(system, "tokens.json"), "utf8")).themes.light.primary, "brand.600")

    // Components: a new size and a rounder base, compiled into the source.
    const comp = await c.call("edit_component", { component: "button", ops: [
      { op: "add_variant_key", args: { cva: "buttonVariants", variant: "size", key: "xl", copyFrom: "lg" } },
      { op: "replace_class", args: { from: "rounded-lg", to: "rounded-full" } },
    ] })
    assert.ok(!comp.isError, comp.content[0].text)
    const source = fs.readFileSync(path.join(project, "src/components/ui/button.tsx"), "utf8")
    assert.match(source, /\n\s+xl: "/)
    assert.match(source, /rounded-full/)
    const detail = JSON.parse((await c.call("get_component", { name: "button" })).content[0].text)
    assert.ok(detail.cva.buttonVariants.variants.size.includes("xl"))
    assert.ok("cva.buttonVariants.variants.size.xl" in detail.classLists)

    const unknown = await c.call("get_component", { name: "nope" })
    assert.equal(unknown.isError, true)

    assert.match((await c.call("check")).content[0].text, /Contrast \(\d+\/\d+ pass\)/)
  } finally {
    c.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
