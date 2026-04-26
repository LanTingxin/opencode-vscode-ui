import React from "react"

import type { MessageInfo, MessagePart, ProviderInfo, SessionInfo, SessionMessage } from "../../../core/sdk"
import { displayModelRef, displayProviderRef, lastAssistantWithOutput, modelContextLimitForRef, sessionCost, totalTokens } from "../lib/session-meta"

type ContextMetrics = {
  totalCost: number
  context?: {
    message: SessionMessage
    providerLabel: string
    modelLabel: string
    limit?: number
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
    total: number
    usage: number | null
  }
}

type ContextBreakdownKey = "system" | "user" | "assistant" | "tool" | "other"

type ContextBreakdownSegment = {
  key: ContextBreakdownKey
  tokens: number
  width: number
  percent: number
}

const BREAKDOWN_LABELS: Record<ContextBreakdownKey, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
  other: "Other",
}

type JsonToken =
  | { kind: "punctuation"; text: string }
  | { kind: "key"; text: string }
  | { kind: "string"; text: string }
  | { kind: "number"; text: string }
  | { kind: "literal"; text: string }

export function ContextPanel({
  session,
  messages,
  providers,
}: {
  session?: SessionInfo
  messages: SessionMessage[]
  providers: ProviderInfo[]
}) {
  const metrics = getSessionContextMetrics(messages, providers)
  const breakdown = metrics.context
    ? estimateContextBreakdown({
        messages,
        input: metrics.context.input,
      })
    : []
  const counts = messageCounts(messages)

  return (
    <div className="oc-contextPanel">
      <div className="oc-contextGrid">
        <ContextStat label="Session" value={session?.title || session?.id || "—"} />
        <ContextStat label="Messages" value={formatNumber(counts.all)} />
        <ContextStat label="Provider" value={metrics.context?.providerLabel || "—"} />
        <ContextStat label="Model" value={metrics.context?.modelLabel || "—"} />
        <ContextStat label="Context limit" value={formatMaybeNumber(metrics.context?.limit)} />
        <ContextStat label="Total token" value={formatMaybeNumber(metrics.context?.total)} />
        <ContextStat label="Usage" value={formatPercent(metrics.context?.usage)} />
        <ContextStat label="Input token" value={formatMaybeNumber(metrics.context?.input)} />
        <ContextStat label="Output token" value={formatMaybeNumber(metrics.context?.output)} />
        <ContextStat label="Reasoning token" value={formatMaybeNumber(metrics.context?.reasoning)} />
        <ContextStat
          label="Cache token (read/write)"
          value={`${formatMaybeNumber(metrics.context?.cacheRead)} / ${formatMaybeNumber(metrics.context?.cacheWrite)}`}
        />
        <ContextStat label="User messages" value={formatNumber(counts.user)} />
        <ContextStat label="Assistant messages" value={formatNumber(counts.assistant)} />
        <ContextStat label="Total cost" value={formatCurrency(metrics.totalCost)} />
        <ContextStat label="Created" value={formatDateTime(session?.time.created)} />
        <ContextStat label="Last activity" value={formatDateTime(session?.time.updated)} />
      </div>

      {breakdown.length > 0 ? (
        <section className="oc-contextSection">
          <div className="oc-contextSectionTitle">Context breakdown</div>
          <div className="oc-contextBreakdownBar" aria-hidden="true">
            {breakdown.map((segment) => (
              <span
                key={segment.key}
                className={`oc-contextBreakdownSegment is-${segment.key}`}
                style={{ width: `${segment.width}%` }}
              />
            ))}
          </div>
          <div className="oc-contextLegend">
            {breakdown.map((segment) => (
              <div key={`${segment.key}:legend`} className="oc-contextLegendItem">
                <span className={`oc-contextLegendSwatch is-${segment.key}`} />
                <span>{BREAKDOWN_LABELS[segment.key]}</span>
                <span className="oc-contextLegendValue">{segment.percent}%</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="oc-contextSection">
        <div className="oc-contextSectionTitle">Raw messages</div>
        {messages.length > 0 ? (
          <div className="oc-contextMessages">
            {messages.map((message) => (
              <details key={message.info.id} className="oc-contextMessage">
                <summary className="oc-contextMessageSummary">
                  <span className="oc-contextMessageIdentity">
                    {message.info.role} <span className="oc-contextMessageID">• {message.info.id}</span>
                  </span>
                  <span className="oc-contextMessageTime">{formatDateTime(message.info.time.created)}</span>
                </summary>
                <JsonMessageBody value={{ info: message.info, parts: message.parts }} />
              </details>
            ))}
          </div>
        ) : (
          <div className="oc-contextEmpty">No messages yet.</div>
        )}
      </section>
    </div>
  )
}

function JsonMessageBody({ value }: { value: unknown }) {
  return (
    <pre className="oc-contextMessageBody">
      {highlightJson(JSON.stringify(value, null, 2)).map((line, index) => (
        <span key={index} className="oc-contextJsonLine">
          <span className="oc-contextJsonLineNumber">{index + 1}</span>
          <span className="oc-contextJsonLineContent">
            {line.map((token, tokenIndex) => (
              <span key={tokenIndex} className={`oc-contextJsonToken oc-contextJson${capitalizeTokenKind(token.kind)}`}>
                {token.text}
              </span>
            ))}
          </span>
        </span>
      ))}
    </pre>
  )
}

function highlightJson(value: string): JsonToken[][] {
  return value.split("\n").map((line) => {
    const tokens: JsonToken[] = []
    let index = 0
    while (index < line.length) {
      const char = line[index]
      if (char === "\"") {
        const end = findJsonStringEnd(line, index)
        const text = line.slice(index, end)
        const rest = line.slice(end)
        tokens.push({
          kind: /^\s*:/.test(rest) ? "key" : "string",
          text,
        })
        index = end
        continue
      }

      const number = line.slice(index).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)
      if (number) {
        tokens.push({ kind: "number", text: number[0] })
        index += number[0].length
        continue
      }

      const literal = line.slice(index).match(/^(true|false|null)/)
      if (literal) {
        tokens.push({ kind: "literal", text: literal[0] })
        index += literal[0].length
        continue
      }

      tokens.push({ kind: "punctuation", text: char })
      index += 1
    }
    return tokens
  })
}

function findJsonStringEnd(line: string, start: number) {
  let escaped = false
  for (let index = start + 1; index < line.length; index += 1) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === "\"") {
      return index + 1
    }
  }
  return line.length
}

function capitalizeTokenKind(kind: JsonToken["kind"]) {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function ContextStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="oc-contextStat">
      <div className="oc-contextStatLabel">{label}</div>
      <div className="oc-contextStatValue">{value}</div>
    </div>
  )
}

function getSessionContextMetrics(messages: SessionMessage[], providers: ProviderInfo[]): ContextMetrics {
  const totalCost = sessionCost(messages)
  const message = lastAssistantWithOutput(messages)
  const info = message?.info
  const total = totalTokens(info)

  if (!message || !info || total <= 0) {
    return { totalCost }
  }

  const model = contextModelRef(info)
  const limit = modelContextLimitForRef(model, providers)
  return {
    totalCost,
    context: {
      message,
      providerLabel: displayProviderRef(model, providers) || "—",
      modelLabel: displayModelRef(model, providers) || "—",
      limit,
      input: info.tokens?.input ?? 0,
      output: info.tokens?.output ?? 0,
      reasoning: info.tokens?.reasoning ?? 0,
      cacheRead: info.tokens?.cache.read ?? 0,
      cacheWrite: info.tokens?.cache.write ?? 0,
      total,
      usage: typeof limit === "number" && limit > 0 ? Math.round((total / limit) * 100) : null,
    },
  }
}

function contextModelRef(info: MessageInfo): MessageInfo["model"] {
  if (info.model?.providerID && info.model.modelID) {
    return info.model
  }

  const legacy = info as MessageInfo & {
    providerID?: unknown
    modelID?: unknown
  }
  return typeof legacy.providerID === "string" && typeof legacy.modelID === "string"
    ? {
        providerID: legacy.providerID,
        modelID: legacy.modelID,
      }
    : undefined
}

function estimateContextBreakdown({
  messages,
  input,
}: {
  messages: SessionMessage[]
  input: number
}): ContextBreakdownSegment[] {
  if (!input) {
    return []
  }

  const counts = messages.reduce(
    (acc, message) => {
      if (message.info.role === "user") {
        return {
          ...acc,
          user: acc.user + message.parts.reduce((sum, part) => sum + charsFromUserPart(part), 0),
        }
      }

      if (message.info.role !== "assistant") {
        return acc
      }

      const next = message.parts.reduce(
        (sum, part) => {
          const values = charsFromAssistantPart(part)
          return {
            assistant: sum.assistant + values.assistant,
            tool: sum.tool + values.tool,
          }
        },
        { assistant: 0, tool: 0 },
      )

      return {
        ...acc,
        assistant: acc.assistant + next.assistant,
        tool: acc.tool + next.tool,
      }
    },
    {
      system: 0,
      user: 0,
      assistant: 0,
      tool: 0,
    },
  )

  const tokens = {
    system: estimateTokens(counts.system),
    user: estimateTokens(counts.user),
    assistant: estimateTokens(counts.assistant),
    tool: estimateTokens(counts.tool),
  }
  const estimated = tokens.system + tokens.user + tokens.assistant + tokens.tool

  if (estimated <= input) {
    return buildBreakdown({ ...tokens, other: input - estimated }, input)
  }

  const scale = input / estimated
  const scaled = {
    system: Math.floor(tokens.system * scale),
    user: Math.floor(tokens.user * scale),
    assistant: Math.floor(tokens.assistant * scale),
    tool: Math.floor(tokens.tool * scale),
  }
  const total = scaled.system + scaled.user + scaled.assistant + scaled.tool

  return buildBreakdown({ ...scaled, other: Math.max(0, input - total) }, input)
}

function buildBreakdown(
  tokens: Record<ContextBreakdownKey, number>,
  input: number,
): ContextBreakdownSegment[] {
  return (Object.entries(tokens) as Array<[ContextBreakdownKey, number]>)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      key,
      tokens: value,
      width: toPercent(value, input),
      percent: toPercentLabel(value, input),
    }))
}

