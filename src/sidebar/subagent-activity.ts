import { summarizeSubagentBody } from "../core/subagent-summary"
import type { SessionMessage, SessionStatus } from "../core/sdk"
import { toolLabel } from "../panel/webview/lib/tool-meta"

export function summarizeSubagentActivity(status: SessionStatus, messages: SessionMessage[]) {
  return summarizeSubagentBody({
    status: status.type === "idle" ? "completed" : "running",
    messages,
    toolLabel,
  })
}
