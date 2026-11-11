#!/usr/bin/env node
// Generate a stock shadcn project (shadcn's defaults: Vite, Base UI, the nova preset,
// every component) in .work/stock. It's the baseline Livery decompiles and compares against.
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const work = path.resolve(import.meta.dirname, "../.work")
const preset = process.argv[2] ?? "nova"
fs.rmSync(path.join(work, "stock"), { recursive: true, force: true })
fs.mkdirSync(work, { recursive: true })
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" })
run(`npx -y shadcn@latest init -t vite -b base -p ${preset} -n stock --no-monorepo -y`, work)
run(`npx -y shadcn@latest add --all -y -o`, path.join(work, "stock"))
fs.copyFileSync(path.resolve(import.meta.dirname, "../fixtures/Specimen.tsx"), path.join(work, "stock/src/App.tsx"))
