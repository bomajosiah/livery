# Livery

Start a design system from shadcn, then customize every part of it, visually or through an agent.

shadcn gives you good defaults as code you own. Owning them usually means editing dozens of files of class strings by hand, so most shadcn products end up looking like shadcn with a new accent colour. Livery lifts shadcn out of its source into one structured description of the system: every theme token, every component part, every variant, size and state, named. You edit that description, and Livery compiles it back into shadcn-compatible code your project owns.

Status: **early.** The round trip works: stock shadcn (63 components, Base UI, the `nova` preset) decompiles into a system and compiles back byte for byte. The canvas, the agent tools and upgrades come next. See [APPROACH.md](APPROACH.md).

## Try it

Node 22+.

```sh
npm install
npm run baseline        # a stock shadcn project with every component, in .work/stock
node bin/livery.mjs decompile .work/stock --to .work/system
node bin/livery.mjs compile .work/system --into .work/stock
npm test                # round trip: unit tests, plus stock shadcn byte for byte
```

## The system

```
system/
  system.json              source style, base library, shadcn version, component list
  tokens.json              every theme token: light, dark and @theme
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
