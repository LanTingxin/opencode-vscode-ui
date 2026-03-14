import type { HostMessage, SessionSnapshot } from "../../../bridge/types"

type HostMessageTrace = {
  id: number
  label: string
  receivedAt: number
  reason?: string
}

export type AppliedHostMessageTrace = HostMessageTrace & {
  reducedAt: number
  reduceMs: number
  normalizeMs: number
  messagesBefore: number
  messagesAfter: number
  changedMessages: number
  replacedMessages: number
  changedFields: string[]
}

const RECENT_TRACE_LIMIT = 24
const recentTraces: AppliedHostMessageTrace[] = []
const pendingRenderTraces: AppliedHostMessageTrace[] = []
let sequence = 0

export const HOST_MESSAGE_TRACE_WINDOW_MS = 1500
export const SLOW_HOST_MESSAGE_MS = 100
export const SLOW_RENDER_MS = 100

export function beginHostMessageTrace(message: HostMessage): HostMessageTrace | null {
  if (message.type === "sessionEvent") {
    return {
      id: ++sequence,
      label: `sessionEvent:${message.event.type}`,
      receivedAt: now(),
    }
  }

  if (message.type === "snapshot") {
    return {
      id: ++sequence,
      label: "snapshot",
      receivedAt: now(),
      reason: message.reason,
    }
  }

  if (message.type === "deferredUpdate") {
    return {
      id: ++sequence,
      label: "deferredUpdate",
      receivedAt: now(),
      reason: message.reason,
    }
  }

  return null
}

export function completeHostMessageTrace(trace: HostMessageTrace | null, meta: {
  reduceMs: number
  normalizeMs?: number
  messagesBefore: number
  messagesAfter: number
  changedMessages: number
  replacedMessages?: number
  changedFields?: string[]
}) {
  if (!trace) {
    return null
  }

  const completed: AppliedHostMessageTrace = {
    ...trace,
    reducedAt: now(),
    reduceMs: meta.reduceMs,
    normalizeMs: meta.normalizeMs ?? 0,
    messagesBefore: meta.messagesBefore,
    messagesAfter: meta.messagesAfter,
    changedMessages: meta.changedMessages,
    replacedMessages: meta.replacedMessages ?? 0,
    changedFields: meta.changedFields ?? [],
  }
  recentTraces.push(completed)
  pendingRenderTraces.push(completed)
  while (recentTraces.length > RECENT_TRACE_LIMIT) {
    recentTraces.shift()
  }
  return completed
}

export function recentHostMessageTraces(windowMs = HOST_MESSAGE_TRACE_WINDOW_MS, currentTime = now()) {
  return recentTraces.filter((trace) => currentTime - trace.reducedAt <= windowMs)
}

export function peekPendingHostMessageTraces() {
  return pendingRenderTraces.slice()
}

export function consumePendingHostMessageTraces(traceIDs: number[]) {
  if (traceIDs.length === 0) {
    return
  }

  const ids = new Set(traceIDs)
  let writeIndex = 0
  for (let index = 0; index < pendingRenderTraces.length; index += 1) {
    const trace = pendingRenderTraces[index]
    if (!trace || ids.has(trace.id)) {
      continue
    }
    pendingRenderTraces[writeIndex] = trace
    writeIndex += 1
  }
  pendingRenderTraces.length = writeIndex
}

export function formatHostMessageTrace(trace: AppliedHostMessageTrace, currentTime = now()) {
  const age = currentTime - trace.reducedAt
  const reason = trace.reason ? ` reason=${trace.reason}` : ""
  const fields = trace.changedFields.length > 0 ? ` fields=${trace.changedFields.join(",")}` : ""
  return `#${trace.id} ${trace.label}${reason} age=${age.toFixed(1)}ms reduce=${trace.reduceMs.toFixed(2)}ms normalize=${trace.normalizeMs.toFixed(2)}ms messages=${trace.messagesBefore}->${trace.messagesAfter} changed=${trace.changedMessages} replaced=${trace.replacedMessages}${fields}`
}

export function countChangedMessages(before: { info: { id: string } }[], after: { info: { id: string } }[]) {
  const shared = Math.min(before.length, after.length)
  let changed = Math.abs(before.length - after.length)

  for (let index = 0; index < shared; index += 1) {
    if (before[index] !== after[index]) {
      changed += 1
    }
  }

  return changed
}

export function countReplacedMessages(before: { info: { id: string } }[], after: { info: { id: string } }[]) {
  const shared = Math.min(before.length, after.length)
  let replaced = 0

  for (let index = 0; index < shared; index += 1) {
    const left = before[index]
    const right = after[index]
    if (left?.info.id === right?.info.id && left !== right) {
      replaced += 1
    }
  }

  return replaced
}

export function summarizeSnapshotFieldChanges(before: SessionSnapshot, after: SessionSnapshot) {
  const fields: string[] = []
  if (before.messages !== after.messages) fields.push("messages")
  if (before.childMessages !== after.childMessages) fields.push("childMessages")
  if (before.childSessions !== after.childSessions) fields.push("childSessions")
  if (before.session !== after.session) fields.push("session")
  if (before.sessionStatus !== after.sessionStatus) fields.push("sessionStatus")
  if (before.submitting !== after.submitting) fields.push("submitting")
  if (before.permissions !== after.permissions) fields.push("permissions")
  if (before.questions !== after.questions) fields.push("questions")
  if (before.todos !== after.todos) fields.push("todos")
  if (before.diff !== after.diff) fields.push("diff")
  if (before.agents !== after.agents) fields.push("agents")
  if (before.defaultAgent !== after.defaultAgent) fields.push("defaultAgent")
  if (before.providers !== after.providers) fields.push("providers")
  if (before.providerDefault !== after.providerDefault) fields.push("providerDefault")
  if (before.configuredModel !== after.configuredModel) fields.push("configuredModel")
  if (before.mcp !== after.mcp) fields.push("mcp")
  if (before.mcpResources !== after.mcpResources) fields.push("mcpResources")
  if (before.lsp !== after.lsp) fields.push("lsp")
  if (before.commands !== after.commands) fields.push("commands")
  if (before.relatedSessionIds !== after.relatedSessionIds) fields.push("relatedSessionIds")
  if (before.agentMode !== after.agentMode) fields.push("agentMode")
  if (before.navigation !== after.navigation) fields.push("navigation")
  if (before.status !== after.status) fields.push("status")
  if (before.workspaceName !== after.workspaceName) fields.push("workspaceName")
  if (before.message !== after.message) fields.push("message")
  return fields
}

function now() {
  return globalThis.performance?.now() ?? Date.now()
}
