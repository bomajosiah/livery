// Livery studio UI. Every edit is a named operation sent to the server (/api/op), which
// writes the system and recompiles the project's CSS; the preview frames update over HMR.
const $ = (sel) => document.querySelector(sel)
let state = null
let pickerTarget = null

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") for (const [prop, val] of Object.entries(v)) prop.startsWith("--") ? node.style.setProperty(prop, val) : (node.style[prop] = val)
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v)
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v)
  }
  node.append(...children.flat().filter((c) => c != null))
  return node
}

async function load() {
  state = await (await fetch("/api/state")).json()
  render()
}

async function op(name, args) {
  const res = await fetch("/api/op", { method: "POST", body: JSON.stringify({ op: name, args }) })
  const body = await res.json()
  if (!res.ok) return showError(body.error)
  state = body
  render()
}

function showError(message) {
  const e = $("#error")
  e.textContent = message
  e.hidden = false
  clearTimeout(showError.t)
  showError.t = setTimeout(() => (e.hidden = true), 4000)
}

const throttle = (fn, ms = 120) => {
  let t = null, last = null
  return (...args) => {
    last = args
    if (t) return
    t = setTimeout(() => ((t = null), fn(...last)), ms)
  }
}

const parse = (v) => {
  const m = String(v).match(/oklch\(([\d.]+) ([\d.]+) ([\d.]+)/)
  return m ? { l: +m[1], c: +m[2], h: +m[3] } : null
}

// --- header and frames ---------------------------------------------------------

function renderHeader() {
  $("#system-name").textContent = state.name
  $("#source").textContent = [state.source.style, state.source.shadcn && `shadcn ${state.source.shadcn.replace(/^\^/, "")}`].filter(Boolean).join(" · ")
  for (const fig of document.querySelectorAll("figure[data-theme]")) {
    const frame = fig.querySelector("iframe")
    const src = `${state.preview}?theme=${fig.dataset.theme}`
    if (frame.getAttribute("src") !== src) frame.setAttribute("src", src)
  }
}

$("#frames").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-frames]")
  if (!b) return
  for (const x of $("#frames").children) x.setAttribute("aria-pressed", String(x === b))
  $("#frame-area").dataset.frames = b.dataset.frames
})

// --- scales --------------------------------------------------------------------

function renderScales() {
  const box = $("#scales")
  box.replaceChildren()
  for (const [name, steps] of Object.entries(state.scales)) {
    const gen = state.tokens.generators?.[name]
    const kind = name === "base" ? "" : gen ? (gen.seed ? `from ${gen.seed}` : "generated") : "Tailwind"
    const head = el("div", { class: "scale-head" }, el("span", { class: "name" }, name), el("span", { class: "kind" }, kind))
    const row = el(
      "div",
      { class: `steps${name === "base" ? " base" : ""}` },
      Object.entries(steps).map(([step, s]) => el("span", { title: `${name}.${step}  ${s.value}`, style: { background: s.hex } })),
    )
    const scale = el("div", { class: "scale" }, head, row)
    if (name !== "base") {
      const mid = parse(steps["600"]?.value ?? Object.values(steps)[5].value)
      const seed = el("input", { type: "color", value: gen?.seed ?? steps["600"]?.hex ?? "#888888", "aria-label": `${name} seed colour` })
      seed.addEventListener("change", () => op("set_scale", { scale: name, seed: seed.value }))
      head.append(seed)
      const hue = el("input", { type: "range", min: 0, max: 360, step: 1, value: gen?.hue ?? Math.round(mid?.h ?? 0), "aria-label": `${name} hue` })
      const chroma = el("input", { type: "range", min: 0, max: 0.37, step: 0.005, value: gen?.chroma ?? mid?.c ?? 0, "aria-label": `${name} chroma` })
      const hueOut = el("output", {}, hue.value)
      const chromaOut = el("output", {}, (+chroma.value).toFixed(3))
      const send = throttle(() => op("set_scale", { scale: name, hue: +hue.value, chroma: +chroma.value }))
      hue.addEventListener("input", () => ((hueOut.textContent = hue.value), send()))
      chroma.addEventListener("input", () => ((chromaOut.textContent = (+chroma.value).toFixed(3)), send()))
      scale.append(el("div", { class: "sliders" }, "Hue", hue, hueOut, "Chroma", chroma, chromaOut))
    }
    box.append(scale)
  }
  const select = $("#palette-scale")
  const have = new Set(Object.keys(state.scales))
  select.replaceChildren(...state.paletteScales.filter((s) => !have.has(s)).map((s) => el("option", { value: s }, s)))
}

$("#add-scale").addEventListener("submit", (e) => {
  e.preventDefault()
  if ($("#palette-scale").value) op("add_palette_scale", { scale: $("#palette-scale").value })
})
$("#new-scale").addEventListener("submit", (e) => {
  e.preventDefault()
  op("set_scale", { scale: $("#new-scale-name").value.trim(), seed: $("#new-scale-seed").value })
  $("#new-scale-name").value = ""
})

