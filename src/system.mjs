// A Livery system on disk:
//   system/system.json                 source project, shadcn style and versions
//   system/tokens.json                 every theme token (light, dark, @theme)
//   system/components/<name>.json      every class string of every part, variant and state
//   system/skeleton/                   the rest of the source, with placeholders
import fs from "node:fs"
import path from "node:path"
import { decompileComponent, compileComponent, unliftedClassStrings } from "./components.mjs"
import { decompileTheme, compileTheme } from "./theme.mjs"
import { loadTailwindPalette } from "./palette.mjs"

const json = (v) => JSON.stringify(v, null, 2) + "\n"

function readConfig(projectDir) {
  const config = JSON.parse(fs.readFileSync(path.join(projectDir, "components.json"), "utf8"))
  const resolveAlias = (alias) => alias.replace(/^@\//, "src/")
  return {
    config,
    uiDir: resolveAlias(config.aliases.ui),
    cssFile: config.tailwind.css,
  }
}

export function decompileProject(projectDir, systemDir) {
  const { config, uiDir, cssFile } = readConfig(projectDir)
  const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"))
  fs.rmSync(systemDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(systemDir, "components"), { recursive: true })
  fs.mkdirSync(path.join(systemDir, "skeleton", uiDir), { recursive: true })

  const report = { components: 0, liftedClassStrings: 0, liftedTokens: 0, unlifted: {} }
  const files = fs.readdirSync(path.join(projectDir, uiDir)).filter((f) => f.endsWith(".tsx")).sort()
  for (const f of files) {
    const src = fs.readFileSync(path.join(projectDir, uiDir, f), "utf8")
    const { recipe, skeleton, lifted } = decompileComponent(src, path.join(uiDir, f))
    fs.writeFileSync(path.join(systemDir, "components", f.replace(/\.tsx$/, ".json")), json(recipe))
    fs.writeFileSync(path.join(systemDir, "skeleton", uiDir, f), skeleton)
    report.components++
    report.liftedClassStrings += lifted
    const left = unliftedClassStrings(skeleton, f)
    if (left.length) report.unlifted[f] = left
  }

  const css = fs.readFileSync(path.join(projectDir, cssFile), "utf8")
  const palette = loadTailwindPalette(projectDir)
  const { tokens, skeleton, lifted } = decompileTheme(css, cssFile, { palette, preferred: [config.tailwind.baseColor] })
  fs.writeFileSync(path.join(systemDir, "tokens.json"), json(tokens))
  fs.mkdirSync(path.dirname(path.join(systemDir, "skeleton", cssFile)), { recursive: true })
  fs.writeFileSync(path.join(systemDir, "skeleton", cssFile), skeleton)
  report.liftedTokens = lifted

  fs.writeFileSync(
    path.join(systemDir, "system.json"),
    json({
      livery: 1,
      source: {
        style: config.style,
        baseColor: config.tailwind.baseColor,
        iconLibrary: config.iconLibrary,
        shadcn: pkg.dependencies?.shadcn ?? null,
        baseUi: pkg.dependencies?.["@base-ui/react"] ?? null,
      },
      paths: { ui: uiDir, css: cssFile },
      components: files.map((f) => f.replace(/\.tsx$/, "")),
    }),
  )
  return report
}

// Write the compiled source files into outDir (a project with the same layout).
export function compileSystem(systemDir, outDir) {
  const system = JSON.parse(fs.readFileSync(path.join(systemDir, "system.json"), "utf8"))
  const { ui, css } = system.paths
  const written = []
  fs.mkdirSync(path.join(outDir, ui), { recursive: true })
  for (const name of system.components) {
    const recipe = JSON.parse(fs.readFileSync(path.join(systemDir, "components", `${name}.json`), "utf8"))
    const skeleton = fs.readFileSync(path.join(systemDir, "skeleton", ui, `${name}.tsx`), "utf8")
    const out = path.join(outDir, ui, `${name}.tsx`)
    fs.writeFileSync(out, compileComponent(recipe, skeleton))
    written.push(out)
  }
  const tokens = JSON.parse(fs.readFileSync(path.join(systemDir, "tokens.json"), "utf8"))
  const cssSkeleton = fs.readFileSync(path.join(systemDir, "skeleton", css), "utf8")
  fs.mkdirSync(path.dirname(path.join(outDir, css)), { recursive: true })
  fs.writeFileSync(path.join(outDir, css), compileTheme(tokens, cssSkeleton))
  written.push(path.join(outDir, css))
  return written
}
