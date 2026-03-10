import React from "react"
import type { MessagePart } from "../../../core/sdk"

type ToolDisplayVariant = "row" | "panel" | "links" | "files" | "todos" | "question"

export function PartView({
  DividerPartView,
  MarkdownBlock,
  ToolPartView,
  diffMode = "unified",
  part,
  active = false,
  cleanReasoning,
  fileLabel,
  isDividerPart,
  partMeta,
  partTitle,
  renderPartBody,
}: {
  DividerPartView: ({ part }: { part: MessagePart }) => React.JSX.Element
  MarkdownBlock: ({ content, className }: { content: string; className?: string }) => React.JSX.Element
  ToolPartView: ({ part, active, diffMode }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) => React.JSX.Element
  diffMode?: "unified" | "split"
  part: MessagePart
  active?: boolean
  cleanReasoning: (value: string) => string
  fileLabel: (value: string) => string
  isDividerPart: (part: MessagePart) => boolean
  partMeta: (part: MessagePart) => string
  partTitle: (part: MessagePart) => string
  renderPartBody: (part: MessagePart) => React.JSX.Element
}) {
  const meta = partMeta(part)

  if (part.type === "text") {
    return (
      <section className="oc-part oc-part-text oc-part-inline">
        <MarkdownBlock content={part.text || ""} />
      </section>
    )
  }

  if (part.type === "reasoning") {
    return (
      <section className="oc-part oc-part-reasoning">
        <MarkdownBlock className="is-subtle" content={`_Thinking:_ ${cleanReasoning(part.text || "")}`} />
      </section>
    )
  }

  if (part.type === "tool") {
    return <ToolPartView part={part} active={active} diffMode={diffMode} />
  }

  if (isDividerPart(part)) {
    return <DividerPartView part={part} />
  }

  if (part.type === "file") {
    return (
      <section className="oc-part oc-part-file oc-part-compact">
        <div className="oc-attachmentRow">
          <span className="oc-pill oc-pill-file">{part.filename || fileLabel(part.url)}</span>
          {part.mime ? <span className="oc-pill oc-pill-file">{part.mime}</span> : null}
        </div>
      </section>
    )
  }

  return (
    <section className={`oc-part oc-part-${part.type}`}>
      <div className="oc-partHeader">
        <span className="oc-kicker">{partTitle(part)}</span>
        {meta ? <span className="oc-partMeta">{meta}</span> : null}
      </div>
      {renderPartBody(part)}
    </section>
  )
}

export function ToolPartView({
  ToolFilesPanel,
  ToolLinksPanel,
  ToolLspPanel,
  ToolQuestionPanel,
  ToolRow,
  ToolShellPanel,
  ToolTextPanel,
  ToolTodosPanel,
  active = false,
  diffMode = "unified",
  isMcpTool,
  lspRendersInline,
  part,
}: {
  ToolFilesPanel: ({ part, active, diffMode }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) => React.JSX.Element
  ToolLinksPanel: ({ part, active }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) => React.JSX.Element
  ToolLspPanel: ({ part, active }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) => React.JSX.Element
  ToolQuestionPanel: ({ part, active }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) => React.JSX.Element
  ToolRow: ({ part, active }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) => React.JSX.Element
  ToolShellPanel: ({ part, active }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) => React.JSX.Element
  ToolTextPanel: ({ part, active }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) => React.JSX.Element
  ToolTodosPanel: ({ part, active }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) => React.JSX.Element
  active?: boolean
  diffMode?: "unified" | "split"
  isMcpTool: (tool: string) => boolean
  lspRendersInline: (part: Extract<MessagePart, { type: "tool" }>) => boolean
  part: Extract<MessagePart, { type: "tool" }>
}) {
  if (part.tool === "bash" && !bashHasPanel(part)) {
    return <ToolRow part={part} active={active} />
  }

  if (part.tool === "bash") {
    return <ToolShellPanel part={part} active={active} />
  }

  if (part.tool === "websearch" || part.tool === "codesearch") {
    return <ToolRow part={part} active={active} />
  }

  if (isMcpTool(part.tool)) {
    return <ToolRow part={part} active={active} />
  }

  const variant = toolVariant(part.tool)

  if (variant === "row") {
    return <ToolRow part={part} active={active} />
  }

  if (variant === "files") {
    return <ToolFilesPanel part={part} active={active} diffMode={diffMode} />
  }

  if (variant === "links") {
    return <ToolLinksPanel part={part} active={active} />
  }

  if (variant === "todos") {
    return <ToolTodosPanel part={part} active={active} />
  }

  if (variant === "question") {
    return <ToolQuestionPanel part={part} active={active} />
  }

  if (part.tool === "lsp" || part.tool.startsWith("lsp_")) {
    if (lspRendersInline(part)) {
      return <ToolRow part={part} active={active} />
    }
    return <ToolLspPanel part={part} active={active} />
  }

  return <ToolTextPanel part={part} active={active} />
}

function toolVariant(tool: string): ToolDisplayVariant {
  if (tool === "read" || tool === "webfetch" || tool === "task" || tool === "skill" || tool === "glob" || tool === "grep" || tool === "list" || tool === "websearch" || tool === "codesearch") {
    return "row"
  }
  if (tool === "write" || tool === "edit" || tool === "apply_patch") {
    return "files"
  }
  if (tool === "todowrite") {
    return "todos"
  }
  if (tool === "question") {
    return "question"
  }
  return "panel"
}

function bashHasPanel(part: Extract<MessagePart, { type: "tool" }>) {
  const metadata = recordValue(part.state?.metadata)
  return !!(stringValue(metadata.output) || part.state?.output || part.state?.error)
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function recordValue(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}
