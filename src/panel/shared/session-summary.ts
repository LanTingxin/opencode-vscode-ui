import type { SessionSnapshot } from "../../bridge/types"

export function summarizeSessionSnapshot(payload: Omit<SessionSnapshot, "message">) {
  if (payload.permissions.length > 0) {
    return "Session is waiting for a permission decision."
  }

  if (payload.questions.length > 0) {
    return "Session is waiting for your answer."
  }

  if (payload.submitting) {
    return "Sending message to workspace runtime."
  }

  const status = payload.sessionStatus ?? { type: "idle" as const }
  if (status.type === "busy") {
    return `Session is responding. ${payload.messages.length} messages loaded.`
  }

  if (status.type === "retry") {
    return `Session is retrying. ${payload.messages.length} messages loaded.`
  }

  if (payload.messages.length === 0) {
    return "Session is ready. Send the first message to start the conversation."
  }

  if (payload.todos.length > 0) {
    return `Session is ready. ${payload.todos.length} todo items are being tracked.`
  }

  return `Session is ready. ${payload.messages.length} messages loaded.`
}
