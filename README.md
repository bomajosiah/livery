# Livery

Start a design system from shadcn, then customize every part of it, visually or through an agent.

shadcn gives you good defaults as code you own. Owning them usually means editing dozens of files of class strings by hand, so most shadcn products end up looking like shadcn with a new accent colour. Livery lifts shadcn out of its source into one structured description of the system: every theme token, every component part, every variant, size and state, named. You edit that description, and Livery compiles it back into shadcn-compatible code your project owns.

Status: **early.**
- **Round trip:** stock shadcn (63 components, Base UI, the `nova` preset) decompiles into a system and compiles back byte for byte.
- **Foundations:** theme colours are stored as references to primitive scales (`neutral.900`, `base.white / 10%`), taken from the project's own Tailwind palette. You can generate new scales from a seed colour or a hue and chroma, and every text-on-surface pair gets a WCAG contrast check.
- **Foundations:** spacing, a modular type scale, font weights, elevation (shadow strength and tint) and motion (default duration and easing) override Tailwind's own theme variables. Only changes are written, so an untouched system still compiles to stock.
- **Reach:** every role and foundation shows which components use it and how often, read from the recipes.
- **Components:** every class of every part, variant and state is editable. You can add and remove variant keys and change defaults; Livery rewrites only those properties in the source, in the file's own style. Each component sheet renders the real component across its variants, and hovering a part outlines it in the preview. Checks flag classes that bypass the system: Tailwind palette colours, raw colours, one-off sizes and fixed durations.
- **Studio:** edit all of the above and watch the real components update live in light and dark.
- **Directions:** write a brief, and an agent drafts several distinct takes on the system from it. Each direction is a list of named operations on top of the system, with a name and a rationale, so its changes read as a diff and it replays onto later versions. The studio shows them side by side, rendered from real components; using one applies its operations to the system.
- **Fonts:** a typeface per slot (sans, heading, mono); Google families load from the compiled CSS.
- **Agents:** an MCP server gives an agent the same named operations the studio uses, all or nothing per call, plus checks and screenshots of the real components. With the studio open, the person watches the agent's edits land live.

The base kit output and upgrades come next. See [APPROACH.md](APPROACH.md).

## Try it

Node 22+.

```sh
npm install
npm run baseline        # a stock shadcn project with every component, in .work/stock
node bin/livery.mjs decompile .work/stock --to .work/system
node bin/livery.mjs compile .work/system --into .work/stock
npm test                # unit tests, plus stock shadcn byte for byte
```

Open the studio on a copy of the project (it compiles the system into that project and starts its Vite for the preview):

```sh
cp -R .work/stock .work/preview
node bin/livery.mjs studio .work/system --project .work/preview
# http://localhost:5310
```

## Agents (MCP)

```sh
node bin/livery.mjs mcp .work/system --project .work/preview
```

For Claude Code, in the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "livery": {
      "command": "node",
      "args": ["/path/to/livery/bin/livery.mjs", "mcp", "/path/to/system", "--project", "/path/to/project"]
    }
  }
}
```

| Tool | What it does |
|---|---|
| `get_system` | Themes, scales, overridden foundations, contrast failures, and every operation with its arguments. Start here. |
| `get_tokens` | Colour roles (reference, hex, how many components use it), scales, foundations, `@theme` variables |
| `edit_tokens` | `set_token`, `set_scale`, `set_foundation`, `set_type_scale`, `set_shadows`, `reset_foundation`… in order, all or nothing; returns contrast failures before → after |
| `list_components` / `get_component` | Every class list by path, variant keys, defaults, the roles a component uses, classes that bypass the system |
| `edit_component` | `set_classes`, `add_classes`, `remove_class`, `replace_class`, `add_variant_key`, `remove_variant_key`, `set_default` |
| `check` | WCAG contrast per theme, and bypassing classes per component |
| `screenshot` | A component's variant sheet, or the specimen with a part outlined, in light, dark or both, rendered by the project's own Vite; for the system or any direction |
| `set_brief` | Write the brief directions are drafted from |
| `save_direction` | Create or revise a direction: name, rationale, and any token or component operations (component ones take `args.component`). Validated by building it; returns its changes and checks |
| `list_directions` / `apply_direction` / `delete_direction` | Review them, make one the system (when the person picks it), or drop one |
| `compile` | Write the system as shadcn source into another project |

The server also offers a `draft_directions` prompt (in Claude Code, `/mcp__livery__draft_directions`). It tells the agent how to draft from the brief: decide how the product should feel first, make each direction a different answer on several axes at once, keep contrast failures at zero, screenshot each one and revise it, and leave the choice to the person.

Edits write the system and compile into the project at once. Screenshots use the open studio's preview when there is one, otherwise the server starts its own (headless Chrome or Chromium; set `LIVERY_CHROME` to point at one).

## The system

```
system/
  system.json              source style, base library, shadcn version, component list
  tokens.json              primitives (colour scales), every theme token as a reference or value, @theme,
                           and foundations: the Tailwind theme variables you've changed
  components/<name>.json   every class string of every part, variant and state
  skeleton/                the rest of the source, with placeholders
```

A component recipe names each class string by where it lives:

```jsonc
// components/button.json (abridged)
{
  "cva": {
    "buttonVariants": {
      "base": ["inline-flex", "items-center", "rounded-lg", "focus-visible:ring-3", "…"],
      "variants": {
        "variant": { "default": ["bg-primary", "text-primary-foreground", "hover:bg-primary/80"], "…": [] },
        "size": { "sm": ["h-7", "gap-1", "px-2.5", "…"], "…": [] }
      }
    }
  }
}
```

Parts come from shadcn's own `data-slot` attributes (`card`, `card-header`, `card-title`…), so the anatomy has the same names as the code.

## How it fits

Livery creates a system. base, a starter kit format (tokens, owned components, a shadcn registry, docs, Storybook, checks), is what it will compile to. [Lathe](https://github.com/bomajosiah/lathe) is where a running product's design decisions get made afterwards, using only the system's values.

## License

MIT
