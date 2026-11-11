import { test } from "node:test"
import assert from "node:assert/strict"
import { decompileComponent, compileComponent } from "../src/components.mjs"
import { recipeOperations } from "../src/recipe-ops.mjs"
import { componentChecks } from "../src/component-checks.mjs"

const source = `import { cva } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva("inline-flex rounded-md", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      outline: "border-border",
      ghost: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function Badge({ className, variant = "default", ...props }) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}
`

const fresh = () => decompileComponent(source, "badge.tsx")

test("decompile records defaults, users and empty variant values", () => {
  const { recipe, skeleton } = fresh()
  const entry = recipe.cva.badgeVariants
  assert.deepEqual(entry.defaults, { variant: "default" })
  assert.deepEqual(entry.usedBy, ["Badge"])
  assert.deepEqual(entry.variants.variant.ghost, [])
  assert.equal(compileComponent(recipe, skeleton), source)
})

test("adding, removing and defaulting variant keys rewrites only those properties", () => {
  const { recipe, skeleton } = fresh()
  recipeOperations.add_variant_key(recipe, { cva: "badgeVariants", variant: "variant", key: "soft", copyFrom: "outline" })
  recipeOperations.add_variant_key(recipe, { cva: "badgeVariants", variant: "variant", key: "icon-only" })
  recipeOperations.remove_variant_key(recipe, { cva: "badgeVariants", variant: "variant", key: "ghost" })
  recipeOperations.set_default(recipe, { cva: "badgeVariants", variant: "variant", key: "outline" })
  const out = compileComponent(recipe, skeleton)
  assert.ok(out.includes(`      outline: "border-border",\n      soft: "border-border",\n      "icon-only": "",\n    },`))
  assert.ok(!out.includes("ghost"))
  assert.ok(out.includes(`defaultVariants: {\n    variant: "outline",`))
  assert.ok(out.includes(`variant = "outline"`))
})

test("recipe operations refuse what would break the component", () => {
  const { recipe } = fresh()
  assert.throws(() => recipeOperations.remove_variant_key(recipe, { cva: "badgeVariants", variant: "variant", key: "default" }), /is the default/)
  assert.throws(() => recipeOperations.add_variant_key(recipe, { cva: "badgeVariants", variant: "variant", key: "Outline!" }), /lowercase/)
  assert.throws(() => recipeOperations.set_classes(recipe, { path: "parts.nope", classes: [] }), /No part/)
  assert.throws(() => recipeOperations.set_classes(recipe, { path: "cva.badgeVariants.base", classes: ["two words"] }), /single class/)
  recipeOperations.replace_class(recipe, { from: "rounded-md", to: "rounded-full" })
  assert.deepEqual(recipe.cva.badgeVariants.base, ["inline-flex", "rounded-full"])
  assert.throws(() => recipeOperations.replace_class(recipe, { from: "rounded-md", to: "x" }), /isn't used/)
})

test("checks flag classes that bypass roles and foundations", () => {
  const recipe = {
    parts: { root: ["bg-primary", "hover:bg-red-500", "text-[#333]", "h-[13px]", "duration-200", "bg-[oklch(from_var(--primary)_0.9_c_h)]"] },
  }
  const kinds = componentChecks(recipe).map((c) => [c.class, c.kind])
  assert.deepEqual(kinds, [
    ["hover:bg-red-500", "palette"],
    ["text-[#333]", "raw-color"],
    ["h-[13px]", "raw-size"],
    ["duration-200", "fixed-duration"],
  ])
})
