import React from "react"
import { parsePatch } from "diff"
import type { SkillCatalogEntry } from "../../../bridge/types"
import type { PanelTheme } from "../../../core/settings"
import type { CommandInfo, FilePart, MessageInfo, MessagePart, SessionMessage, TextPart } from "../../../core/sdk"
import { findSkillInvocationMatch } from "../../shared/skill-invocation"
import { recordValue, stringValue } from "../lib/part-utils"
import { toolFiles } from "../lib/tool-meta"
import { commandPromptLabel, findCommandPromptInvocation, previewCommandPromptText, type CommandPromptCatalog } from "./command-prompt"
import { CommandPill } from "./command-pill"
import { CollapsiblePrompt } from "./collapsible-prompt"
import { TranscriptVisibilityContext } from "./contexts"
import { SkillPill } from "./skill-pill"

type AssistantActivityToolPart = Extract<MessagePart, { type: "tool" }>

export type TimelineBlock =
  | { kind: "user-message"; key: string; message: SessionMessage; queued: boolean }
  | { kind: "assistant-activity"; key: string; parts: AssistantActivityToolPart[]; summary: string; initiallyExpanded: boolean }
  | { kind: "assistant-part"; key: string; part: MessagePart }
  | { kind: "assistant-error"; key: string; message: SessionMessage; text: string }
  | { kind: "assistant-meta"; key: string; messages: SessionMessage[] }
  | { kind: "revert"; key: string; count: number; files: Array<{ filename: string; additions: number; deletions: number }> }

type TimelineDerivationOptions = {
  panelTheme?: PanelTheme
  showThinking: boolean
  showInternals: boolean
  revertID?: string
  revertDiff?: string
}

export type TimelineDerivationCache = {
  assistantActivityBlocks: Map<string, Extract<TimelineBlock, { kind: "assistant-activity" }>>
  assistantErrorBlocks: Map<string, Extract<TimelineBlock, { kind: "assistant-error" }>>
  assistantMetaBlocks: Map<string, Extract<TimelineBlock, { kind: "assistant-meta" }>>
  assistantPartBlocks: Map<string, Extract<TimelineBlock, { kind: "assistant-part" }>>
  revertBlocks: Map<string, Extract<TimelineBlock, { kind: "revert" }>>
  userBlocks: Map<string, Extract<TimelineBlock, { kind: "user-message" }>>
}

export function createTimelineDerivationCache(): TimelineDerivationCache {
  return {
    assistantActivityBlocks: new Map(),
    assistantErrorBlocks: new Map(),
    assistantMetaBlocks: new Map(),
    assistantPartBlocks: new Map(),
    revertBlocks: new Map(),
    userBlocks: new Map(),
  }
}

type TimelineProps = {
  bootstrapStatus: "idle" | "loading" | "ready" | "error"
  bootstrapMessage?: string
  commandPromptInvocations?: CommandPromptCatalog
  commands?: CommandInfo[]
  compactSkillInvocations: boolean
  diffMode: "unified" | "split"
  historyStatus?: "hidden" | "ready" | "loading"
  messages: SessionMessage[]
  onCopyAssistantText?: (value: string) => void
  onCopyUserMessage: (message: SessionMessage) => void
  onForkUserMessage: (message: SessionMessage) => void
  onOpenFileAttachment: (filePath: string) => void
  onPreviewImageAttachment: (image: { src: string; name: string }) => void
  onRedoSession: () => void
  onUndoUserMessage: (message: SessionMessage) => void
  revertDiff?: string
  revertID?: string
  showInternals: boolean
  showThinking: boolean
  panelTheme?: PanelTheme
  skillCatalog: SkillCatalogEntry[]
  AgentBadge: ({ name }: { name: string }) => React.JSX.Element
  CompactionDivider: () => React.JSX.Element
  EmptyState: ({ title, text }: { title: string; text: string }) => React.JSX.Element
  MarkdownBlock: ({ content, className }: { content: string; className?: string }) => React.JSX.Element
  PartView: ({ part, active, diffMode }: { part: MessagePart; active?: boolean; diffMode?: "unified" | "split" }) => React.JSX.Element
}

