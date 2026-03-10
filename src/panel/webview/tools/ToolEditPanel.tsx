import React from "react"
import type { ToolDetails, ToolPart } from "./types"

export function ToolEditPanel({
  DiagnosticsList,
  DiffBlock,
  ToolFallbackText,
  ToolStatus,
  active = false,
  defaultToolExpanded,
  diffMode = "unified",
  part,
  toolDetails,
  toolDiagnostics,
  toolEditDiff,
  toolLabel,
  toolTextBody,
}: {
  DiagnosticsList: ({ items, tone }: { items: string[]; tone?: "warning" | "error" }) => React.JSX.Element
  DiffBlock: ({ value, mode }: { value: string; mode?: "unified" | "split" }) => React.JSX.Element
  ToolFallbackText: ({ part, body }: { part: ToolPart; body: string }) => React.JSX.Element | null
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  defaultToolExpanded: (part: ToolPart, active: boolean, hasBody: boolean) => boolean
  diffMode?: "unified" | "split"
  part: ToolPart
  toolDetails: (part: ToolPart) => ToolDetails
  toolDiagnostics: (part: ToolPart) => string[]
  toolEditDiff: (part: ToolPart) => string
  toolLabel: (tool: string) => string
  toolTextBody: (part: ToolPart) => string
}) {
  const details = toolDetails(part)
  const status = part.state?.status || "pending"
  const diff = toolEditDiff(part)
  const diagnostics = toolDiagnostics(part)
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, !!diff || !!toolTextBody(part)))

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
      {expanded && diff ? <DiffBlock value={diff} mode={diffMode} /> : null}
      {expanded && !diff ? <ToolFallbackText part={part} body={toolTextBody(part)} /> : null}
      {expanded && diagnostics.length > 0 ? <DiagnosticsList items={diagnostics} /> : null}
    </section>
  )
}
