import React from "react"
import type { ToolDetails, ToolPart } from "./types"

export function ToolTextPanel({
  ToolFallbackText,
  ToolStatus,
  active = false,
  defaultToolExpanded,
  part,
  toolDetails,
  toolLabel,
  toolTextBody,
}: {
  ToolFallbackText: ({ part, body }: { part: ToolPart; body: string }) => React.JSX.Element | null
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  defaultToolExpanded: (part: ToolPart, active: boolean, hasBody: boolean) => boolean
  part: ToolPart
  toolDetails: (part: ToolPart) => ToolDetails
  toolLabel: (tool: string) => string
  toolTextBody: (part: ToolPart) => string
}) {
  const details = toolDetails(part)
  const body = toolTextBody(part)
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, !!body))
  const status = part.state?.status || "pending"

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-${part.tool}${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
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
      {expanded && details.args.length > 0 ? (
        <div className="oc-attachmentRow">
          {details.args.map((item) => <span key={item} className="oc-pill oc-pill-file">{item}</span>)}
        </div>
      ) : null}
      {expanded ? <ToolFallbackText part={part} body={body} /> : null}
    </section>
  )
}