export const Timeline = React.memo(function Timeline({
  bootstrapStatus,
  bootstrapMessage,
  commandPromptInvocations = {},
  commands = [],
  compactSkillInvocations,
  diffMode,
  historyStatus = "hidden",
  messages,
  onCopyAssistantText = noopCopyAction,
  onCopyUserMessage,
  onForkUserMessage,
  onOpenFileAttachment,
  onPreviewImageAttachment,
  onRedoSession,
  onUndoUserMessage,
  revertDiff,
  revertID,
  showInternals,
  showThinking,
  panelTheme = "default",
  skillCatalog,
  AgentBadge,
  CompactionDivider,
  EmptyState,
  MarkdownBlock,
  PartView,
}: TimelineProps) {
  const cacheRef = React.useRef<TimelineDerivationCache>(createTimelineDerivationCache())

  const blocks = React.useMemo(() => reconcileTimelineBlocks(cacheRef.current, messages, {
    panelTheme,
    showThinking,
    showInternals,
    revertID,
    revertDiff,
  }), [messages, panelTheme, revertDiff, revertID, showInternals, showThinking])
  const activeToolID = React.useMemo(() => latestActiveToolId(blocks.flatMap((block) => {
    if (block.kind === "assistant-part") {
      return [block.part]
    }
    if (block.kind === "assistant-activity") {
      return block.parts
    }
    return []
  })), [blocks])

  if (bootstrapStatus === "error") {
    return <EmptyState title="Session unavailable" text={bootstrapMessage || "The workspace runtime is not ready."} />
  }

  if (bootstrapStatus !== "ready" && messages.length === 0) {
    return <EmptyState title="Connecting to workspace" text={bootstrapMessage || "Waiting for workspace runtime."} />
  }

  if (messages.length === 0) {
    return <EmptyState title="Start this session" text="Send a message below. Pending permission and question requests will appear in the lower dock." />
  }

  return (
    <TranscriptVisibilityContext.Provider value={{ showThinking, showInternals, compactSkillInvocations, panelTheme, skillCatalog }}>
      <div className="oc-log">
        {historyStatus !== "hidden" ? (
          <div className={`oc-transcriptHistory${historyStatus === "loading" ? " is-loading" : ""}`} aria-live="polite">
            <div className="oc-transcriptHistoryBadge">
              {historyStatus === "loading" ? "Loading earlier messages..." : "Scroll up to load earlier messages"}
            </div>
          </div>
        ) : null}
        {blocks.map((block, index) => {
          const content = (
            <MemoTimelineBlockView
              key={block.key}
              AgentBadge={AgentBadge}
              CompactionDivider={CompactionDivider}
              MarkdownBlock={MarkdownBlock}
              PartView={PartView}
              activeToolID={activeToolID}
              active={block.kind === "assistant-part" && block.part.type === "tool" && block.part.id === activeToolID}
              block={block}
              commandPromptInvocations={commandPromptInvocations}
              commands={commands}
              compactSkillInvocations={compactSkillInvocations}
              diffMode={diffMode}
              onCopyAssistantText={onCopyAssistantText}
              onCopyUserMessage={onCopyUserMessage}
              onForkUserMessage={onForkUserMessage}
              onOpenFileAttachment={onOpenFileAttachment}
              onPreviewImageAttachment={onPreviewImageAttachment}
              onRedoSession={onRedoSession}
              onUndoUserMessage={onUndoUserMessage}
              panelTheme={panelTheme}
              skillCatalog={skillCatalog}
            />
          )
          const chainClassName = panelTheme === "claude" ? assistantChainClassName(blocks, index) : ""
          return chainClassName
            ? <div key={block.key} className={chainClassName}>{content}</div>
            : content
        })}
      </div>
    </TranscriptVisibilityContext.Provider>
  )
})

type TimelineBlockViewProps = {
  AgentBadge: ({ name }: { name: string }) => React.JSX.Element
  CompactionDivider: () => React.JSX.Element
  MarkdownBlock: ({ content, className }: { content: string; className?: string }) => React.JSX.Element
  PartView: ({ part, active, diffMode }: { part: MessagePart; active?: boolean; diffMode?: "unified" | "split" }) => React.JSX.Element
  activeToolID: string
  active: boolean
  block: TimelineBlock
  commandPromptInvocations: CommandPromptCatalog
  commands: CommandInfo[]
  compactSkillInvocations: boolean
  diffMode: "unified" | "split"
  onCopyAssistantText: (value: string) => void
  onCopyUserMessage: (message: SessionMessage) => void
  onForkUserMessage: (message: SessionMessage) => void
  onOpenFileAttachment: (filePath: string) => void
  onPreviewImageAttachment: (image: { src: string; name: string }) => void
  onRedoSession: () => void
  onUndoUserMessage: (message: SessionMessage) => void
  panelTheme: PanelTheme
  skillCatalog: SkillCatalogEntry[]
}

