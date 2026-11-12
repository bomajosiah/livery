# Livery: the approach

2026-11-11 · Status: **S0 (round trip) passing. S1 (foundations) built:** primitive scales and references, ramp generation, contrast checks, spacing, type scale, weights, elevation, motion, token reach, and a studio for all of it with a live light and dark preview. **S2 (components) built:** class editing for every part, variant and state; add and remove variant keys; change defaults (written to `defaultVariants` and each user's parameter default); replace a class across a component; checks for palette colours, raw colours, one-off sizes and fixed durations; variant sheets and part highlighting in the preview. Not yet: adding a new variant dimension or new parts, and compound variants beyond class edits. **S4 (agents) started:** an MCP server with the studio's operations (batched, all or nothing), token and recipe reads, checks, screenshots of the real components, and compile; the studio picks up an agent's edits live. **Brief → directions built:** a brief, directions as operation lists with rationale, a readable diff and checks per direction, a preview per direction (one Vite serves them all), side by side in the studio, applied on choice; a `draft_directions` prompt; fonts per slot. Tested by drafting three Spurbase directions through MCP. Not yet: comparing a direction against stock or the last version visually, and change requests from comments. S3 and S5 not built.

Decided 2026-11-11: name **Livery**, its own open-source repo (`bomajosiah/livery`, MIT), shadcn's default base library (Base UI, `nova` preset). Whether it becomes a product is decided after it's proven to work.

The ask: a visual, AI-legible way to start a new project's design system from shadcn and customize **every** part of it. It's for Spurbase, Kuji and Zylo first. It adds to base, Lathe and canary; it doesn't replace them.

---

## 1. What this is (philosophy first)

shadcn's real gift is a set of good **defaults you own**: the code is copied into your project, not installed. But "you own it" today means "you can edit 55 files of class strings by hand". The defaults are easy to take and hard to truly change. So most shadcn products look like shadcn with a different accent colour.

The thing we want is the missing step between *take the defaults* and *own a system*:

> **Lift shadcn out of its source files into one structured description of the system: every token, every component part, every variant and state. Edit that description visually or through an agent, then compile it back into shadcn-compatible code that the project owns.**

That turns "a component library you copy" into "a design system you author". It also makes the system legible to agents. An agent reads one spec instead of 55 files, and changes it with named operations instead of regexes over class strings.

**The big version:** a *design system compiler*. One source (the spec) compiles to every target a product needs: the shadcn components and registry, Tailwind theme, Storybook, docs and rules for agents (`DESIGN.md`, `llms.txt`), Figma variables, and checks. shadcn is the first input format, and other inputs could follow later.

## 2. What exists, and the gap

| Tool | What it changes | Depth | Output |
|---|---|---|---|
| **`shadcn create` / presets** (Dec 2025 →) | Style (Vega, Nova, Maia, Lyra, Mira, Sera and others), base library (Base UI default, or Radix), colours, radius, fonts, icon library | A handful of knobs. Each is a choice between options shadcn ships, not a free design | A preset code; `shadcn init --preset`, `shadcn apply --only theme,font` |
| **tweakcn and other theme editors** | CSS variables (colours, radius, shadows, fonts) | Theme only. Component shapes, spacing, states and anatomy don't change | Pasted CSS |
| **shadcn studio, shadcncraft create, block libraries** | Themes plus prebuilt blocks | Theme plus more things to copy | Code |
| **base** (ours) | Everything, by hand | Full, but you start from Relay's brand or an empty kit | A kit: tokens, owned components, registry, docs, Storybook, smells at zero |
| **Lathe** (ours) | An existing product's tokens and components | Edits **only with system values**, by design | Diffs and briefs on a repo it doesn't own |

These rivals are proof of demand. People want shadcn but not the shadcn look. The gap no one fills:
1. **Depth:** every part (anatomy), variant, size and state of every component, not just the theme.
2. **Structure:** a spec you can read, diff, review and hand to an agent, not edited source.
3. **Upgrades:** shadcn's copy-in model has no upgrade path. Once you customize, upstream fixes are yours to merge by hand. A spec can be rebased on new upstream versions (see §4.5).

## 3. Where it sits next to base, Lathe and canary

```
  Livery (create)      ──►  a base kit (own)  ──►  Lathe (evolve)
  shadcn + a preset         tokens, owned UI,       decisions on the
  → spec → visual and       registry, docs,         running product,
    agent customization     Storybook, checks       system values only
```

- **Livery defines the system values; Lathe enforces them.** Lathe's rule "visual edits use only system values" holds because something upstream decided those values. This tool is that upstream.
- **The output is a base kit.** It conforms to base's source contract (`foundations/tokens.json` → `tokens.css`, `src/ui/`, `registry.json`, `content/*.md`, stories, smells at zero). It replaces the "placeholder tokens" step of base's `npm run init` with real, designed ones. It doesn't invent a second kit format.
- **It reuses Lathe's canvas** where it can: the theme side-by-side, token reach and contrast checks, before/after against a baseline, comments that agents read, the MCP action model. Lathe stays the tool for repos you don't own. Livery writes code, because the repo is yours.
- **canary** is unchanged: the place client and own repos get worked on.

## 4. The approach

### 4.1 The spec is the product

One folder per system, all plain JSON/Markdown, all diffable:

```
system/
  system.json          name, base library (base-ui | radix), upstream shadcn version + preset code
  tokens/
    primitives.json    raw scales: colour ramps (OKLCH), type sizes, spacing, radius, shadows, durations
    semantic.json      roles: surface, text, border, accent, danger…, per theme (light, dark, more)
    component.json     per-component tokens: button.height.md, card.padding, input.ring…
  components/
    button.json        anatomy (parts), variants, sizes, states, each part's classes → tokens only
    …one file per component
  rules/
    DESIGN.md          what the system is for, voice of the UI, do and don't (agent-readable)
  decisions.md         every consequential change, with its reason (judgment as data)
```

A component recipe is the key unit. It's a structured version of what's already in shadcn's source:

```jsonc
// components/button.json (shape, not final)
{
  "upstream": "button@<shadcn version>",
  "parts": { "root": "data-slot=button" },
  "base":   { "root": ["inline-flex", "items-center", "gap:{space.2}", "radius:{button.radius}", "font:{type.label}"] },
  "variants": {
    "variant": { "default": { "root": ["bg:{accent}", "text:{on-accent}"] }, "outline": { … }, "ghost": { … } },
    "size":    { "sm": { "root": ["h:{button.height.sm}", "px:{space.3}"] }, "md": { … } }
  },
  "states":   { "hover": { … }, "focus-visible": { "root": ["ring:{focus.ring}"] }, "disabled": { … } },
  "defaults": { "variant": "default", "size": "md" }
}
```

Why this works with shadcn specifically: current shadcn components are already close to this shape. They use `cva` for variants, `cn` for merging, and a `data-slot` attribute on every part. So the anatomy has names for free, and the recipe is a faithful, lossless lift of the source, not an invention.

### 4.2 Decompile, then compile (the hard core)

1. **Start:** `livery new <project> --preset <code>`. This runs real `shadcn init` with the preset into a scratch project, then **decompiles** every component into recipes and the theme into the three token tiers. It replaces raw values with tokens wherever a value repeats.
2. **Compile:** spec → owned `src/ui/*.tsx` (shadcn-compatible: same exports, props, `data-slot`s, `cva` + `cn`), `tokens.css` and Tailwind `@theme`, a shadcn **registry** (so `shadcn add` from your own registry works in any project), stories, docs and `DESIGN.md`.
3. **The round-trip test is the gate.** Compile an untouched decompile, and it must render pixel-identical to stock shadcn for every component, variant, size, state and theme (screenshot diff = 0). Until that passes, nothing else matters.

### 4.3 The visual layer: one canvas, three zoom levels

This borrows Lathe's canvas and the semantic-zoom idea:

- **Foundations:** colour ramps and roles per theme, the type scale set in real text, spacing, radius, elevation, motion (durations, easings, enter and exit), focus, density, icons. Edit a value, and the **reach** is shown: every component and screen it touches.
- **Components:** each component as a sheet: parts × variants × sizes × states × themes. Click a part to see its classes as tokens. Change one, add a variant, add a size, change a default. **Every class of every part is editable.** That's the "expose every single thing" promise.
- **Screens:** a few real compositions (sign-in, dashboard, settings, a form, a data table, an empty state). You judge the system as a whole, not as swatches. For each project, these become its golden surfaces (base's creation path: guardrails, then taste on real screens, then extract).

Rendering stays real: a generated Vite project renders the compiled components with HMR. It's the same "the canvas is the real components" principle as Lathe, not a drawing of them.

Unlike Lathe, raw values are allowed here, because this is where they get decided. But every raw value lands in a token, never in a component. The rule becomes: **components reference tokens only, and tokens hold values.**

### 4.4 AI-legible from the first commit

- **MCP server** with the same operations the canvas uses: `list_components`, `get_recipe`, `set_token`, `set_part_classes`, `add_variant`, `set_default`, `screenshot` (component, variant, state, theme, width), `compare` (vs stock shadcn or vs the last version), `check` (contrast, touch targets, token-only rule, smells), `compile`.
- **Agent flows:**
  - *Brief → first draft:* the agent reads a brand brief and references (moodboards, a reference library) and proposes 2–3 directions as full specs, rendered side by side. You pick or mix.
  - *Targeted changes:* "denser tables", "softer, rounder, more playful", "match this screenshot". Each comes back as a spec diff plus before/after renders, recorded in `decisions.md`.
- **Agent outputs:** the compiled kit ships `DESIGN.md`, `llms.txt`, per-component guidance and the shadcn skill pointing at the project's own registry. So the agents that later build Spurbase screens use *this* system, not generic shadcn.

### 4.5 Upgrades: rebase on upstream

The spec stores which shadcn version each recipe came from. When shadcn ships fixes or new components, `livery upgrade` decompiles the new upstream and does a three-way merge: old upstream → new upstream, applied over your customizations. Conflicts show on the canvas. No one else offers this, and it's the reason to keep a spec instead of editing source.

## 5. Build order (agent speed, risk first)

| Phase | What | Done when |
|---|---|---|
| **S0: Round-trip spike** | Decompile stock shadcn (one preset, Base UI) into recipes plus tokens, then compile back | Pixel-identical for button, input, card, dialog, select, table, then all components |
| **S1: Foundations** | Token tiers, OKLCH ramp generation, themes, contrast checks; canvas foundations view | Change one value and see every component update live |
| **S2: Components** | Recipe editor: parts, variants, sizes, states, defaults; add or remove variants | Every class of every part editable without touching source |
| **S3: Output = base kit** | Registry, stories, docs, `DESIGN.md`, smells at zero | `npm run check`, `build`, `test:stories` pass in the generated kit |
| **S4: Agents** | MCP server, brief → 3 directions, change requests with diffs and renders | An agent drafts Spurbase's system from a brief, end to end |
| **S5: Upgrade + more** | Upstream rebase, Figma variables export, Radix as well as Base UI | A shadcn release merges into a customized system cleanly |

Then the first real systems: Spurbase, Kuji and Zylo, each a first customer.

## 6. Red team

- **shadcn moves fast** (styles monthly, `cn` package swap, CLI v4). *Answer:* decompile from real `shadcn init` output, never from a fork, and run the S0 round-trip test in CI against the latest shadcn.
- **The decompiler meets something it can't lift** (complex conditional classes, Radix vs Base UI differences). *Answer:* recipes allow an escape: a part can stay as owned source, flagged on the canvas. Aim for 95% structured, not 100%.
- **shadcn adds deep customization itself.** Plausible: presets are moving that way. *Answer:* that's validation. Our edge is the spec, agent operations, upgrades and the base kit output, not the knobs. If shadcn ships a public spec format, we adopt it as an input.
- **The tool becomes the project.** *Answer:* build S0–S3 only as far as the first real system needs, and let later systems pull the rest. Stop polishing the tool the moment it's good enough to start a real system.
- **It's another tool next to base and Lathe.** *Answer:* it reuses Lathe's canvas and MCP patterns and outputs base's format. Over time it could become Lathe's "new system" mode rather than a separate app (open question).

## 7. Open questions

1. **First system:** Spurbase, Kuji or Zylo?
2. **Product or tool:** decided after S0–S3 prove it works.

## Sources

- [shadcn changelog: `npx shadcn create` (Dec 2025)](https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create) · [preset commands (Apr 2026)](https://ui.shadcn.com/docs/changelog/2026-04-preset-commands) · [partial preset apply (Apr 2026)](https://ui.shadcn.com/docs/changelog/2026-04-partial-preset-apply)
- [InfoQ: shadcn/ui builder](https://www.infoq.com/news/2026/02/shadcn-ui-builder) · [shadcnblocks: component styles Vega, Nova, Maia, Lyra, Mira](https://www.shadcnblocks.com/blog/shadcn-component-styles-vega-nova-maia-lyra-mira) · [shadcncraft create](https://dev.to/shadcncraft/create-and-preview-your-own-design-system-with-shadcncraft-create-4iip)
- [tweakcn alternatives (vendor list, treat rankings with care)](https://designrevision.com/alternatives/tweakcn)
- Related projects: base (the kit format), Lathe (`github.com/bomajosiah/lathe`), the agentic design process
