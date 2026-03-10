import React from "react"
import type { FilePart, MessageInfo, MessagePart, SessionMessage, TextPart } from "../../../core/sdk"
import { TranscriptVisibilityContext } from "./contexts"
import type { AppState } from "./state"

type TimelineBlock =
  | { kind: "user-message"; key: string; message: SessionMessage; queued: boolean }
  | { kind: "assistant-part"; key: string; part: MessagePart }
  | { kind: "assistant-meta"; key: string; messages: SessionMessage[] }

export function Timeline({
  state,
  AgentBadge,
  CompactionDivider,
  EmptyState,
  MarkdownBlock,
  PartView,
}: {
  state: AppState
  AgentBadge: ({ name }: { name: string }) => React.JSX.Element
  CompactionDivider: () => React.JSX.Element
  EmptyState: ({ title, text }: { title: string; text: string }) => React.JSX.Element
  MarkdownBlock: ({ content, className }: { content: string; className?: string }) => React.JSX.Element
  PartView: ({ part, active, diffMode }: { part: MessagePart; active?: boolean; diffMode?: "unified" | "split" }) => React.JSX.Element
}) {
  const messages = state.snapshot.messages
  const [showThinking, setShowThinking] = React.useState(true)
  const [showInternals, setShowInternals] = React.useState(false)
  const [diffMode, setDiffMode] = React.useState<"unified" | "split">("unified")

  if (state.bootstrap.status === "error") {
    return <EmptyState title="Session unavailable" text={state.bootstrap.message || "The workspace runtime is not ready."} />
  }

  if (state.bootstrap.status !== "ready" && messages.length === 0) {
    return <EmptyState title="Connecting to workspace" text={state.bootstrap.message || "Waiting for workspace runtime."} />
  }

  if (messages.length === 0) {
    return <EmptyState title="Start this session" text="Send a message below. Pending permission and question requests will appear in the lower dock." />
  }

  const blocks = buildTimelineBlocks(messages, { showThinking, showInternals })
  const activeToolID = latestActiveToolId(blocks.flatMap((block) => block.kind === "assistant-part" ? [block.part] : []))
  const hasPatchDiff = blocks.some((block) => block.kind === "assistant-part" && block.part.type === "tool" && block.part.tool === "apply_patch")

  return (
    <TranscriptVisibilityContext.Provider value={{ showThinking, showInternals }}>
      <div className="oc-log">
        <div className="oc-transcriptTools">
          <button type="button" className={`oc-toggleBtn${showThinking ? " is-active" : ""}`} onClick={() => setShowThinking((current) => !current)}>
            Thinking {showThinking ? "on" : "off"}
          </button>
          <button type="button" className={`oc-toggleBtn${showInternals ? " is-active" : ""}`} onClick={() => setShowInternals((current) => !current)}>
            Internals {showInternals ? "on" : "off"}
          </button>
          {hasPatchDiff ? (
            <div className="oc-transcriptToggleGroup" role="group" aria-label="Diff view mode">
              <button type="button" className={`oc-toggleBtn${diffMode === "unified" ? " is-active" : ""}`} onClick={() => setDiffMode("unified")}>
                Unified
              </button>
              <button type="button" className={`oc-toggleBtn${diffMode === "split" ? " is-active" : ""}`} onClick={() => setDiffMode("split")}>
                Split
              </button>
            </div>
          ) : null}
        </div>
        {blocks.map((block) => (
          <TimelineBlockView
            key={block.key}
            AgentBadge={AgentBadge}
            CompactionDivider={CompactionDivider}
            MarkdownBlock={MarkdownBlock}
            PartView={PartView}
            activeToolID={activeToolID}
            block={block}
            diffMode={diffMode}
          />
        ))}
      </div>
    </TranscriptVisibilityContext.Provider>
  )
}

function TimelineBlockView({
  AgentBadge,
  CompactionDivider,
  MarkdownBlock,
  PartView,
  activeToolID,
  block,
  diffMode,
}: {
  AgentBadge: ({ name }: { name: string }) => React.JSX.Element
  CompactionDivider: () => React.JSX.Element
  MarkdownBlock: ({ content, className }: { content: string; className?: string }) => React.JSX.Element
  PartView: ({ part, active, diffMode }: { part: MessagePart; active?: boolean; diffMode?: "unified" | "split" }) => React.JSX.Element
  activeToolID: string
  block: TimelineBlock
  diffMode: "unified" | "split"
}) {
  if (block.kind === "user-message") {
    const userText = primaryUserText(block.message)
    const userFiles = userAttachments(block.message)
    const hasCompaction = userHasCompaction(block.message)
    if (hasCompaction && !userText && userFiles.length === 0) {
      return <CompactionDivider />
    }
    return (
      <>
        {hasCompaction ? <CompactionDivider /> : null}
        <section className="oc-turnUser">
          <div className="oc-entryHeader">
            <div className="oc-entryRole">You</div>
            {block.queued ? <div className="oc-queuedBadge">QUEUED</div> : <div className="oc-entryTime">{formatTime(block.message.info.time?.created)}</div>}
          </div>
          {userText ? <MarkdownBlock content={userText.text || ""} /> : <div className="oc-partEmpty">No visible prompt text.</div>}
          {userFiles.length > 0 ? (
            <div className="oc-attachmentRow">
              {userFiles.map((part) => (
                <span key={part.id} className="oc-pill oc-pill-file">
                  <span className="oc-pillFileType">{fileTypeLabel(part)}</span>
                  <span className="oc-pillFilePath">{attachmentFilePath(part)}</span>
                </span>
              ))}
            </div>
          ) : null}
        </section>
      </>
    )
  }

  if (block.kind === "assistant-meta") {
    return <AssistantTurnMeta AgentBadge={AgentBadge} messages={block.messages} />
  }

  const part = block.part
  return <PartView part={part} active={part.type === "tool" && part.id === activeToolID} diffMode={diffMode} />
}