function TimelineBlockView({
  AgentBadge,
  CompactionDivider,
  MarkdownBlock: _MarkdownBlock,
  PartView,
  activeToolID,
  active,
  block,
  commandPromptInvocations,
  commands,
  compactSkillInvocations,
  diffMode,
  onCopyAssistantText,
  onCopyUserMessage,
  onForkUserMessage,
  onOpenFileAttachment,
  onPreviewImageAttachment,
  onRedoSession,
  onUndoUserMessage,
  panelTheme,
  skillCatalog,
}: TimelineBlockViewProps) {
  const [activityExpanded, setActivityExpanded] = React.useState(block.kind === "assistant-activity" ? block.initiallyExpanded : false)
  const [commandPromptExpanded, setCommandPromptExpanded] = React.useState(false)

  React.useEffect(() => {
    setActivityExpanded(block.kind === "assistant-activity" ? block.initiallyExpanded : false)
    setCommandPromptExpanded(false)
  }, [block.kind === "assistant-activity" ? block.initiallyExpanded : false, block.kind === "user-message" ? block.message.info.id : block.key])

  if (block.kind === "user-message") {
    const userTurnWrapClassName = userTurnWrapClassNames(panelTheme)
    const userTurnClassName = userTurnClassNames(panelTheme)
    const messageActionsClassName = messageActionsClassNames(panelTheme)
    const userText = visibleUserText(block.message)
    const commandPrompt = userText ? findCommandPromptInvocation(userText.text || "", commandPromptInvocations, commands) : undefined
    const skillMatch = compactSkillInvocations && userText
      ? findSkillInvocationMatch(userText.text || "", skillCatalog)
      : undefined
    const userFiles = userAttachments(block.message)
    const hasCompaction = userHasCompaction(block.message)
    const hasSyntheticText = userHasSyntheticText(block.message)
    const showEmptyPrompt = !userText && !hasSyntheticText
    const skillLocation = skillMatch ? findSkillLocation(skillMatch.name, skillCatalog) : undefined
    if (hasCompaction && !userText && userFiles.length === 0) {
      return <CompactionDivider />
    }
    return (
      <>
        {hasCompaction ? <CompactionDivider /> : null}
        <div className={userTurnWrapClassName}>
          <section className={userTurnClassName}>
            {block.queued ? (
              <div className="oc-userStatusRow">
                <div className="oc-queuedBadge">QUEUED</div>
              </div>
            ) : null}
            {commandPrompt || skillMatch || userFiles.length > 0 ? (
              <div className="oc-attachmentRow">
                {commandPrompt ? (
                  <CommandPill
                    label={commandPromptLabel(commandPrompt)}
                    preview={previewCommandPromptText(userText?.text || "")}
                    expanded={commandPromptExpanded}
                    onClick={() => setCommandPromptExpanded((current) => !current)}
                  />
                ) : null}
                {skillMatch ? <SkillPill name={skillMatch.name} onClick={skillLocation ? () => onOpenFileAttachment(skillLocation) : undefined} /> : null}
                {userFiles.map((part) => (
                  <AttachmentPill
                    key={part.id}
                    part={part}
                    onOpenFileAttachment={onOpenFileAttachment}
                    onPreviewImageAttachment={onPreviewImageAttachment}
                  />
                ))}
              </div>
            ) : null}
            {commandPrompt
              ? (commandPromptExpanded ? <PlainTextBlock content={userText?.text || ""} /> : null)
              : skillMatch?.remainder
              ? <CollapsiblePrompt content={skillMatch.remainder} />
              : skillMatch
                ? null
              : userText
                ? <CollapsiblePrompt content={userText.text || ""} />
              : (showEmptyPrompt ? <div className="oc-partEmpty">No visible prompt text.</div> : null)}
          </section>
          <div className={messageActionsClassName} aria-label="Message actions">
            <button type="button" className="oc-messageActionBtn" aria-label="Copy" data-tooltip="Copy" onClick={() => onCopyUserMessage(block.message)}>
              <CopyMessageIcon />
            </button>
            <button type="button" className="oc-messageActionBtn" aria-label="Fork" data-tooltip="Fork" onClick={() => onForkUserMessage(block.message)} disabled={block.queued}>
              <ForkMessageIcon />
            </button>
            <button type="button" className="oc-messageActionBtn" aria-label="Undo" data-tooltip="Undo" onClick={() => onUndoUserMessage(block.message)} disabled={block.queued}>
              <UndoMessageIcon />
            </button>
          </div>
        </div>
      </>
    )
  }

  if (block.kind === "assistant-meta") {
    return <AssistantTurnMeta AgentBadge={AgentBadge} messages={block.messages} />
  }

  if (block.kind === "assistant-activity") {
    return (
      <section className="oc-codexActivityGroup">
        <button
          type="button"
          className="oc-codexActivitySummary"
          aria-expanded={activityExpanded}
          aria-label={activityExpanded ? "Collapse activity details" : "Expand activity details"}
          onClick={() => setActivityExpanded((current) => !current)}
        >
          <span className="oc-codexActivityText">{block.summary}</span>
          <span className="oc-codexActivityToggle" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </span>
        </button>
        {activityExpanded ? (
          <div className="oc-codexActivityDetails">
            {block.parts.map((part) => (
              <PartView key={part.id} part={part} active={part.id === activeToolID} diffMode={diffMode} />
            ))}
          </div>
        ) : null}
      </section>
    )
  }

  if (block.kind === "revert") {
    return (
      <section className="oc-revertNotice">
        <div className="oc-revertActions" aria-label="Revert actions">
          <button type="button" className="oc-messageActionBtn" aria-label="Redo" data-tooltip="Redo" onClick={onRedoSession}>
            <RedoMessageIcon />
          </button>
        </div>
        <div className="oc-revertNoticeTitle">{block.count} message reverted</div>
        <div className="oc-revertNoticeText">Use `/redo` to restore this part of the session.</div>
        {block.files.length > 0 ? (
          <div className="oc-revertFileList">
            {block.files.map((file, index) => (
              <div key={`${file.filename}:${index}`} className="oc-revertFileRow">
                <span>{file.filename}</span>
                {file.additions > 0 ? <span className="oc-revertFileAdd">+{file.additions}</span> : null}
                {file.deletions > 0 ? <span className="oc-revertFileDel">-{file.deletions}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    )
  }

  if (block.kind === "assistant-error") {
    return (
      <section className="oc-assistantError">
        <pre className="oc-errorBlock">{block.text}</pre>
      </section>
    )
  }

  const part = block.part
  if (part.type === "text") {
    const copyValue = assistantCopyText(part, { compactSkillInvocations, skillCatalog })
    if (!copyValue) {
      return <PartView part={part} active={active} diffMode={diffMode} />
    }

    return (
      <div className={assistantReplyWrapClassNames(panelTheme)}>
        <PartView part={part} active={active} diffMode={diffMode} />
        <div className={assistantMessageActionsClassNames(panelTheme)} aria-label="Reply actions">
          <button type="button" className="oc-messageActionBtn" aria-label="Copy" data-tooltip="Copy" onClick={() => onCopyAssistantText(copyValue)}>
            <CopyMessageIcon />
          </button>
        </div>
      </div>
    )
  }

  return <PartView part={part} active={active} diffMode={diffMode} />
}

const MemoTimelineBlockView = React.memo(TimelineBlockView, areTimelineBlockPropsEqual)

function PlainTextBlock({ content }: { content: string }) {
  return <div className="oc-partText">{content}</div>
}

function userTurnWrapClassNames(panelTheme: PanelTheme) {
  const classes = ["oc-turnUserWrap"]

  if (panelTheme === "claude") {
    classes.push("oc-turnUserWrap-theme-claude")
  }

  if (panelTheme === "codex") {
    classes.push("oc-turnUserWrap-theme-codex", "oc-turnUserWrap-compactEnd")
  }

  return classes.join(" ")
}

function assistantReplyWrapClassNames(panelTheme: PanelTheme) {
  const classes = ["oc-assistantReplyWrap"]

  if (panelTheme === "claude") {
    classes.push("oc-assistantReplyWrap-theme-claude")
  }

  if (panelTheme === "codex") {
    classes.push("oc-assistantReplyWrap-theme-codex")
  }

  return classes.join(" ")
}

function userTurnClassNames(panelTheme: PanelTheme) {
  const classes = ["oc-turnUser"]

  if (panelTheme === "claude") {
    classes.push("oc-turnUser-theme-claude")
  }

  if (panelTheme === "codex") {
    classes.push("oc-turnUser-theme-codex", "oc-turnUser-compactEnd")
  }

  return classes.join(" ")
}

function messageActionsClassNames(panelTheme: PanelTheme) {
  const classes = ["oc-messageActions"]

  if (panelTheme === "claude") {
    classes.push("oc-messageActions-topRightExternal")
  }

  if (panelTheme === "codex") {
    classes.push("oc-messageActions-belowHover")
  }

  return classes.join(" ")
}

function assistantMessageActionsClassNames(panelTheme: PanelTheme) {
  const classes = ["oc-messageActions"]

  if (panelTheme === "claude") {
    classes.push("oc-messageActions-topRightExternal")
  }

  if (panelTheme === "codex") {
    classes.push("oc-messageActions-inlineTopRight")
  }

  return classes.join(" ")
}

function AttachmentPill({
  part,
  onOpenFileAttachment,
  onPreviewImageAttachment,
}: {
  part: FilePart
  onOpenFileAttachment: (filePath: string) => void
  onPreviewImageAttachment: (image: { src: string; name: string }) => void
}) {
  const name = attachmentFilePath(part)
  const previewSrc = attachmentPreviewSource(part)
  const openPath = attachmentOpenPath(part)

  if (previewSrc) {
    return (
      <button
        type="button"
        className="oc-pill oc-pill-file oc-pillButton"
        aria-label={`Preview ${name}`}
        onClick={() => onPreviewImageAttachment({ src: previewSrc, name })}
      >
        <span className="oc-pillFileType">{fileTypeLabel(part)}</span>
        <span className="oc-pillFilePath">{name}</span>
      </button>
    )
  }

  if (openPath) {
    return (
      <button
        type="button"
        className="oc-pill oc-pill-file oc-pillButton"
        aria-label={`Open attachment ${name}`}
        onClick={() => onOpenFileAttachment(openPath)}
      >
        <span className="oc-pillFileType">{fileTypeLabel(part)}</span>
        <span className="oc-pillFilePath">{name}</span>
      </button>
    )
  }

  return (
    <span className="oc-pill oc-pill-file">
      <span className="oc-pillFileType">{fileTypeLabel(part)}</span>
      <span className="oc-pillFilePath">{name}</span>
    </span>
  )
}

function areTimelineBlockPropsEqual(prev: TimelineBlockViewProps, next: TimelineBlockViewProps) {
  if (prev.AgentBadge !== next.AgentBadge
    || prev.CompactionDivider !== next.CompactionDivider
    || prev.MarkdownBlock !== next.MarkdownBlock
    || prev.PartView !== next.PartView
    || prev.activeToolID !== next.activeToolID
    || prev.active !== next.active
    || prev.compactSkillInvocations !== next.compactSkillInvocations
    || prev.diffMode !== next.diffMode
    || prev.onCopyAssistantText !== next.onCopyAssistantText
    || prev.onCopyUserMessage !== next.onCopyUserMessage
    || prev.onForkUserMessage !== next.onForkUserMessage
    || prev.onOpenFileAttachment !== next.onOpenFileAttachment
    || prev.onPreviewImageAttachment !== next.onPreviewImageAttachment
    || prev.onRedoSession !== next.onRedoSession
    || prev.onUndoUserMessage !== next.onUndoUserMessage
    || prev.panelTheme !== next.panelTheme
    || prev.commandPromptInvocations !== next.commandPromptInvocations
    || prev.commands !== next.commands
    || prev.skillCatalog !== next.skillCatalog) {
    return false
  }

  return sameTimelineBlock(prev.block, next.block)
}

function sameTimelineBlock(prev: TimelineBlock, next: TimelineBlock) {
  if (prev.kind !== next.kind || prev.key !== next.key) {
    return false
  }

  if (prev.kind === "user-message" && next.kind === "user-message") {
    return prev.message === next.message && prev.queued === next.queued
  }

  if (prev.kind === "assistant-part" && next.kind === "assistant-part") {
    return prev.part === next.part
  }

  if (prev.kind === "assistant-activity" && next.kind === "assistant-activity") {
    return prev.summary === next.summary && prev.initiallyExpanded === next.initiallyExpanded && sameToolPartList(prev.parts, next.parts)
  }

  if (prev.kind === "assistant-error" && next.kind === "assistant-error") {
    return prev.message === next.message && prev.text === next.text
  }

  if (prev.kind === "assistant-meta" && next.kind === "assistant-meta") {
    return sameMessageList(prev.messages, next.messages)
  }

  if (prev.kind === "revert" && next.kind === "revert") {
    return prev.count === next.count && sameRevertFiles(prev.files, next.files)
  }

  return false
}

function sameMessageList(prev: SessionMessage[], next: SessionMessage[]) {
  if (prev.length !== next.length) {
    return false
  }

  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) {
      return false
    }
  }

  return true
}

function sameToolPartList(prev: AssistantActivityToolPart[], next: AssistantActivityToolPart[]) {
  if (prev.length !== next.length) {
    return false
  }

  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) {
      return false
    }
  }

  return true
}

function sameRevertFiles(
  prev: Array<{ filename: string; additions: number; deletions: number }>,
  next: Array<{ filename: string; additions: number; deletions: number }>,
) {
  if (prev.length !== next.length) {
    return false
  }

  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index]
    const right = next[index]
    if (!left || !right || left.filename !== right.filename || left.additions !== right.additions || left.deletions !== right.deletions) {
      return false
    }
  }

  return true
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

function assistantChainClassName(blocks: TimelineBlock[], index: number) {
  const block = blocks[index]
  if (!block || block.kind === "user-message") {
    return ""
  }

  const classes = ["oc-chainItem", `oc-chainItem-${block.kind}`]
  if (block.kind === "assistant-part") {
    classes.push(`oc-chainItem-part-${block.part.type}`)
    if (block.part.type === "tool") {
      classes.push(`oc-chainItem-tool-${block.part.tool}`)
    }
  }
  if (!isAssistantChainable(blocks[index - 1])) {
    classes.push("oc-chainItem-first")
  }
  if (!isAssistantChainable(blocks[index + 1])) {
    classes.push("oc-chainItem-last")
  }

  return classes.join(" ")
}

function isAssistantChainable(block?: TimelineBlock) {
  return !!block && block.kind !== "user-message"
}

export function reconcileTimelineBlocks(cache: TimelineDerivationCache, messages: SessionMessage[], options: TimelineDerivationOptions) {
  const nextAssistantActivityBlocks = new Map<string, Extract<TimelineBlock, { kind: "assistant-activity" }>>()
  const nextAssistantErrorBlocks = new Map<string, Extract<TimelineBlock, { kind: "assistant-error" }>>()
  const nextAssistantMetaBlocks = new Map<string, Extract<TimelineBlock, { kind: "assistant-meta" }>>()
  const nextAssistantPartBlocks = new Map<string, Extract<TimelineBlock, { kind: "assistant-part" }>>()
  const nextRevertBlocks = new Map<string, Extract<TimelineBlock, { kind: "revert" }>>()
  const nextUserBlocks = new Map<string, Extract<TimelineBlock, { kind: "user-message" }>>()
  const blocks: TimelineBlock[] = []
  let assistants: SessionMessage[] = []
  let pendingActivity: AssistantActivityToolPart[] = []
  const pendingAssistantIndex = lastPendingAssistantIndex(messages)

  const flushActivity = (initiallyExpanded = false) => {
    if (pendingActivity.length === 0) {
      return
    }
    const activity = assistantActivityBlock(cache.assistantActivityBlocks, nextAssistantActivityBlocks, pendingActivity, initiallyExpanded)
    if (activity) {
      blocks.push(activity)
    } else {
      for (const part of pendingActivity) {
        blocks.push(assistantPartBlock(cache.assistantPartBlocks, nextAssistantPartBlocks, part))
      }
    }
    pendingActivity = []
  }

  const flush = () => {
    flushActivity(true)
    const meta = assistantMetaBlock(cache.assistantMetaBlocks, nextAssistantMetaBlocks, assistants)
    if (meta) {
      blocks.push(meta)
    }
    assistants = []
  }

  for (const [index, message] of messages.entries()) {
    if (options.revertID && message.info.id === options.revertID) {
      flush()
      blocks.push(revertBlock(cache.revertBlocks, nextRevertBlocks, message.info.id, revertedUserCount(messages, options.revertID), revertFiles(options.revertDiff)))
      break
    }

    if (message.info.role === "user") {
      flush()
      blocks.push(userBlock(cache.userBlocks, nextUserBlocks, message, pendingAssistantIndex >= 0 && index > pendingAssistantIndex))
      continue
    }

    const parts = message.parts.filter((part) => visibleAssistantPart(part, options))
    if (options.panelTheme === "codex") {
      for (const part of parts) {
        if (part.type === "tool" && isCodexActivityTool(part)) {
          pendingActivity.push(part)
          continue
        }

        flushActivity(false)
        blocks.push(assistantPartBlock(cache.assistantPartBlocks, nextAssistantPartBlocks, part))
      }
    } else {
      for (const part of parts) {
        blocks.push(assistantPartBlock(cache.assistantPartBlocks, nextAssistantPartBlocks, part))
      }
    }
    const errorText = assistantErrorText(message.info)
    if (errorText) {
      flushActivity()
      blocks.push(assistantErrorBlock(cache.assistantErrorBlocks, nextAssistantErrorBlocks, message, errorText))
    }
    assistants.push(message)
  }

  flush()
  cache.assistantActivityBlocks = nextAssistantActivityBlocks
  cache.assistantErrorBlocks = nextAssistantErrorBlocks
  cache.assistantMetaBlocks = nextAssistantMetaBlocks
  cache.assistantPartBlocks = nextAssistantPartBlocks
  cache.revertBlocks = nextRevertBlocks
  cache.userBlocks = nextUserBlocks
  return blocks
}

function userBlock(
  cache: Map<string, Extract<TimelineBlock, { kind: "user-message" }>>,
  nextCache: Map<string, Extract<TimelineBlock, { kind: "user-message" }>>,
  message: SessionMessage,
  queued: boolean,
) {
  const key = `user:${message.info.id}`
  const prev = cache.get(key)
  if (prev && prev.message === message && prev.queued === queued) {
    nextCache.set(key, prev)
    return prev
  }

  const next: Extract<TimelineBlock, { kind: "user-message" }> = {
    kind: "user-message",
    key,
    message,
    queued,
  }
  nextCache.set(key, next)
  return next
}

function assistantActivityBlock(
  cache: Map<string, Extract<TimelineBlock, { kind: "assistant-activity" }>>,
  nextCache: Map<string, Extract<TimelineBlock, { kind: "assistant-activity" }>>,
  parts: AssistantActivityToolPart[],
  initiallyExpanded: boolean,
) {
  const summary = codexActivitySummary(parts)
  if (!summary) {
    return undefined
  }

  const firstID = parts[0]?.id || "start"
  const lastID = parts[parts.length - 1]?.id || "end"
  const key = `activity:${firstID}:${lastID}:${parts.length}`
  const prev = cache.get(key)
  if (prev && prev.summary === summary && prev.initiallyExpanded === initiallyExpanded && sameToolPartList(prev.parts, parts)) {
    nextCache.set(key, prev)
    return prev
  }

  const next: Extract<TimelineBlock, { kind: "assistant-activity" }> = {
    kind: "assistant-activity",
    key,
    parts,
    summary,
    initiallyExpanded,
  }
  nextCache.set(key, next)
  return next
}

function assistantPartBlock(
  cache: Map<string, Extract<TimelineBlock, { kind: "assistant-part" }>>,
  nextCache: Map<string, Extract<TimelineBlock, { kind: "assistant-part" }>>,
  part: MessagePart,
) {
  const key = `part:${part.id}`
  const prev = cache.get(key)
  if (prev && prev.part === part) {
    nextCache.set(key, prev)
    return prev
  }

  const next: Extract<TimelineBlock, { kind: "assistant-part" }> = {
    kind: "assistant-part",
    key,
    part,
  }
  nextCache.set(key, next)
  return next
}

function assistantErrorBlock(
  cache: Map<string, Extract<TimelineBlock, { kind: "assistant-error" }>>,
  nextCache: Map<string, Extract<TimelineBlock, { kind: "assistant-error" }>>,
  message: SessionMessage,
  text: string,
) {
  const key = `error:${message.info.id}`
  const prev = cache.get(key)
  if (prev && prev.message === message && prev.text === text) {
    nextCache.set(key, prev)
    return prev
  }

  const next: Extract<TimelineBlock, { kind: "assistant-error" }> = {
    kind: "assistant-error",
    key,
    message,
    text,
  }
  nextCache.set(key, next)
  return next
}

function assistantMetaBlock(
  cache: Map<string, Extract<TimelineBlock, { kind: "assistant-meta" }>>,
  nextCache: Map<string, Extract<TimelineBlock, { kind: "assistant-meta" }>>,
  messages: SessionMessage[],
) {
  if (!assistantTurnMeta(messagesFromAssistants(messages))) {
    return undefined
  }

  const key = `meta:${messages[0]?.info.id || messages.length}`
  const prev = cache.get(key)
  if (prev && sameMessageList(prev.messages, messages)) {
    nextCache.set(key, prev)
    return prev
  }

  const next: Extract<TimelineBlock, { kind: "assistant-meta" }> = {
    kind: "assistant-meta",
    key,
    messages,
  }
  nextCache.set(key, next)
  return next
}

function revertBlock(
  cache: Map<string, Extract<TimelineBlock, { kind: "revert" }>>,
  nextCache: Map<string, Extract<TimelineBlock, { kind: "revert" }>>,
  messageID: string,
  count: number,
  files: Array<{ filename: string; additions: number; deletions: number }>,
) {
  const key = `revert:${messageID}`
  const prev = cache.get(key)
  if (prev && prev.count === count && sameRevertFiles(prev.files, files)) {
    nextCache.set(key, prev)
    return prev
  }

  const next: Extract<TimelineBlock, { kind: "revert" }> = {
    kind: "revert",
    key,
    count,
    files,
  }
  nextCache.set(key, next)
  return next
}

function revertedUserCount(messages: SessionMessage[], revertID: string) {
  return messages.filter((message) => message.info.role === "user" && message.info.id >= revertID).length
}

function revertFiles(diff?: string) {
  if (!diff?.trim()) {
    return []
  }

  try {
    return parsePatch(diff).map((patch) => ({
      filename: (patch.newFileName || patch.oldFileName || "unknown").replace(/^[ab]\//, ""),
      additions: patch.hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.startsWith("+")).length, 0),
      deletions: patch.hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.startsWith("-")).length, 0),
    }))
  } catch {
    return []
  }
}

function CopyMessageIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5" y="3" width="8" height="10" rx="1.5" className="oc-messageActionPath" />
      <path d="M3.5 10.5V5.5c0-.828.672-1.5 1.5-1.5h5" className="oc-messageActionPath" />
    </svg>
  )
}

function ForkMessageIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 3.5h5a2 2 0 0 1 2 2v1.5" className="oc-messageActionPath" />
      <path d="M5 12.5h5a2 2 0 0 0 2-2V9" className="oc-messageActionPath" />
      <circle cx="4" cy="3.5" r="1.25" className="oc-messageActionPath" />
      <circle cx="4" cy="12.5" r="1.25" className="oc-messageActionPath" />
      <path d="M10 8h3" className="oc-messageActionPath" />
      <path d="M11.5 6.5 13 8l-1.5 1.5" className="oc-messageActionPath" />
    </svg>
  )
}

function UndoMessageIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.5 4.5H11a2.5 2.5 0 0 1 0 5H4.5" className="oc-messageActionPath" />
      <path d="M6.5 2.75 3.75 5.5 6.5 8.25" className="oc-messageActionPath" />
    </svg>
  )
}

function RedoMessageIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.5 4.5H5a2.5 2.5 0 0 0 0 5h6.5" className="oc-messageActionPath" />
      <path d="m9.5 2.75 2.75 2.75-2.75 2.75" className="oc-messageActionPath" />
    </svg>
  )
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

