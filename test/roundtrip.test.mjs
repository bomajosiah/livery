import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { decompileComponent, compileComponent } from "../src/components.mjs"
import { decompileTheme, compileTheme } from "../src/theme.mjs"
import { decompileProject, compileSystem } from "../src/system.mjs"

const button = `import { cva } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva("inline-flex items-center rounded-lg", {
  variants: {
    variant: { default: "bg-primary text-primary-foreground", ghost: "hover:bg-muted" },
    size: { default: "h-8 px-2.5", "icon-sm": "size-7" },
  },
  compoundVariants: [{ variant: "ghost", size: "icon-sm", className: "rounded-full" }],
  defaultVariants: { variant: "default", size: "default" },
})

function Group({ className, active, ...props }) {
  return (
    <div
      data-slot="button-group"
      className={cn("flex gap-1", active && "ring-1 ring-ring", { "opacity-50": props.disabled }, className)}
      {...props}
    />
  )
}
`

test("a component round-trips byte for byte and every class string is named", () => {
  const { recipe, skeleton } = decompileComponent(button, "button.tsx")
  assert.equal(compileComponent(recipe, skeleton), button)
  const cva = recipe.cva.buttonVariants
  assert.deepEqual(cva.base, ["inline-flex", "items-center", "rounded-lg"])
  assert.deepEqual(cva.variants.size["icon-sm"], ["size-7"])
  assert.deepEqual(cva.compound["0"], ["rounded-full"])
  assert.deepEqual(recipe.parts["button-group"], ["flex", "gap-1"])
  assert.deepEqual(recipe.parts["button-group#2"], ["ring-1", "ring-ring"])
  assert.deepEqual(recipe.parts["button-group#3"], ["opacity-50"])
  assert.ok(skeleton.includes(`"icon-sm":`), "quoted keys stay in the source")
})

test("editing a recipe changes only that class", () => {
  const { recipe, skeleton } = decompileComponent(button, "button.tsx")
  recipe.cva.buttonVariants.base[2] = "rounded-full"
  const out = compileComponent(recipe, skeleton)
  assert.ok(out.includes(`cva("inline-flex items-center rounded-full"`))
  assert.equal(out.replace("rounded-full\"", "rounded-lg\""), button)
})

const css = `@import "tailwindcss";

@theme inline {
    --radius-lg: var(--radius);
}

:root {
    --primary: oklch(0.205 0 0);
    --radius: 0.625rem;
}

.dark {
    --primary: oklch(0.922 0 0);
}
`

test("theme tokens round-trip and are grouped by theme", () => {
  const { tokens, skeleton } = decompileTheme(css)
  assert.equal(compileTheme(tokens, skeleton), css)
  assert.equal(tokens.themes.light.primary, "oklch(0.205 0 0)")
  assert.equal(tokens.themes.dark.primary, "oklch(0.922 0 0)")
  assert.equal(tokens.theme["radius-lg"], "var(--radius)")
})

const stock = path.resolve(import.meta.dirname, "../.work/stock")
test("stock shadcn round-trips byte for byte", { skip: !fs.existsSync(stock) && "run `npm run baseline` first" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "livery-"))
  const report = decompileProject(stock, path.join(tmp, "system"))
  assert.deepEqual(report.unlifted, {}, "no class-like strings left in source")
  for (const file of compileSystem(path.join(tmp, "system"), path.join(tmp, "out"))) {
    const rel = path.relative(path.join(tmp, "out"), file)
    assert.equal(fs.readFileSync(file, "utf8"), fs.readFileSync(path.join(stock, rel), "utf8"), rel)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
})