function AssistantTurnMeta({ AgentBadge, messages }: { AgentBadge: ({ name }: { name: string }) => React.JSX.Element; messages: SessionMessage[] }) {
  const first = messages[0]?.info
  const agent = first?.agent?.trim()
  const created = formatTime(first?.time?.created)
  const summary = assistantSummary(messages)
  const items: React.ReactNode[] = []

  if (agent) {
    items.push(<AgentBadge key="agent" name={agent} />)
  }
  if (created) {
    items.push(<span key="created">{created}</span>)
  }
  if (summary) {
    items.push(<span key="summary">{summary}</span>)
  }
  if (items.length === 0) {
    return null
  }

  return (
    <section className="oc-turnMeta">
      <div className="oc-turnMetaContent">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 ? <span className="oc-turnMetaSep">·</span> : null}
            {item}
          </React.Fragment>
        ))}
      </div>
    </section>
  )
}

function buildTimelineBlocks(messages: SessionMessage[], options: { showThinking: boolean; showInternals: boolean }) {
  const blocks: TimelineBlock[] = []
  let assistants: SessionMessage[] = []
  const pendingAssistantIndex = lastPendingAssistantIndex(messages)

  const flush = () => {
    if (assistantTurnMeta(messagesFromAssistants(assistants))) {
      blocks.push({
        kind: "assistant-meta",
        key: `meta:${assistants[0]?.info.id || assistants.length}`,
        messages: assistants,
      })
    }
    assistants = []
  }

  for (const [index, message] of messages.entries()) {
    if (message.info.role === "user") {
      flush()
      blocks.push({
        kind: "user-message",
        key: `user:${message.info.id}`,
        message,
        queued: pendingAssistantIndex >= 0 && index > pendingAssistantIndex,
      })
      continue
    }

    const parts = message.parts.filter((part) => visibleAssistantPart(part, options))
    for (const part of parts) {
      blocks.push({ kind: "assistant-part", key: `part:${part.id}`, part })
    }
    assistants.push(message)
  }

  flush()
  return blocks
}

function messagesFromAssistants(messages: SessionMessage[]) {
  return messages
}

function lastPendingAssistantIndex(messages: SessionMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.info.role === "assistant" && !message.info.time.completed) {
      return index
    }
  }
  return -1
}

function primaryUserText(message: SessionMessage) {
  return message.parts.find((part): part is TextPart => part.type === "text" && !part.synthetic && !part.ignored)
}

function userHasCompaction(message: SessionMessage) {
  return message.parts.some((part) => part.type === "compaction")
}

function userAttachments(message: SessionMessage) {
  return message.parts.filter((part): part is FilePart => part.type === "file")
}

function attachmentFilePath(part: FilePart) {
  if (part.filename?.trim()) {
    return part.filename.trim()
  }

  const raw = part.url.trim()
  if (!raw) {
    return part.url
  }

  try {
    const parsed = new URL(raw)
    if (parsed.protocol === "file:") {
      return decodeURIComponent(parsed.pathname)
    }
    return decodeURIComponent(`${parsed.hostname}${parsed.pathname}` || raw)
  } catch {
    return raw
  }
}

