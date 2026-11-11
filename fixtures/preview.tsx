// Livery's preview entry: renders the specimen in one theme, set by ?theme=light|dark,
// so the studio can show every theme side by side.
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "../src/index.css"
import App from "./Specimen"

const theme = new URLSearchParams(location.search).get("theme") ?? "light"
document.documentElement.classList.toggle("dark", theme === "dark")
document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
