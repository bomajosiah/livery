import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"

test("the studio's script parses", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", path.resolve(import.meta.dirname, "../studio/app.js")], { stdio: "pipe" }))
})
