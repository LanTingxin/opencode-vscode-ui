import React from "react"
import type { ToolDetails, ToolFileSummary, ToolPart } from "./types"

export function ToolFilesPanel({
  ToolApplyPatchPanel,
  ToolEditPanel,
  ToolFallbackText,
  ToolStatus,
  ToolWritePanel,
  active = false,
  defaultToolExpanded,
  diffMode = "unified",
  part,
  toolDetails,
  toolFiles,
  toolLabel,
  toolTextBody,
}: {
  ToolApplyPatchPanel: ({ part, active, diffMode }: { part: ToolPart; active?: boolean; diffMode?: "unified" | "split" }) => React.JSX.Element
  ToolEditPanel: ({ part, active, diffMode }: { part: ToolPart; active?: boolean; diffMode?: "unified" | "split" }) => React.JSX.Element
  ToolFallbackText: ({ part, body }: { part: ToolPart; body: string }) => React.JSX.Element | null
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  ToolWritePanel: ({ part, active }: { part: ToolPart; active?: boolean }) => React.JSX.Element
  active?: boolean
  defaultToolExpanded: (part: ToolPart, active: boolean, hasBody: boolean) => boolean
  diffMode?: "unified" | "split"
  part: ToolPart
  toolDetails: (part: ToolPart) => ToolDetails
  toolFiles: (part: ToolPart) => ToolFileSummary[]
  toolLabel: (tool: string) => string
  toolTextBody: (part: ToolPart) => string
}) {
  if (part.tool === "write") {
    return <ToolWritePanel part={part} active={active} />
  }

  if (part.tool === "edit") {
    return <ToolEditPanel part={part} active={active} diffMode={diffMode} />
  }

  if (part.tool === "apply_patch") {
    return <ToolApplyPatchPanel part={part} active={active} diffMode={diffMode} />
  }

  const details = toolDetails(part)
  const files = toolFiles(part)
  const status = part.state?.status || "pending"
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, files.length > 0 || !!toolTextBody(part)))

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
      {expanded && files.length > 0 ? (
        <div className="oc-fileToolList">
          {files.map((item) => (
            <div key={`${item.path}:${item.summary}`} className="oc-fileToolItem">
              <div className="oc-fileToolPath">{item.path}</div>
              {item.summary ? <div className="oc-fileToolSummary">{item.summary}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
      {expanded && files.length === 0 ? <ToolFallbackText part={part} body={toolTextBody(part)} /> : null}
    </section>
  )
}
