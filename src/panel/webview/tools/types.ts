import type { MessagePart } from "../../../core/sdk"

export type ToolPart = Extract<MessagePart, { type: "tool" }>

export type ToolDetails = {
  title: string
  subtitle: string
  args: string[]
}

export type ToolFileSummary = {
  path: string
  summary: string
}
