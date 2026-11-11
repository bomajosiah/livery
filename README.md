# Livery

Start a design system from shadcn, then customize every part of it, visually or through an agent.

shadcn gives you good defaults as code you own. Owning them usually means editing dozens of files of class strings by hand, so most shadcn products end up looking like shadcn with a new accent colour. Livery lifts shadcn out of its source into one structured description of the system: every theme token, every component part, every variant, size and state, named. You edit that description, and Livery compiles it back into shadcn-compatible code your project owns.

Status: **early.**
- **Round trip:** stock shadcn (63 components, Base UI, the `nova` preset) decompiles into a system and compiles back byte for byte.
- **Foundations:** theme colours are stored as references to primitive scales (`neutral.900`, `base.white / 10%`), taken from the project's own Tailwind palette. You can generate new scales from a seed colour or a hue and chroma, and every text-on-surface pair gets a WCAG contrast check.
- **Foundations:** spacing, a modular type scale, font weights, elevation (shadow strength and tint) and motion (default duration and easing) override Tailwind's own theme variables. Only changes are written, so an untouched system still compiles to stock.
- **Reach:** every role and foundation shows which components use it and how often, read from the recipes.
- **Studio:** edit all of the above and watch the real components update live in light and dark.

Component editing, agent tools (MCP) and upgrades come next. See [APPROACH.md](APPROACH.md).

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
