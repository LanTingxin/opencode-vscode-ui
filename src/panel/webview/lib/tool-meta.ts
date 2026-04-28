import type { MessagePart } from "../../../core/sdk"
import type { ToolDetails, ToolFileSummary } from "../tools/types"
import { capitalize, diffSummary, formatDiagnostic, formatToolName, numberValue, parentDir, recordValue, stringList, stringValue } from "./part-utils"

const KNOWN_TOOLS = new Set([
  "apply_patch",
  "batch",
  "bash",
  "codesearch",
  "doom_loop",
  "edit",
  "external_directory",
  "glob",
  "grep",
  "invalid",
  "list",
  "lsp",
  "lsp_diagnostics",
  "plan_exit",
  "question",
  "read",
  "skill",
  "task",
  "todowrite",
  "webfetch",
  "websearch",
  "write",
])

export function isMcpTool(tool: string) {
  return !!tool && !KNOWN_TOOLS.has(tool) && !tool.startsWith("lsp_")
}

export function toolLabel(tool: string) {
  if (isMcpTool(tool)) {
    return "mcp"
  }
  if (tool === "bash") {
    return "shell"
  }
  if (tool === "todowrite") {
    return "to-dos"
  }
  if (tool === "lsp" || tool.startsWith("lsp_")) {
    return "lsp"
  }
  return tool || "tool"
}

export function toolDetails(part: Extract<MessagePart, { type: "tool" }>): ToolDetails {
  const input = recordValue(part.state?.input)
  const metadata = recordValue(part.state?.metadata)
  const title = part.tool === "apply_patch"
    ? defaultToolTitle(part.tool, input, metadata)
    : stringValue(part.state?.title) || defaultToolTitle(part.tool, input, metadata)
  const subtitle = defaultToolSubtitle(part.tool, input, metadata)
  const args = defaultToolArgs(part.tool, input)
  return { title, subtitle, args }
}

export function defaultToolTitle(tool: string, input: Record<string, unknown>, metadata: Record<string, unknown>) {
  if (tool === "bash") {
    return stringValue(input.description) || "Shell command"
  }
  if (tool === "task") {
    return stringValue(input.description) || `${capitalize(stringValue(input.subagent_type) || "task")} task`
  }
  if (tool === "lsp_diagnostics") {
    return "LSP diagnostics"
  }
  if (tool === "lsp" || tool.startsWith("lsp_")) {
    return formatToolName(tool)
  }
  if (tool === "webfetch") {
    return stringValue(input.url) || "Web fetch"
  }
  if (tool === "websearch" || tool === "codesearch") {
    return stringValue(input.query) || capitalize(tool)
  }
  if (tool === "read") {
    return stringValue(input.filePath) || stringValue(input.path) || "Read"
  }
  if (tool === "list") {
    return stringValue(input.path) || "List directory"
  }
  if (tool === "glob" || tool === "grep") {
    return stringValue(input.path) || capitalize(tool)
  }
  if (tool === "apply_patch") {
    return "Patch"
  }
  if (tool === "write" || tool === "edit") {
    return stringValue(input.filePath) || stringValue(input.path) || stringValue(metadata.filepath) || capitalize(tool)
  }
  if (tool === "todowrite") {
    const todos = toolTodosFromMetadata(metadata)
    return todos.length > 0 ? `${todos.filter((item) => item.status === "completed").length}/${todos.length}` : "Updating todos"
  }
  if (tool === "question") {
    const questions = numberValue(metadata.count) || stringList(metadata.questions).length
    return questions > 0 ? `${questions} question${questions === 1 ? "" : "s"}` : "Questions"
  }
  if (tool === "skill") {
    return stringValue(input.name) || "Skill"
  }
  return capitalize(tool)
}