function charsFromUserPart(part: MessagePart) {
  if (part.type === "text") {
    return part.text.length
  }
  if (part.type === "file") {
    if (part.source?.type === "file" || part.source?.type === "resource" || part.source?.type === "symbol") {
      return part.source.text.value.length
    }
    return 0
  }
  if (part.type === "agent") {
    const source = valueRecord(part.source)
    return typeof source.value === "string" ? source.value.length : 0
  }
  return 0
}

function charsFromAssistantPart(part: MessagePart) {
  if (part.type === "text" || part.type === "reasoning") {
    return { assistant: part.text.length, tool: 0 }
  }

  if (part.type !== "tool") {
    return { assistant: 0, tool: 0 }
  }

  const inputSize = JSON.stringify(part.state.input ?? {}).length
  if (part.state.status === "error") {
    return { assistant: 0, tool: inputSize + (part.state.error?.length ?? 0) }
  }
  if (part.state.status === "completed") {
    return { assistant: 0, tool: inputSize + (part.state.output?.length ?? 0) }
  }
  if (part.state.status === "running") {
    return { assistant: 0, tool: inputSize + (part.state.output?.length ?? 0) }
  }

  return { assistant: 0, tool: inputSize }
}

function estimateTokens(chars: number) {
  return Math.ceil(chars / 4)
}

function toPercent(tokens: number, input: number) {
  return (tokens / input) * 100
}

function toPercentLabel(tokens: number, input: number) {
  return Math.round(toPercent(tokens, input) * 10) / 10
}

function messageCounts(messages: SessionMessage[]) {
  return messages.reduce(
    (acc, message) => ({
      all: acc.all + 1,
      user: acc.user + (message.info.role === "user" ? 1 : 0),
      assistant: acc.assistant + (message.info.role === "assistant" ? 1 : 0),
    }),
    {
      all: 0,
      user: 0,
      assistant: 0,
    },
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function formatMaybeNumber(value?: number) {
  return typeof value === "number" ? formatNumber(value) : "—"
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${value}%` : "—"
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value)
}

function formatDateTime(value?: number) {
  if (typeof value !== "number") {
    return "—"
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function valueRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}
