// livery mcp: the studio's actions as an MCP server (stdio), so an agent can read a system,
// edit it with the same named operations a person uses, check it, and look at the result.
// Edits go to the system's files and compile into the project, so an open studio shows
// them live. Screenshots use the open studio's preview, or start one.
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { createInterface } from "node:readline"
import { openSystem, TOKEN_OPERATIONS, RECIPE_OPERATIONS } from "./session.mjs"
import { contrastReport } from "./checks.mjs"
import { componentChecks } from "./component-checks.mjs"
import { GROUPS } from "./foundations.mjs"
import { startPreview } from "./studio.mjs"
import { screenshot } from "./browser.mjs"

const VERSION = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version

const TOKEN_OPS_HELP = `Token operations (args):
- set_token { theme: "light"|"dark", name: "primary", value } — value is a primitive reference ("brand.600", "neutral.950 / 10%"), a colour, or any CSS value
- set_theme_var { name: "radius" | "font-sans" | …, value } — @theme variables (see get_tokens section "theme")
- set_scale { scale: "brand", seed: "#4f46e5" } or { scale, hue: 260, chroma: 0.02 } — create or regenerate an 11-step primitive scale (50–950)
- add_palette_scale { scale: "emerald" } — copy a Tailwind palette scale into the system
- set_step { scale, step: "500", value: "#4f46e5" } — set one step by hand
- set_foundation { name, value } — override a Tailwind foundation: spacing, text-sm, text-sm--line-height, font-weight-medium, tracking-tight, shadow-md, default-transition-duration, ease-out…
- reset_foundation { names: [...] } or { group: ${Object.keys(GROUPS).map((g) => `"${g}"`).join(" | ")} } — back to Tailwind's defaults
- set_type_scale { base: 1, ratio: 1.2 } — modular type scale (base in rem)
- set_shadows { intensity: 0–4, color: "neutral.950" } — Tailwind's shadows re-weighted and re-tinted`

const RECIPE_OPS_HELP = `Component operations (args). Paths name a class list, as get_component shows them:
parts.<slot> · cva.<name>.base · cva.<name>.variants.<variant>.<key> · cva.<name>.compound.<i>
- set_classes { path, classes: ["h-8", "px-3"] } — replace a class list
- add_classes { path, classes: ["shadow-sm"] }
- remove_class { path, class: "rounded-lg" }
- replace_class { from: "duration-100", to: "duration-200" } — everywhere in the component
- add_variant_key { cva, variant: "size", key: "xl", copyFrom: "lg" } (or classes: [...])
- remove_variant_key { cva, variant, key } — not the default, not one a compound variant uses
- set_default { cva, variant, key }
Classes keep their conditions as written (hover:, dark:, data-[state=open]:, has-[>svg]:…).`

async function freePort(start) {
  for (let p = start; p < start + 50; p++) {
    const ok = await new Promise((r) => {
      const srv = net.createServer().once("error", () => r(false)).once("listening", () => srv.close(() => r(true)))
      srv.listen(p, "127.0.0.1")
    })
    if (ok) return p
  }
  throw new Error("No free port for the preview")
}

// An open studio for the same system, so screenshots share its preview (and the person sees the same thing).
async function findStudio(systemDir) {
  for (let p = 5310; p <= 5340; p += 2) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/api/meta`, { signal: AbortSignal.timeout(300) })
      const m = await r.json()
      if (m.tool === "livery" && path.resolve(m.systemDir) === systemDir) return { studio: `http://localhost:${p}`, preview: m.preview }
    } catch {}
  }
  return null
}

