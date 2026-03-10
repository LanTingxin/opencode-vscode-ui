import { createRoot } from "react-dom/client"
import { App } from "./app/App"
import "./styles.css"

const root = document.getElementById("root")

if (!root) {
  throw new Error("Missing webview root")
}

createRoot(root).render(<App />)