function fileTypeLabel(part: FilePart) {
  const mime = part.mime.toLowerCase()
  const path = attachmentFilePath(part).toLowerCase()

  if (mime === "application/pdf" || path.endsWith(".pdf")) return "PDF"
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic|heif)$/.test(path)) return "IMG"
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/.test(path)) return "AUDIO"
  if (mime.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(path)) return "VIDEO"
  if (mime === "application/json" || mime.endsWith("+json") || path.endsWith(".json") || path.endsWith(".jsonc")) return "JSON"
  if (mime === "application/yaml" || mime === "text/yaml" || mime === "text/x-yaml" || path.endsWith(".yaml") || path.endsWith(".yml")) return "YAML"
  if (mime === "application/toml" || path.endsWith(".toml")) return "TOML"
  if (mime === "text/markdown" || path.endsWith(".md") || path.endsWith(".mdx")) return "MD"
  if (mime.startsWith("text/") && !mime.includes("markdown") && !mime.includes("yaml") && !mime.includes("javascript") && !mime.includes("typescript") && !mime.includes("jsx") && !mime.includes("tsx") && !mime.includes("html") && !mime.includes("css") && !mime.includes("xml") && !mime.includes("json")) return "TXT"
  if (mime.includes("javascript") || mime.includes("typescript") || mime.includes("jsx") || mime.includes("tsx") || mime.includes("html") || mime.includes("css") || mime.includes("xml") || mime.includes("python") || mime.includes("java") || mime.includes("rust") || mime.includes("go") || mime.includes("php") || mime.includes("ruby") || mime.includes("shellscript") || mime.includes("x-sh") || /\.(c|cc|cpp|cs|go|java|js|jsx|mjs|cjs|ts|tsx|py|rb|rs|php|swift|kt|kts|scala|sh|bash|zsh|fish|html|css|scss|sass|less|xml|sql)$/.test(path)) return "CODE"
  if (path.endsWith(".txt") || path.endsWith(".log")) return "TXT"
  return "TXT"
}

function latestActiveToolId(parts: MessagePart[]) {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i]
    if (part?.type === "tool" && part.state?.status !== "completed") {
      return part.id
    }
  }
  return ""
}

function assistantSummary(messages: SessionMessage[]) {
  if (messages.length === 0) {
    return ""
  }

  const first = messages[0]?.info
  const last = messages[messages.length - 1]?.info
  const parts: string[] = []
  const finish = lastStepFinish(messages)

  const model = assistantModel(last)
  if (model) parts.push(model)

  const duration = assistantDuration(first, last)
  if (duration) parts.push(duration)

  const tokenSummary = assistantTokens(last)
  if (tokenSummary) parts.push(tokenSummary)

  if (typeof last?.cost === "number" && Number.isFinite(last.cost)) {
    parts.push(`$${last.cost.toFixed(4)}`)
  }

  if (finish) {
    const reason = textValue(finish.reason)
    if (reason) parts.push(reason)
  }

  return parts.join(" · ")
}

function assistantTurnMeta(messages: SessionMessage[]) {
  if (messages.length === 0) {
    return ""
  }

  const parts: string[] = []
  const first = messages[0]?.info
  const agent = first?.agent?.trim()
  const created = formatTime(first?.time?.created)
  const summary = assistantSummary(messages)

  if (agent) parts.push(agent)
  if (created) parts.push(created)
  if (summary) parts.push(summary)

  return parts.join(" · ")
}

function lastStepFinish(messages: SessionMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const parts = messages[i]?.parts || []
    for (let j = parts.length - 1; j >= 0; j -= 1) {
      const part = parts[j]
      if (part?.type === "step-finish") {
        return part as Record<string, unknown>
      }
    }
  }
}

type PartBucket = "primary" | "secondary" | "divider" | "hidden"

function partBucket(part: MessagePart, options: { showThinking: boolean; showInternals: boolean }): PartBucket {
  if (part.type === "text") {
    return part.text?.trim() && !part.synthetic && !part.ignored ? "primary" : "hidden"
  }
  if (part.type === "reasoning") {
    return options.showThinking && cleanReasoning(part.text || "").trim() ? "secondary" : "hidden"
  }
  if (part.type === "tool" || part.type === "file") {
    return "secondary"
  }
  if (part.type === "step-start") {
    return "hidden"
  }
  if (part.type === "retry" || part.type === "agent" || part.type === "subtask") {
    return "divider"
  }
  if (part.type === "step-finish" || part.type === "snapshot" || part.type === "patch") {
    return options.showInternals ? "secondary" : "hidden"
  }
  return options.showInternals ? "secondary" : "hidden"
}

function visibleAssistantPart(part: MessagePart, options: { showThinking: boolean; showInternals: boolean }) {
  return partBucket(part, options) !== "hidden"
}

function assistantModel(info?: MessageInfo) {
  const modelID = info?.model?.modelID?.trim()
  const providerID = info?.model?.providerID?.trim()
  if (modelID && providerID) {
    return `${providerID}/${modelID}`
  }
  return modelID || providerID || ""
}

function assistantDuration(first?: MessageInfo, last?: MessageInfo) {
  const start = first?.time?.created
  const end = last?.time?.completed
  if (typeof start !== "number" || typeof end !== "number" || end < start) {
    return ""
  }
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  return formatDuration(seconds)
}

function assistantTokens(info?: MessageInfo) {
  const output = info?.tokens?.output
  const reasoning = info?.tokens?.reasoning
  const tokens: string[] = []
  if (typeof output === "number" && output > 0) tokens.push(`${output} out`)
  if (typeof reasoning === "number" && reasoning > 0) tokens.push(`${reasoning} reasoning`)
  return tokens.join(" · ")
}

function formatTime(value?: number) {
  if (typeof value !== "number") {
    return ""
  }
  try {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}

function cleanReasoning(value: string) {
  return value.replace(/\[REDACTED\]/g, "").trim()
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) {
    return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`
}