const noopCopyAction = () => {}

function primaryUserText(message: SessionMessage) {
  return message.parts.find((part): part is TextPart => part.type === "text" && typeof part.text === "string" && !part.synthetic && !part.ignored)
}

export function assistantCopyText(
  part: MessagePart,
  options?: {
    compactSkillInvocations?: boolean
    skillCatalog?: SkillCatalogEntry[]
  },
) {
  if (part.type !== "text" || part.synthetic || part.ignored) {
    return ""
  }

  if (options?.compactSkillInvocations) {
    const match = findSkillInvocationMatch(part.text || "", options.skillCatalog || [])
    if (match) {
      return match.remainder || ""
    }
  }

  return part.text || ""
}

function visibleUserText(message: SessionMessage) {
  const textPart = primaryUserText(message)
  if (!textPart) {
    return undefined
  }

  const stripped = stripAttachmentSourceText(textPart.text || "", userAttachments(message))
  if (stripped === textPart.text) {
    return textPart
  }

  return {
    ...textPart,
    text: stripped,
  }
}

function userHasSyntheticText(message: SessionMessage) {
  return message.parts.some((part) => part.type === "text" && !!part.synthetic)
}

function userHasCompaction(message: SessionMessage) {
  return message.parts.some((part) => part.type === "compaction")
}

