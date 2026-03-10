import React from "react"
import { useWorkspaceDir } from "../app/contexts"
import type { ToolDetails, ToolPart } from "./types"

export function ToolLspPanel({
  DiagnosticsList,
  ToolStatus,
  active = false,
  part,
  renderLspToolTitle,
  toolDetails,
  toolDiagnostics,
  toolLabel,
  toolTextBody,
}: {
  DiagnosticsList: ({ items, tone }: { items: string[]; tone?: "warning" | "error" }) => React.JSX.Element
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  part: ToolPart
  renderLspToolTitle: (part: ToolPart, workspaceDir?: string) => React.ReactNode
  toolDetails: (part: ToolPart) => ToolDetails
  toolDiagnostics: (part: ToolPart) => string[]
  toolLabel: (tool: string) => string
  toolTextBody: (part: ToolPart) => string
}) {
  const details = toolDetails(part)
  const workspaceDir = useWorkspaceDir()
  const body = toolTextBody(part)
  const diagnostics = toolDiagnostics(part)
  const status = part.state?.status || "pending"
  const hasErrorBody = !diagnostics.length && !!body.trim() && body.trim() !== "No diagnostics found"

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-lsp${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <div className="oc-partHeader">
        <div className="oc-toolHeaderMain">
          <span className="oc-kicker">{toolLabel(part.tool)}</span>
          <span className="oc-toolPanelTitle">{renderLspToolTitle(part, workspaceDir) || details.title}</span>
        </div>
        <div className="oc-toolHeaderMeta">
          {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
          <ToolStatus state={part.state?.status} />
        </div>
      </div>
      {details.args.length > 0 ? (
        <div className="oc-attachmentRow">
          {details.args.map((item) => <span key={item} className="oc-pill oc-pill-file">{item}</span>)}
        </div>
      ) : null}
      {diagnostics.length > 0
        ? <DiagnosticsList items={diagnostics} tone="error" />
        : hasErrorBody ? <pre className="oc-errorBlock">{body}</pre> : body ? <pre className="oc-partTerminal">{body}</pre> : null}
    </section>
  )
}
