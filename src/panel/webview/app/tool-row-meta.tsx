import React from "react"
import type { MessagePart, SessionInfo, SessionMessage } from "../../../core/sdk"
import { displayWorkspacePath, fileLabel, formatDuration, numberValue, recordValue, stringList, stringValue } from "../lib/part-utils"
import { isMcpTool, lspRendersInline, mcpDisplayTitle, toolDetails, toolLabel } from "../lib/tool-meta"
import type { ToolDetails } from "../tools/types"

type ToolPart = Extract<MessagePart, { type: "tool" }>

export function toolRowTitle(part: ToolPart, details: ToolDetails) {
  const input = recordValue(part.state?.input)
  if (isMcpTool(part.tool)) {
    return mcpDisplayTitle(part)
  }
  if (part.tool === "read") {
    const path = stringValue(input.filePath) || stringValue(input.path)
    const items: string[] = [fileLabel(path) || details.title]
    const offset = numberValue(input.offset)
    const limit = numberValue(input.limit)
    const args: string[] = []
    if (offset > 0) {
      args.push(`offset=${offset}`)
    }
    if (limit > 0) {
      args.push(`limit=${limit}`)
    }
    if (args.length > 0) {
      items.push(`[${args.join(", ")}]`)
    }
    return items.join(" ")
  }
  if (part.tool === "bash") {
    return stringValue(input.command) || details.title
  }
  if (part.tool === "websearch" || part.tool === "codesearch") {
    return stringValue(input.query) || details.title
  }
  if (part.tool === "glob" || part.tool === "grep") {
    return stringValue(input.pattern) || details.title
  }
  return details.title
}

export function renderToolRowTitle(part: ToolPart, details: ToolDetails, options: {
  workspaceDir?: string
  FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element
  renderLspToolTitle: (part: ToolPart, options: { workspaceDir?: string; FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element }) => React.ReactNode
}) {
  const { FileRefText, renderLspToolTitle, workspaceDir = "" } = options
  const input = recordValue(part.state?.input)
  if (isMcpTool(part.tool)) {
    return mcpDisplayTitle(part)
  }
  if (part.tool === "read") {
    const path = stringValue(input.filePath) || stringValue(input.path)
    const label = fileLabel(path) || details.title
    const offset = numberValue(input.offset)
    const limit = numberValue(input.limit)
    const args: string[] = []
    if (offset > 0) {
      args.push(`offset=${offset}`)
    }
    if (limit > 0) {
      args.push(`limit=${limit}`)
    }
    return (
      <>
        <FileRefText value={path} display={label} />
        {args.length > 0 ? ` [${args.join(", ")}]` : ""}
      </>
    )
  }
  if (part.tool === "lsp_diagnostics" && lspRendersInline(part)) {
    return renderLspToolTitle(part, { FileRefText, workspaceDir })
  }
  return toolRowTitle(part, details)
}

export function toolRowSubtitle(part: ToolPart, details: ToolDetails, workspaceDir = "") {
  const input = recordValue(part.state?.input)
  if (isMcpTool(part.tool)) {
    return ""
  }
  if (part.tool === "grep" || part.tool === "glob") {
    const rawPath = stringValue(input.path) || stringValue(input.filePath)
    const relPath = displayWorkspacePath(rawPath, workspaceDir)
    return relPath ? `in ${relPath}` : ""
  }
  if (part.tool === "read") {
    return ""
  }
  if (part.tool === "bash") {
    return stringValue(input.description) || details.subtitle
  }
  if (part.tool === "websearch") {
    return "Exa Web Search"
  }
  if (part.tool === "codesearch") {
    return "Exa Code Search"
  }
  if (part.tool === "glob" || part.tool === "grep" || part.tool === "list") {
    return stringValue(input.path) || details.subtitle
  }
  return details.subtitle
}

export function renderToolRowSubtitle(part: ToolPart, details: ToolDetails, options: {
  workspaceDir?: string
  FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element
}) {
  const { FileRefText, workspaceDir = "" } = options
  const input = recordValue(part.state?.input)
  if (isMcpTool(part.tool)) {
    return null
  }
  if (part.tool === "grep" || part.tool === "glob") {
    const rawPath = stringValue(input.path) || stringValue(input.filePath)
    const relPath = displayWorkspacePath(rawPath, workspaceDir)
    if (!relPath) {
      return null
    }
    return <span className="oc-partMeta">in <FileRefText value={rawPath} display={relPath} tone="muted" /></span>
  }
  if (part.tool === "list") {
    const value = stringValue(input.path) || details.subtitle
    if (!value) {
      return null
    }
    return <span className="oc-partMeta"><FileRefText value={value} display={value} tone="muted" /></span>
  }
  if (part.tool === "lsp_diagnostics" && lspRendersInline(part)) {
    return null
  }
  const subtitle = toolRowSubtitle(part, details, workspaceDir)
  return subtitle ? <span className="oc-partMeta">{subtitle}</span> : null
}

