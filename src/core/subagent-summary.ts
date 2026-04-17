import type { MessagePart, SessionMessage } from "./sdk"

type ToolPart = Extract<MessagePart, { type: "tool" }>

export function summarizeSubagentBody(input: {
  status: string
  messages: SessionMessage[]
  output?: string
  toolLabel: (tool: string) => string
}) {
  const { status, messages, output = "", toolLabel } = input

  if (status === "completed") {
    return completedSummary(messages)
  }

  const calls = childTools(messages).length
  const current = childCurrentTool(messages)
  const currentTool = current ? toolLabel(current.tool) : ""
  const currentTitle = current ? stringValue(current.state?.title) : ""
  const outputLines = output
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

  if (status === "running" || status === "pending") {
    return ""
  }

  if (outputLines.length > 0) {
    return outputLines[outputLines.length - 1]
  }

  return "Queued…"
}

function completedSummary(messages: SessionMessage[]) {
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (!rest) {
    return `${minutes}m`
  }
  return `${minutes}m ${rest}s`
}
