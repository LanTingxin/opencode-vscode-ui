import { createRoot } from "react-dom/client"
import { App } from "./app/App"
import "./theme.css"
import "./base.css"
import "./layout.css"
import "./context.css"
import "./timeline.css"
import "./tool.css"
import "./dock.css"
import "./diff.css"
import "./markdown.css"
import "./status.css"

const root = document.getElementById("root")

if (!root) {
  throw new Error("Missing webview root")
}

createRoot(root).render(<App />)