export function toolRowSummary(part: ToolPart) {
  const metadata = recordValue(part.state?.metadata)
  if (isMcpTool(part.tool)) {
    return ""
  }
  if (part.tool === "glob") {
    const count = numberValue(metadata.count)
    if (count > 0) {
      return `${count} ${count === 1 ? "match" : "matches"}`
    }
  }
  if (part.tool === "grep") {
    const count = numberValue(metadata.matches)
    if (count > 0) {
      return `${count} ${count === 1 ? "match" : "matches"}`
    }
  }
  if (part.tool === "websearch") {
    const count = numberValue(metadata.numResults) || numberValue(metadata.results)
    if (count > 0) {
      return `${count} results`
    }
  }
  if (part.tool === "codesearch") {
    const count = numberValue(metadata.results) || numberValue(metadata.numResults)
    if (count > 0) {
      return `${count} results`
    }
  }
  return ""
}

export function toolRowExtras(part: ToolPart) {
  const metadata = recordValue(part.state?.metadata)
  if (isMcpTool(part.tool)) {
    return [] as string[]
  }
  if (part.tool === "read") {
    return stringList(metadata.loaded).map((item) => `Loaded ${item}`)
  }
  return [] as string[]
}

export function renderToolRowExtra(part: ToolPart, item: string, FileRefText: ({ value, display, tone }: { value: string; display?: string; tone?: "default" | "muted" }) => React.JSX.Element) {
  if (part.tool === "read" && item.startsWith("Loaded ")) {
    const value = item.slice(7)
    return <><span>Loaded </span><FileRefText value={value} display={value} /></>
  }
  return item
}

export function taskAgentName(part: ToolPart) {
  const input = recordValue(part.state?.input)
  const metadata = recordValue(part.state?.metadata)
  return stringValue(input.subagent_type) || stringValue(metadata.agent) || stringValue(metadata.name) || "subagent"
}

export function taskSessionTitle(part: ToolPart, session?: SessionInfo) {
  if (session?.title?.trim()) {
    return session.title.trim()
  }

  const title = stringValue(part.state?.title) || toolDetails(part).title
  if (!title) {
    return "Task"
  }
  return title.toLowerCase().startsWith("task ") ? title : `Task ${title}`
}

export function taskBody(part: ToolPart, messages: SessionMessage[]) {
  const status = part.state?.status || "pending"
  if (status === "completed") {
    return taskSummary(part, messages)
  }
  const calls = childTools(messages).length
  const current = childCurrentTool(messages)
  const currentTool = current ? toolLabel(current.tool) : ""
  const currentTitle = current ? stringValue(current.state?.title) : ""
  const outputLines = (part.state?.output || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith("task_id:") && item !== "<task_result>" && item !== "</task_result>")
  if (currentTool && currentTitle) {
    return `${currentTool}: ${currentTitle}`
  }
  if (currentTitle) {
    return currentTitle
  }
  if (calls > 0) {
    return `${calls} ${calls === 1 ? "tool" : "tools"}`
  }
  if (status === "running") {
    return ""
  }
  if (outputLines.length > 0) {
    return outputLines[outputLines.length - 1]
  }
  return "Queued…"
}

function taskSummary(part: ToolPart, messages: SessionMessage[]) {
  const status = part.state?.status || "pending"
  if (status !== "completed") {
    return ""
  }

  const calls = childTools(messages).length
  const duration = childDuration(messages)
  const parts: string[] = []
  if (calls > 0) {
    parts.push(`${calls} tools`)
  }
  if (duration > 0) {
    parts.push(formatDuration(Math.round(duration / 1000)))
  }
  return parts.join(" · ")
}

function childTools(messages: SessionMessage[]) {
  return messages.flatMap((message) => message.parts.filter((part): part is ToolPart => part.type === "tool"))
}

function childCurrentTool(messages: SessionMessage[]) {
  const tools = childTools(messages)
  for (let index = tools.length - 1; index >= 0; index -= 1) {
    const part = tools[index]
    if (stringValue(part.state?.title)) {
      return part
    }
  }
  return tools[tools.length - 1]
}

function childDuration(messages: SessionMessage[]) {
  const start = messages.find((message) => message.info.role === "user")?.info.time.created
  const end = [...messages].reverse().find((message) => message.info.role === "assistant")?.info.time.completed
  if (typeof start !== "number" || typeof end !== "number" || end < start) {
    return 0
  }
  return end - start
}
