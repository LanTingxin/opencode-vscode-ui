import React from "react"
import type { ToolDetails, ToolPart } from "./types"

export function ToolWritePanel({
  CodeBlock,
  DiagnosticsList,
  ToolFallbackText,
  ToolStatus,
  active = false,
  defaultToolExpanded,
  part,
  toolDetails,
  toolDiagnostics,
  toolLabel,
  toolTextBody,
  toolWriteContent,
}: {
  CodeBlock: ({ value, filePath }: { value: string; filePath?: string }) => React.JSX.Element
  DiagnosticsList: ({ items, tone }: { items: string[]; tone?: "warning" | "error" }) => React.JSX.Element
  ToolFallbackText: ({ part, body }: { part: ToolPart; body: string }) => React.JSX.Element | null
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  defaultToolExpanded: (part: ToolPart, active: boolean, hasBody: boolean) => boolean
  part: ToolPart
  toolDetails: (part: ToolPart) => ToolDetails
  toolDiagnostics: (part: ToolPart) => string[]
  toolLabel: (tool: string) => string
  toolTextBody: (part: ToolPart) => string
  toolWriteContent: (part: ToolPart) => string
}) {
  const details = toolDetails(part)
  const status = part.state?.status || "pending"
  const content = toolWriteContent(part)
  const diagnostics = toolDiagnostics(part)
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, !!content))

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-files${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <button type="button" className="oc-toolTrigger" onClick={() => setExpanded((current: boolean) => !current)}>
        <div className="oc-partHeader">
          <div className="oc-toolHeaderMain">
            <span className="oc-kicker">{toolLabel(part.tool)}</span>
            <span className="oc-toolPanelTitle">{details.title}</span>
          </div>
          <div className="oc-toolHeaderMeta">
            {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      </button>
      {expanded && content ? <CodeBlock value={content} filePath={details.title} /> : null}
      {expanded && !content ? <ToolFallbackText part={part} body={toolTextBody(part)} /> : null}
      {expanded && diagnostics.length > 0 ? <DiagnosticsList items={diagnostics} /> : null}
    </section>
  )
}