export function defaultToolSubtitle(tool: string, input: Record<string, unknown>, metadata: Record<string, unknown>) {
  if (tool === "bash") {
    return stringValue(input.command)
  }
  if (tool === "task") {
    return stringValue(metadata.sessionID) || stringValue(input.subagent_type)
  }
  if (tool === "webfetch") {
    return stringValue(input.url)
  }
  if (tool === "websearch" || tool === "codesearch") {
    return stringValue(input.query)
  }
  if (tool === "read" || tool === "list" || tool === "glob" || tool === "grep") {
    return stringValue(input.path) || stringValue(input.filePath)
  }
  if (tool === "write" || tool === "edit" || tool === "apply_patch") {
    return stringValue(metadata.directory) || parentDir(stringValue(input.filePath) || stringValue(input.path) || stringValue(metadata.filepath))
  }
  if (tool === "skill") {
    return stringValue(input.name)
  }
  return ""
}

export function defaultToolArgs(tool: string, input: Record<string, unknown>) {
  const args: string[] = []
  if (tool === "glob" || tool === "grep") {
    const pattern = stringValue(input.pattern)
    if (pattern) {
      args.push(`pattern=${pattern}`)
    }
  }
  if (tool === "grep") {
    const include = stringValue(input.include)
    if (include) {
      args.push(`include=${include}`)
    }
  }
  if (tool === "read") {
    const offset = numberValue(input.offset)
    const limit = numberValue(input.limit)
    if (offset > 0) {
      args.push(`offset=${offset}`)
    }
    if (limit > 0) {
      args.push(`limit=${limit}`)
    }
  }
  return args
}

export function toolTextBody(part: Extract<MessagePart, { type: "tool" }>) {
  const lines: string[] = []
  const input = recordValue(part.state?.input)
  const metadata = recordValue(part.state?.metadata)
  if (part.tool === "bash") {
    const command = stringValue(input.command)
    if (command) {
      lines.push(`$ ${command}`)
    }
    const output = stringValue(metadata.output) || part.state?.output || ""
    if (output) {
      lines.push(output)
    }
    if (part.state?.error) {
      lines.push(part.state.error)
    }
    return lines.join("\n\n")
  }
  if (part.state?.output) {
    lines.push(part.state.output)
  }
  if (part.state?.error) {
    lines.push(part.state.error)
  }
  if (lines.length === 0 && Object.keys(metadata).length > 0) {
    lines.push(JSON.stringify(metadata, null, 2))
  }
  return lines.join("\n\n")
}

export function defaultToolExpanded(part: Extract<MessagePart, { type: "tool" }>, active: boolean, hasBody: boolean) {
  const status = part.state?.status || "pending"
  if (active || status === "running" || status === "pending" || status === "error") {
    return true
  }
  if (part.tool === "skill") {
    return false
  }
  if (part.tool === "bash" || part.tool === "apply_patch") {
    return true
  }
  if (part.tool === "bash" || part.tool === "edit" || part.tool === "write" || part.tool === "apply_patch") {
    return hasBody && status !== "completed"
  }
  return false
}

export function toolChildSessionId(part: Extract<MessagePart, { type: "tool" }>) {
  const metadata = recordValue(part.state?.metadata)
  const candidates = [
    metadata.sessionID,
    metadata.sessionId,
    metadata.childSessionID,
    metadata.childSessionId,
    metadata.session,
  ]

  for (const item of candidates) {
    const value = stringValue(item)
    if (value) {
      return value
    }
  }

  return ""
}

export function toolFiles(part: Extract<MessagePart, { type: "tool" }>): ToolFileSummary[] {
  const input = recordValue(part.state?.input)
  const metadata = recordValue(part.state?.metadata)
  if (part.tool === "apply_patch") {
    const files = stringList(metadata.files)
    return files.map((file) => ({ path: file, summary: "patched" }))
  }
  const path = stringValue(input.filePath) || stringValue(input.path) || stringValue(metadata.filepath)
  if (!path) {
    return []
  }
  const summary = part.tool === "edit"
    ? diffSummary(stringValue(metadata.diff))
    : part.tool === "write"
      ? "written"
      : "updated"
  return [{ path, summary }]
}

export function toolWriteContent(part: Extract<MessagePart, { type: "tool" }>) {
  const input = recordValue(part.state?.input)
  return stringValue(input.content)
}