function userAttachments(message: SessionMessage) {
  return message.parts.filter((part): part is FilePart => part.type === "file")
}

function stripAttachmentSourceText(text: string, attachments: FilePart[]) {
  const ranges = attachments
    .flatMap((part) => {
      const source = part.source
      const start = source?.text?.start
      const end = source?.text?.end
      if (typeof start !== "number" || typeof end !== "number" || start < 0 || end <= start || start >= text.length) {
        return []
      }
      return [{
        start,
        end: Math.min(end, text.length),
      }]
    })
    .sort((a, b) => a.start - b.start)

  if (ranges.length === 0) {
    return text
  }

  let cursor = 0
  let result = ""

  for (const range of ranges) {
    if (range.end <= cursor) {
      continue
    }

    const nextStart = Math.max(range.start, cursor)
    if (nextStart > cursor) {
      result += text.slice(cursor, nextStart)
    }
    cursor = Math.max(cursor, range.end)
  }

  if (cursor < text.length) {
    result += text.slice(cursor)
  }

  return result
}

export function findSkillLocation(name: string, catalog: SkillCatalogEntry[]) {
  return catalog.find((skill) => skill.name === name)?.location
}

export function attachmentOpenPath(part: FilePart) {
  if (part.source?.type === "file" && part.source.path.trim()) {
    return part.source.path.trim()
  }

  const raw = part.url.trim()
  if (!raw || raw.startsWith("data:")) {
    return undefined
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !raw.startsWith("file://")) {
    return undefined
  }

  return raw
}