export async function startMcp({ systemDir, projectDir }) {
  // stdout is the protocol; everything else goes to stderr.
  console.log = (...a) => console.error(...a)
  const s = openSystem({ systemDir, projectDir })

  let preview = null
  const previewUrl = async () => {
    const studio = await findStudio(s.systemDir)
    if (studio) return studio.preview
    if (!preview) {
      s.installPreview()
      preview = (await startPreview(s.projectDir, await freePort(5390), { quiet: true })).url
      console.error(`livery mcp: started a preview at ${preview}`)
    }
    return preview
  }

  const text = (t) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t, null, 2) }] })
  const failures = (tokens) => contrastReport(tokens).filter((r) => !r.pass)
  const failText = (list) => (list.length ? list.map((r) => `${r.theme}: ${r.fg} on ${r.bg} ${r.ratio}:1 (needs ${r.min})`).join("\n") : "none")

  const TOOLS = [
    {
      name: "get_system",
      description: "Start here. The system's shape: themes and their colour roles, primitive scales, foundations overridden from Tailwind, components, contrast failures, studio link if one is open, and the operations you can run with edit_tokens and edit_component.",
      inputSchema: { type: "object", properties: {} },
      run: async () => {
        const tokens = s.readTokens()
        const list = s.componentList()
        const studio = await findStudio(s.systemDir)
        return text(
          [
            `System ${path.basename(s.systemDir)} (from shadcn ${s.system.source?.style ?? ""}${s.system.source?.baseUi ? ", Base UI" : ""}) compiling into ${s.projectDir}`,
            studio ? `Studio open at ${studio.studio}: the person sees your edits live.` : "No studio open. Start one with: livery studio <system> --project <project>",
            `Themes: ${Object.entries(tokens.themes).map(([t, v]) => `${t} (${Object.keys(v).length} roles)`).join(", ")}`,
            `Scales: ${Object.keys(tokens.primitives ?? {}).join(", ")}${tokens.generators ? ` · generated: ${Object.keys(tokens.generators).join(", ")}` : ""}`,
            `Foundations overridden: ${Object.keys(tokens.foundations ?? {}).join(", ") || "none (Tailwind defaults)"}`,
            `Components: ${list.length}; ${list.reduce((n, c) => n + c.checks, 0)} classes bypass the system (see check)`,
            `Contrast failures:\n${failText(failures(tokens))}`,
            "",
            TOKEN_OPS_HELP,
            "",
            RECIPE_OPS_HELP,
          ].join("\n"),
        )
      },
    },
    {
      name: "get_tokens",
      description: "Token values. roles: each theme's colour roles as written (a reference like brand.600 or a colour) with the resolved hex, and which components use each. scales: primitive scales. foundations: spacing, type, weights, tracking, shadows, motion (effective value, and whether overridden). theme: @theme variables such as radius and fonts.",
      inputSchema: {
        type: "object",
        properties: {
          section: { type: "string", enum: ["roles", "scales", "foundations", "theme", "all"], description: "Default roles" },
          theme: { type: "string", description: "Only this theme's roles, e.g. dark" },
          scale: { type: "string", description: "Only this scale" },
        },
      },
      run: async ({ section = "roles", theme, scale }) => {
        const st = s.state()
        const out = {}
        if (section === "roles" || section === "all") {
          out.roles = {}
          for (const [t, values] of Object.entries(st.tokens.themes)) {
            if (theme && t !== theme) continue
            out.roles[t] = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, hex: st.swatches[t][k]?.hex, ...(st.swatches[t][k]?.alpha < 1 ? { alpha: st.swatches[t][k].alpha } : {}), usedBy: st.reach[k]?.components.length ?? 0 }]))
          }
        }
        if (section === "scales" || section === "all") {
          out.scales = Object.fromEntries(Object.entries(st.scales).filter(([k]) => !scale || k === scale).map(([k, steps]) => [k, Object.fromEntries(Object.entries(steps).map(([n, v]) => [n, `${v.value} ${v.hex}`]))]))
          if (!scale) out.tailwindScales = st.paletteScales
        }
        if (section === "foundations" || section === "all") {
          out.foundations = Object.fromEntries(Object.entries(st.groups).map(([g, names]) => [g, Object.fromEntries(names.filter((n) => n in st.foundations).map((n) => [n, st.overridden.includes(n) ? `${st.foundations[n]} (overridden)` : st.foundations[n]]))]))
        }
        if (section === "theme" || section === "all") out.theme = st.tokens.theme
        return text(out)
      },
    },
    {
      name: "edit_tokens",
      description: `Edit tokens with named operations, applied in order and all or nothing. Compiles the project's CSS. Returns contrast failures after the edit.\n\n${TOKEN_OPS_HELP}`,
      inputSchema: {
        type: "object",
        required: ["ops"],
        properties: {
          ops: {
            type: "array",
            items: { type: "object", required: ["op"], properties: { op: { type: "string", enum: TOKEN_OPERATIONS }, args: { type: "object" } } },
          },
        },
      },
      run: async ({ ops }) => {
        if (!Array.isArray(ops) || !ops.length) throw new Error("Give ops: [{ op, args }]")
        const before = failures(s.readTokens()).length
        const tokens = s.tokenOps(ops)
        const after = failures(tokens)
        return text(`Applied ${ops.length} operation${ops.length > 1 ? "s" : ""}. Contrast failures: ${before} → ${after.length}\n${after.length ? failText(after) : ""}`.trim())
      },
    },
    {
      name: "list_components",
      description: "The system's components: parts (data-slot class lists), variant dimensions, and how many classes bypass the system.",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
      run: async ({ query = "" }) => {
        const list = s.componentList().filter((c) => c.name.includes(query.toLowerCase()))
        return text(list.map((c) => `${c.name} · ${c.parts} parts · ${c.variants} variants${c.checks ? ` · ${c.checks} bypass` : ""}`).join("\n"))
      },
    },
    {
      name: "get_component",
      description: "One component's recipe: every class list by path (parts, cva base, variants, compound), variant defaults and the functions using each cva, the colour roles and foundations it uses, and classes that bypass the system.",
      inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string", description: "e.g. button, card, dropdown-menu" } } },
      run: async ({ name }) => {
        const d = s.componentDetail(name)
        const lists = {}
        const flat = (v) => (Array.isArray(v) ? v.join(" ") : v.raw)
        for (const [slot, v] of Object.entries(d.recipe.parts ?? {})) lists[`parts.${slot}`] = flat(v)
        const cva = {}
        for (const [n, e] of Object.entries(d.recipe.cva ?? {})) {
          if (e.base) lists[`cva.${n}.base`] = flat(e.base)
          for (const [dim, keys] of Object.entries(e.variants ?? {})) for (const [k, v] of Object.entries(keys)) lists[`cva.${n}.variants.${dim}.${k}`] = flat(v)
          for (const [i, v] of Object.entries(e.compound ?? {})) lists[`cva.${n}.compound.${i}`] = flat(v)
          cva[n] = { variants: Object.fromEntries(Object.entries(e.variants ?? {}).map(([dim, keys]) => [dim, Object.keys(keys)])), defaults: e.defaults ?? {}, usedBy: e.usedBy ?? [] }
        }
        return text({ name, cva, classLists: lists, uses: d.tokens, bypass: d.checks })
      },
    },
    {
      name: "edit_component",
      description: `Edit one component's recipe with named operations, applied in order and all or nothing. Compiles the component's source into the project. Returns its checks after the edit.\n\n${RECIPE_OPS_HELP}`,
      inputSchema: {
        type: "object",
        required: ["component", "ops"],
        properties: {
          component: { type: "string" },
          ops: {
            type: "array",
            items: { type: "object", required: ["op"], properties: { op: { type: "string", enum: RECIPE_OPERATIONS }, args: { type: "object" } } },
          },
        },
      },
      run: async ({ component, ops }) => {
        if (!Array.isArray(ops) || !ops.length) throw new Error("Give ops: [{ op, args }]")
        const recipe = s.recipeOps(component, ops)
        const checks = componentChecks(recipe)
        return text(`Applied ${ops.length} operation${ops.length > 1 ? "s" : ""} to ${component}. ${checks.length ? `${checks.length} classes bypass the system:\n${checks.map((c) => `${c.path}: ${c.class} (${c.kind})`).join("\n")}` : "Nothing bypasses the system."}`)
      },
    },
    {
      name: "check",
      description: "Checks: WCAG contrast for every text-on-surface pair in each theme (4.5:1 text, 3:1 ring), and classes in components that bypass the system (Tailwind palette colours, raw colours, one-off sizes, fixed durations). Give a component for its list; otherwise totals per component.",
      inputSchema: { type: "object", properties: { component: { type: "string" }, all: { type: "boolean", description: "Include contrast pairs that pass" } } },
      run: async ({ component, all = false }) => {
        const report = contrastReport(s.readTokens())
        const shown = all ? report : report.filter((r) => !r.pass)
        const contrast = shown.map((r) => `${r.pass ? "pass" : "FAIL"} ${r.theme}: ${r.fg} on ${r.bg} ${r.ratio}:1 (needs ${r.min})`).join("\n") || "All pairs pass."
        let comps
        if (component) {
          const c = s.componentDetail(component).checks
          comps = c.length ? c.map((x) => `${x.path}: ${x.class} (${x.kind})`).join("\n") : "Nothing bypasses the system."
        } else {
          const kinds = {}
          const by = []
          for (const c of s.componentList()) {
            if (!c.checks) continue
            const list = s.componentDetail(c.name).checks
            for (const x of list) kinds[x.kind] = (kinds[x.kind] ?? 0) + 1
            by.push(`${c.name} ${c.checks}`)
          }
          comps = `${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ") || "none"}\n${by.join(" · ")}`
        }
        return text(`Contrast (${report.length - report.filter((r) => !r.pass).length}/${report.length} pass):\n${contrast}\n\nComponents:\n${comps}`)
      },
    },
    {
      name: "screenshot",
      description: "Look at the result, rendered by the project's own Vite with the current system. With a component that has variants: its sheet (every variant × size, plus disabled). Otherwise the specimen page (buttons, badges, form card, team card, alert, table), optionally with one part (a data-slot) outlined. Light, dark, or both.",
      inputSchema: {
        type: "object",
        properties: {
          component: { type: "string", description: "e.g. button. Omit for the specimen" },
          part: { type: "string", description: "A data-slot to outline, e.g. card-header" },
          theme: { type: "string", enum: ["light", "dark", "both"], description: "Default light" },
          width: { type: "number", description: "Viewport width; default 1000" },
        },
      },
      run: async ({ component = "", part = "", theme = "light", width = 1000 }) => {
        if (component) s.componentDetail(component) // fails clearly on an unknown name
        const base = await previewUrl()
        const content = []
        for (const t of theme === "both" ? ["light", "dark"] : [theme]) {
          const q = new URLSearchParams({ theme: t, ...(component ? { component } : {}), ...(part ? { part } : {}) })
          const shot = await screenshot(`${base}?${q}`, { width, height: 900, maxHeight: 3000, scale: 0.5 })
          if (shot.error) content.push({ type: "text", text: `${t}: ${shot.error}` })
          if (shot.png) content.push({ type: "text", text: `${t}${component ? ` · ${component}` : " · specimen"}${shot.ready && component && !shot.ready.found ? " (not on screen)" : ""}` }, { type: "image", data: shot.png, mimeType: "image/png" })
        }
        return { content }
      },
    },
    {
      name: "compile",
      description: "Write the system out as shadcn source (components and CSS). Edits already compile into the working project; use this to write into another project.",
      inputSchema: { type: "object", properties: { into: { type: "string", description: "Project directory; default the working project" } } },
      run: async ({ into }) => {
        const written = s.compile(into ?? s.projectDir)
        return text(`Wrote ${written.length} files into ${path.resolve(into ?? s.projectDir)}`)
      },
    },
  ]

  const rl = createInterface({ input: process.stdin })
  const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n")
  rl.on("line", async (line) => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const { id, method, params } = msg
    const reply = (result) => id !== undefined && write({ jsonrpc: "2.0", id, result })
    try {
      if (method === "initialize")
        return reply({
          protocolVersion: params?.protocolVersion || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "livery", version: VERSION },
          instructions: "Livery holds a design system lifted from shadcn: tokens (colour roles, scales, foundations) and every component's classes. Call get_system first. Edit only through edit_tokens and edit_component (never the compiled files), then check and screenshot to see the result.",
        })
      if (method === "ping") return reply({})
      if (method === "tools/list") return reply({ tools: TOOLS.map(({ run, ...t }) => t) })
      if (method === "tools/call") {
        const tool = TOOLS.find((t) => t.name === params?.name)
        if (!tool) return reply({ content: [{ type: "text", text: `No tool ${params?.name}` }], isError: true })
        try {
          return reply(await tool.run(params.arguments ?? {}))
        } catch (e) {
          return reply({ content: [{ type: "text", text: e.message }], isError: true })
        }
      }
      if (id !== undefined) write({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` } })
    } catch (e) {
      if (id !== undefined) write({ jsonrpc: "2.0", id, error: { code: -32603, message: e.message } })
    }
  })
  rl.on("close", () => process.exit(0))
}
