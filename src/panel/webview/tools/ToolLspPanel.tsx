import React from "react"
import { useWorkspaceDir } from "../app/contexts"
import { relativeWorkspacePath, recordValue, stringValue } from "../lib/part-utils"
import type { ToolDetails, ToolPart } from "./types"

export function renderInlineLspToolTitle(part: ToolPart, options: {
  workspaceDir?: string
  FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element
}) {
  if (part.tool !== "lsp_diagnostics") {
    return null
  }
  const { FileRefText, workspaceDir = "" } = options
  const input = recordValue(part.state?.input)
  const filePath = stringValue(input.filePath)
  const displayPath = relativeWorkspacePath(filePath, workspaceDir) || filePath
  const severity = stringValue(input.severity) || "all"
  return (
    <>
      {"lsp_diagnostics [filePath="}
      <FileRefText value={filePath} display={displayPath} />
      {`, severity=${severity}]`}
    </>
  )
}

export function ToolLspPanel({
  DiagnosticsList,
  ToolStatus,
  active = false,
  part,
  FileRefText,
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
  FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element
  renderLspToolTitle: (part: ToolPart, options: { workspaceDir?: string; FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element }) => React.ReactNode
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
          <span className="oc-toolPanelTitle">{renderLspToolTitle(part, { FileRefText, workspaceDir }) || details.title}</span>
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