export function toolWriteDiff(part: Extract<MessagePart, { type: "tool" }>) {
  const input = recordValue(part.state?.input)
  const metadata = recordValue(part.state?.metadata)
  const path = stringValue(input.filePath) || stringValue(input.path) || stringValue(metadata.filepath) || "untitled"
  const content = toolWriteContent(part)
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const hasTrailingNewline = normalized.endsWith("\n")
  const lines = normalized ? normalized.split("\n") : []
  if (hasTrailingNewline) {
    lines.pop()
  }
  const hunkSize = lines.length
  const body = lines.map((line) => `+${line}`).join("\n")
  const out = [
    `--- /dev/null`,
    `+++ b/${path}`,
    `@@ -0,0 +1,${hunkSize} @@`,
  ]
  if (body) {
    out.push(body)
  }
  if (normalized && !hasTrailingNewline) {
    out.push("\\ No newline at end of file")
  }
  return out.join("\n")
}

export function toolEditDiff(part: Extract<MessagePart, { type: "tool" }>) {
  const metadata = recordValue(part.state?.metadata)
  return stringValue(metadata.diff)
}

export function toolDiagnostics(part: Extract<MessagePart, { type: "tool" }>) {
  const metadata = recordValue(part.state?.metadata)
  const value = metadata.diagnostics
  if (!Array.isArray(value)) {
    return [] as string[]
  }
  return value
    .map((item) => formatDiagnostic(recordValue(item)))
    .filter(Boolean)
}

export function lspRendersInline(part: Extract<MessagePart, { type: "tool" }>) {
  if (part.tool !== "lsp_diagnostics") {
    return false
  }
  return toolDiagnostics(part).length === 0 && toolTextBody(part).trim() === "No diagnostics found"
}

export function patchFiles(part: Extract<MessagePart, { type: "tool" }>) {
  const metadata = recordValue(part.state?.metadata)
  const value = metadata.files
  if (!Array.isArray(value)) {
    return [] as Array<{ path: string; type: string; summary: string; diff: string }>
  }
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const type = stringValue(item.type) || "update"
      const path = stringValue(item.relativePath) || stringValue(item.filePath) || stringValue(item.movePath)
      const diff = stringValue(item.diff)
      const additions = numberValue(item.additions)
      const deletions = numberValue(item.deletions)
      const summary = patchSummary(type, additions, deletions, stringValue(item.movePath), stringValue(item.filePath))
      return { path, type, summary, diff }
    })
    .filter((item) => !!item.path)
}

export function patchSummary(type: string, additions: number, deletions: number, movePath: string, filePath: string) {
  if (type === "delete") {
    return deletions > 0 ? `-${deletions}` : "deleted"
  }
  if (type === "add") {
    return additions > 0 ? `+${additions}` : "created"
  }
  if (type === "move") {
    return movePath && filePath ? `${filePath} → ${movePath}` : "moved"
  }
  if (additions > 0 || deletions > 0) {
    return `+${additions} / -${deletions}`
  }
  return "patched"
}

export function toolTodos(part: Extract<MessagePart, { type: "tool" }>) {
  return toolTodosFromMetadata(recordValue(part.state?.metadata))
}

export function toolTodosFromMetadata(metadata: Record<string, unknown>) {
  const value = metadata.todos
  if (!Array.isArray(value)) {
    return [] as Array<{ content: string; status: string }>
  }
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      content: stringValue(item.content),
      status: stringValue(item.status) || "pending",
    }))
    .filter((item) => !!item.content)
}

export function mcpDisplayTitle(part: Extract<MessagePart, { type: "tool" }>) {
  const input = recordValue(part.state?.input)
  const name = mcpName(part.tool)
  const args = mcpArgs(input)
  return args ? `${name} [${args}]` : name
}

export function mcpName(tool: string) {
  const idx = tool.indexOf("_")
  return idx > 0 ? tool.slice(0, idx) : tool
}

function mcpArgs(input: Record<string, unknown>) {
  return Object.entries(input)
    .flatMap(([key, value]) => {
      const item = mcpArgValue(value)
      return item ? [`${key}=${item}`] : []
    })
    .join(", ")
}

function mcpArgValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim()
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => mcpArgValue(item)).filter(Boolean)
    return items.length ? `[${items.join(", ")}]` : ""
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value)
  }
  return ""
}
