// Livery's preview entry. ?theme=light|dark sets the theme. The studio sends messages to
// choose a component (its variant sheet, or the specimen) and to highlight a part.
import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import "../src/index.css"
import App from "./Specimen"
import { Sheet } from "./Sheet"
import sheets from "./sheets.json"

const params = new URLSearchParams(location.search)
const theme = params.get("theme") ?? "light"
document.documentElement.classList.toggle("dark", theme === "dark")
document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light"

const highlight = document.createElement("style")
document.head.append(highlight)

function Preview() {
  const [component, setComponent] = useState(params.get("component") ?? "")
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "livery") return
      if ("component" in e.data) setComponent(e.data.component ?? "")
      if ("part" in e.data) {
        highlight.textContent = e.data.part
          ? `[data-slot="${CSS.escape(e.data.part)}"] { outline: 2px dashed #f43f5e !important; outline-offset: 2px; }`
          : ""
      }
    }
    addEventListener("message", onMessage)
    return () => removeEventListener("message", onMessage)
  }, [])

  // Tell the studio whether the component appears on screen.
  useEffect(() => {
    const t = setTimeout(() => {
      const found = component ? document.querySelectorAll(`[data-slot^="${CSS.escape(component)}"]`).length : 0
      parent.postMessage({ type: "livery-preview", component, found }, "*")
    }, 150)
    return () => clearTimeout(t)
  })

  return component && (sheets as Record<string, unknown[]>)[component]?.length ? <Sheet component={component} /> : <App />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
