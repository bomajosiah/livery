#!/usr/bin/env node
import path from "node:path"
import { decompileProject, compileSystem } from "../src/system.mjs"
import { startStudio } from "../src/studio.mjs"
import { startMcp } from "../src/mcp.mjs"

const [cmd, ...args] = process.argv.slice(2)
const usage = `livery <command>

  decompile <shadcn-project> [--to <system-dir>]   lift every token and class string into a system
  compile <system-dir> --into <project>            write the system back as shadcn source
  studio <system-dir> --project <project> [--port 5310]
                                                   edit the system with a live preview
  mcp <system-dir> --project <project>             the same edits for agents, over MCP (stdio)`

const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}

if (cmd === "decompile" && args[0]) {
  const project = path.resolve(args[0])
  const to = path.resolve(flag("--to", path.join(project, "system")))
  const r = decompileProject(project, to)
  console.log(`${r.components} components, ${r.liftedClassStrings} class strings, ${r.liftedTokens} tokens → ${to}`)
  const left = Object.entries(r.unlifted)
  if (left.length) {
    console.log(`Class-like strings left in source (${left.reduce((n, [, l]) => n + l.length, 0)}):`)
    for (const [f, l] of left) console.log(`  ${f}: ${l.map((s) => JSON.stringify(s.slice(0, 60))).join(", ")}`)
  }
} else if (cmd === "compile" && args[0] && flag("--into")) {
  const written = compileSystem(path.resolve(args[0]), path.resolve(flag("--into")))
  console.log(`Wrote ${written.length} files`)
} else if (cmd === "studio" && args[0] && flag("--project")) {
  await startStudio({ systemDir: path.resolve(args[0]), projectDir: path.resolve(flag("--project")), port: Number(flag("--port", 5310)) })
} else if (cmd === "mcp" && args[0] && flag("--project")) {
  await startMcp({ systemDir: path.resolve(args[0]), projectDir: path.resolve(flag("--project")) })
} else {
  console.log(usage)
  process.exit(cmd ? 1 : 0)
}
