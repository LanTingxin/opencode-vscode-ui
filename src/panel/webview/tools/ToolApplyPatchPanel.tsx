import React from "react"
import type { ToolDetails, ToolPart } from "./types"

type PatchFile = {
  path: string
  type: string
  summary: string
  diff: string
}

export function ToolApplyPatchPanel({
  DiagnosticsList,
  DiffWindowBody,
  FileRefText,
  OutputWindow,
  ToolFallbackText,
  ToolStatus,
  active = false,
  diffMode = "unified",
  diffOutputLineCount,
  normalizedLineCount,
  part,
  patchFiles,
  toolDetails,
  toolDiagnostics,
  toolLabel,
  toolTextBody,
}: {
  DiagnosticsList: ({ items, tone }: { items: string[]; tone?: "warning" | "error" }) => React.JSX.Element
  DiffWindowBody: ({ value, mode, filePath }: { value: string; mode?: "unified" | "split"; filePath?: string }) => React.JSX.Element
  FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element
  OutputWindow: ({ action, title, running, lineCount, className, children }: { action: string; title: React.ReactNode; running?: boolean; lineCount: number; className?: string; children: React.ReactNode }) => React.JSX.Element
  ToolFallbackText: ({ part, body }: { part: ToolPart; body: string }) => React.JSX.Element | null
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  diffMode?: "unified" | "split"
  diffOutputLineCount: (value: string, mode: "unified" | "split") => number
  normalizedLineCount: (value: string) => number
  part: ToolPart
  patchFiles: (part: ToolPart) => PatchFile[]
  toolDetails: (part: ToolPart) => ToolDetails
  toolDiagnostics: (part: ToolPart) => string[]
  toolLabel: (tool: string) => string
  toolTextBody: (part: ToolPart) => string
}) {
  const status = part.state?.status || "pending"
  const files = patchFiles(part)
  const details = toolDetails(part)
  const diagnostics = toolDiagnostics(part)

  return (
    <section className={`oc-patchPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      {files.length === 0 ? (
        <section className={`oc-part oc-part-tool oc-toolPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
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
          <ToolFallbackText part={part} body={toolTextBody(part)} />
        </section>
      ) : null}
      {files.length > 0 ? (
        <div className="oc-patchList">
          {files.map((item) => (
            <section key={`${item.path}:${item.type}:${item.summary}`} className="oc-patchItem">
              <OutputWindow
                action={item.type}
                title={<FileRefText value={item.path} display={item.path} />}
                running={status === "running"}
                lineCount={item.diff ? diffOutputLineCount(item.diff, diffMode) : normalizedLineCount(item.summary)}
                className="oc-outputWindow-patch"
              >
                {item.diff
                  ? <DiffWindowBody value={item.diff} mode={diffMode} filePath={item.path} />
                  : <pre className="oc-outputWindowContent oc-outputWindowContent-shell">{item.summary || " "}</pre>}
              </OutputWindow>
            </section>
          ))}
        </div>
      ) : null}
      {diagnostics.length > 0 ? <DiagnosticsList items={diagnostics} /> : null}
    </section>
  )
}