// --- roles ---------------------------------------------------------------------

function renderRoles() {
  const box = $("#roles")
  box.replaceChildren()
  const themes = Object.keys(state.tokens.themes)
  const names = Object.keys(state.tokens.themes.light).filter((n) => state.swatches.light[n])
  for (const name of names) {
    const cells = ["light", "dark"].map((theme) => {
      if (!themes.includes(theme)) return el("span")
      const value = state.tokens.themes[theme][name]
      const sw = state.swatches[theme][name]
      return el(
        "button",
        { class: "swatch-btn", title: value, onclick: (e) => openPicker(e.currentTarget, theme, name) },
        el("i", { style: { "--c": sw ? `color-mix(in srgb, ${sw.hex} ${Math.round(sw.alpha * 100)}%, transparent)` : "transparent" } }),
        value,
      )
    })
    box.append(el("div", { class: "role" }, el("span", { class: "label", title: name }, name), ...cells))
  }
}

function openPicker(anchor, theme, name) {
  pickerTarget = { theme, name }
  const value = state.tokens.themes[theme][name]
  const alpha = value.match(/ \/ (\S+)$/)?.[1] ?? ""
  $("#picker-title").textContent = `${name} · ${theme}`
  $("#picker-alpha").value = alpha
  const current = value.replace(/ \/ \S+$/, "")
  const list = $("#picker-scales")
  list.replaceChildren()
  for (const [scale, steps] of Object.entries(state.scales)) {
    list.append(
      el("div", { class: "scale-name" }, scale),
      el(
        "div",
        { class: `steps${scale === "base" ? " base" : ""}` },
        Object.entries(steps).map(([step, s]) =>
          el("button", {
            title: `${scale}.${step}`,
            "aria-label": `${scale}.${step}`,
            "aria-current": String(current === `${scale}.${step}`),
            style: { background: s.hex },
            onclick: () => {
              const a = $("#picker-alpha").value.trim()
              op("set_token", { theme, name, value: `${scale}.${step}${a && a !== "100%" ? ` / ${a}` : ""}` })
              closePicker()
            },
          }),
        ),
      ),
    )
  }
  const p = $("#picker")
  p.hidden = false
  const r = anchor.getBoundingClientRect()
  p.style.left = `${Math.min(r.left, innerWidth - 316)}px`
  p.style.top = `${Math.min(r.bottom + 6, innerHeight - p.offsetHeight - 8)}px`
}

function closePicker() {
  $("#picker").hidden = true
  pickerTarget = null
}
document.addEventListener("pointerdown", (e) => {
  if (pickerTarget && !e.target.closest("#picker") && !e.target.closest(".swatch-btn")) closePicker()
})
document.addEventListener("keydown", (e) => e.key === "Escape" && closePicker())

// --- shape and type --------------------------------------------------------------

const sendRadius = throttle((v) => op("set_token", { theme: "light", name: "radius", value: `${v}rem` }))
$("#radius").addEventListener("input", (e) => {
  $("#radius-out").textContent = `${e.target.value}rem`
  sendRadius(e.target.value)
})
for (const id of ["font-sans", "font-heading"]) {
  $(`#${id}`).addEventListener("change", (e) => op("set_theme_var", { name: id, value: e.target.value }))
}

function renderShape() {
  const r = parseFloat(state.tokens.themes.light.radius ?? "0.625")
  if (document.activeElement !== $("#radius")) $("#radius").value = r
  $("#radius-out").textContent = `${r}rem`
  for (const id of ["font-sans", "font-heading"]) {
    if (document.activeElement !== $(`#${id}`)) $(`#${id}`).value = state.tokens.theme?.[id] ?? ""
  }
}

// --- checks --------------------------------------------------------------------

function renderChecks() {
  const fails = state.checks.filter((c) => !c.pass)
  $("#checks-summary").textContent = fails.length ? `${fails.length} below minimum` : "all pass"
  const sorted = [...state.checks].sort((a, b) => a.pass - b.pass || a.ratio - b.ratio)
  $("#checks").replaceChildren(
    ...sorted.map((c) =>
      el(
        "li",
        { class: c.pass ? "pass" : "fail", title: `${c.kind === "ui" ? "Non-text" : "Text"} minimum ${c.min}:1` },
        el("span", { class: "mark" }, c.pass ? "✓" : "✕"),
        el("span", {}, `${c.fg} on ${c.bg} · ${c.theme}`),
        el("span", { class: "ratio" }, `${c.ratio.toFixed(2)} / ${c.min}`),
      ),
    ),
  )
}

function render() {
  renderHeader()
  renderScales()
  renderRoles()
  renderShape()
  renderChecks()
}

load()
