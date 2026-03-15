import React from "react"
import type { ToolDetails, ToolFileSummary, ToolPart } from "./types"

export function ToolWritePanel({
  DiagnosticsList,
  DiffWindowBody,
  FileRefText,
  OutputWindow,
  ToolFallbackText,
  ToolStatus,
  active = false,
  defaultToolExpanded,
  diffOutputLineCount,
  part,
  toolDetails,
  toolDiagnostics,
  toolFiles,
  toolLabel,
  toolTextBody,
  toolWriteDiff,
}: {
  DiagnosticsList: ({ items, tone }: { items: string[]; tone?: "warning" | "error" }) => React.JSX.Element
  DiffWindowBody: ({ value, mode, filePath }: { value: string; mode?: "unified" | "split"; filePath?: string }) => React.JSX.Element
  FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element
  OutputWindow: ({ action, title, running, lineCount, className, children }: { action: string; title: React.ReactNode; running?: boolean; lineCount: number; className?: string; children: React.ReactNode }) => React.JSX.Element
  ToolFallbackText: ({ part, body }: { part: ToolPart; body: string }) => React.JSX.Element | null
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  defaultToolExpanded: (part: ToolPart, active: boolean, hasBody: boolean) => boolean
  diffOutputLineCount: (value: string, mode: "unified" | "split") => number
  part: ToolPart
  toolDetails: (part: ToolPart) => ToolDetails
  toolDiagnostics: (part: ToolPart) => string[]
  toolFiles: (part: ToolPart) => ToolFileSummary[]
  toolLabel: (tool: string) => string
  toolTextBody: (part: ToolPart) => string
  toolWriteDiff: (part: ToolPart) => string
}) {
  const details = toolDetails(part)
  const status = part.state?.status || "pending"
  const diff = toolWriteDiff(part)
  const diagnostics = toolDiagnostics(part)
  const file = toolFiles(part)[0]
  const body = toolTextBody(part)
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, !!diff || !!body))

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-patchPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      {diff ? (
        <div className="oc-patchList">
          <section className="oc-patchItem">
            <OutputWindow
              action={toolLabel(part.tool)}
              title={file
                ? (
                    <>
                      <FileRefText value={file.path} display={file.path} />
                      {status !== "running" ? <ToolStatus state={part.state?.status} /> : null}
                    </>
                  )
                : (
                    <>
                      <span>{details.title}</span>
                      {status !== "running" ? <ToolStatus state={part.state?.status} /> : null}
                    </>
                  )}
              running={status === "running"}
              lineCount={diffOutputLineCount(diff, "unified")}
              className="oc-outputWindow-patch"
            >
              <DiffWindowBody value={diff} filePath={file?.path || details.title} />
            </OutputWindow>
          </section>
        </div>
      ) : null}
      {!diff ? (
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
          {expanded ? <ToolFallbackText part={part} body={body} /> : null}
        </section>
      ) : null}
      {diagnostics.length > 0 ? <DiagnosticsList items={diagnostics} /> : null}
    </section>
  )
}