export function attachmentPreviewSource(part: FilePart) {
  const mime = part.mime.toLowerCase()
  const path = attachmentFilePath(part).toLowerCase()
  if (!mime.startsWith("image/") && !/\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/.test(path)) {
    return undefined
  }

  const raw = part.url.trim()
  if (raw.startsWith("data:image/") || raw.startsWith("https://")) {
    return raw
  }

  return undefined
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

function isCodexActivityTool(part: AssistantActivityToolPart) {
  return codexActivityKind(part) !== ""
}

function codexActivitySummary(parts: AssistantActivityToolPart[]) {
  const edited = new Set<string>()
  const explored = new Set<string>()
  let searches = 0
  let commands = 0

  for (const part of parts) {
    const kind = codexActivityKind(part)
    if (kind === "edited") {
      const files = toolFiles(part)
      if (files.length === 0) {
        edited.add(`tool:${part.id}`)
      } else {
        for (const file of files) {
          edited.add(file.path || `tool:${part.id}`)
        }
      }
      continue
    }

    if (kind === "explored") {
      explored.add(codexActivityPath(part) || `tool:${part.id}`)
      continue
    }

    if (kind === "search") {
      searches += 1
      continue
    }

    if (kind === "command") {
      commands += 1
    }
  }

  const segments: string[] = []
  if (edited.size > 0) {
    segments.push(`Edited ${edited.size} ${edited.size === 1 ? "file" : "files"}`)
  }
  if (explored.size > 0) {
    segments.push(`Explored ${explored.size} ${explored.size === 1 ? "file" : "files"}`)
  }
  if (searches > 0) {
    segments.push(`${searches} ${searches === 1 ? "search" : "searches"}`)
  }
  if (commands > 0) {
    segments.push(`Ran ${commands} ${commands === 1 ? "command" : "commands"}`)
  }

  return sentenceCaseActivitySummary(segments.join(", "))
}

function sentenceCaseActivitySummary(summary: string) {
  return summary ? summary.charAt(0).toUpperCase() + summary.slice(1) : summary
}

function codexActivityKind(part: AssistantActivityToolPart) {
  if (part.tool === "edit" || part.tool === "write" || part.tool === "apply_patch") {
    return "edited"
  }
  if (part.tool === "read" || part.tool === "list") {
    return "explored"
  }
  if (part.tool === "glob" || part.tool === "grep" || part.tool === "websearch" || part.tool === "codesearch") {
    return "search"
  }
  if (part.tool === "bash") {
    return "command"
  }
  return ""
}

function codexActivityPath(part: AssistantActivityToolPart) {
  const input = recordValue(part.state?.input)
  return stringValue(input.filePath) || stringValue(input.path)
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

function partBucket(part: MessagePart, options: { showThinking: boolean; showInternals: boolean; panelTheme?: PanelTheme }): PartBucket {
  if (part.type === "text") {
    const text = part.text?.trim() || ""
    return text && !part.synthetic && !part.ignored && !isAssistantPlaceholderText(text) ? "primary" : "hidden"
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

function visibleAssistantPart(part: MessagePart, options: { showThinking: boolean; showInternals: boolean; panelTheme?: PanelTheme }) {
  return partBucket(part, options) !== "hidden"
}

function isAssistantPlaceholderText(text: string) {
  return text === "..." || text === "…" || text === "。。。"
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

function assistantErrorText(info?: MessageInfo) {
  const message = info?.error?.data && "message" in info.error.data ? info.error.data.message : undefined
  return typeof message === "string" ? message.trim() : ""
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
