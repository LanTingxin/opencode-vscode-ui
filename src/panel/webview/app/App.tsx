import React from "react"
import hljs from "highlight.js"
import MarkdownIt from "markdown-it"
import type { SessionBootstrap } from "../../../bridge/types"
import type { LspStatus, McpStatus, MessageInfo, MessagePart, ProviderInfo, QuestionInfo, QuestionRequest, SessionInfo, SessionMessage, SessionStatus } from "../../../core/sdk"
import { ChildMessagesContext, ChildSessionsContext, useChildMessages, useChildSessions, useWorkspaceDir, WorkspaceDirContext } from "./contexts"
import { answerKey, PermissionDock, QuestionBlock, QuestionDock, RetryStatus, SessionNav, SubagentNotice } from "./docks"
import { PartView as BasePartView, ToolPartView as BaseToolPartView } from "./part-views"
import { createInitialState, type AppState, type VsCodeApi } from "./state"
import { Timeline } from "./timeline"
import { TaskToolRow as BaseTaskToolRow, ToolRow as BaseToolRow, ToolStatus } from "./tool-rows"
import { resizeComposer, useComposerResize } from "../hooks/useComposer"
import { useHostMessages } from "../hooks/useHostMessages"
import { useModifierState } from "../hooks/useModifierState"
import { useTimelineScroll } from "../hooks/useTimelineScroll"

declare global {
  interface Window {
    __OPENCODE_INITIAL_STATE__?: SessionBootstrap["sessionRef"] | null
  }
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()
const initialRef = window.__OPENCODE_INITIAL_STATE__ ?? null
const fileRefStatus = new Map<string, boolean>()
const markdown = new MarkdownIt({
  breaks: true,
  linkify: true,
  highlight(value: string, language: string) {
    return renderMarkdownCodeWindow(value, language)
  },
})

const linkDefault = markdown.renderer.rules.link_open
const copyTipTimers = new WeakMap<HTMLButtonElement, number>()

markdown.renderer.rules.link_open = (...args: Parameters<NonNullable<typeof linkDefault>>) => {
  const [tokens, idx, options, env, self] = args
  tokens[idx]?.attrSet("target", "_blank")
  tokens[idx]?.attrSet("rel", "noreferrer noopener")
  return linkDefault ? linkDefault(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
}

const codeInlineDefault = markdown.renderer.rules.code_inline
markdown.renderer.rules.code_inline = (...args: Parameters<NonNullable<typeof codeInlineDefault>>) => {
  const [tokens, idx, options, env, self] = args
  tokens[idx]?.attrSet("class", "oc-inlineCode")
  return codeInlineDefault ? codeInlineDefault(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
}

markdown.renderer.rules.hr = (tokens, idx) => {
  const value = tokens[idx]?.markup || "---"
  return `<p>${markdown.utils.escapeHtml(value)}</p>`
}

if (initialRef) {
  vscode.setState(initialRef)
}

export function App() {
  const [state, setState] = React.useState(() => createInitialState(initialRef))
  const [pendingMcpActions, setPendingMcpActions] = React.useState<Record<string, boolean>>({})
  const timelineRef = React.useRef<HTMLDivElement | null>(null)
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null)

  const blocked = state.snapshot.permissions.length > 0 || state.snapshot.questions.length > 0
  const isChildSession = !!state.bootstrap.session?.parentID
  const firstPermission = state.snapshot.permissions[0]
  const firstQuestion = state.snapshot.questions[0]

  useHostMessages({ fileRefStatus, setPendingMcpActions, setState, vscode })
  useComposerResize(composerRef, state.draft)
  useTimelineScroll(timelineRef, [state.snapshot.messages, state.snapshot.submitting, state.snapshot.permissions, state.snapshot.questions])
  useModifierState()

  React.useEffect(() => {
    document.title = `OpenCode: ${sessionTitle(state.bootstrap)}`
  }, [state.bootstrap])


  const submit = React.useCallback(() => {
    const text = state.draft.trim()
    if (!text || blocked) {
      return
    }

    vscode.postMessage({ type: "submit", text })
    setState((current) => ({
      ...current,
      draft: "",
      error: "",
    }))
  }, [blocked, state.draft])

  const sendQuestionReply = React.useCallback((request: QuestionRequest) => {
    const answers = request.questions.map((_item, index) => {
      const key = answerKey(request.id, index)
      const base = state.form.selected[key] ?? []
      const custom = (state.form.custom[key] ?? "").trim()
      return custom ? [...base, custom] : base
    })

    vscode.postMessage({
      type: "questionReply",
      requestID: request.id,
      answers,
    })

    setState((current) => ({ ...current, error: "" }))
  }, [state.form.custom, state.form.selected])

  return (
    <WorkspaceDirContext.Provider value={state.bootstrap.sessionRef.dir || ""}>
      <ChildMessagesContext.Provider value={state.snapshot.childMessages}>
        <ChildSessionsContext.Provider value={state.snapshot.childSessions}>
          <div className="oc-shell">
            <main ref={timelineRef} className="oc-transcript">
              <div className="oc-transcriptInner">
                <Timeline state={state} AgentBadge={AgentBadge} CompactionDivider={CompactionDivider} EmptyState={EmptyState} MarkdownBlock={MarkdownBlock} PartView={PartView} />
              </div>
            </main>

            <footer className="oc-footer">
              <div className="oc-transcriptInner oc-footerInner">
          {firstPermission ? (
            <PermissionDock
              request={firstPermission}
              currentSessionID={state.bootstrap.session?.id || state.bootstrap.sessionRef.sessionId}
              rejectMessage={state.form.reject[firstPermission.id] ?? ""}
              onRejectMessage={(value: string) => {
                setState((current) => ({
                  ...current,
                  form: {
                    ...current.form,
                    reject: {
                      ...current.form.reject,
                      [firstPermission.id]: value,
                    },
                  },
                }))
              }}
              onReply={(reply: "once" | "always" | "reject", message?: string) => {
                vscode.postMessage({ type: "permissionReply", requestID: firstPermission.id, reply, message })
                setState((current) => ({ ...current, error: "" }))
              }}
            />
          ) : null}
          {firstQuestion ? (
            <QuestionDock
              request={firstQuestion}
              form={state.form}
              onOption={(index, label, multiple) => {
                const key = answerKey(firstQuestion.id, index)
                if (!multiple && firstQuestion.questions.length === 1) {
                  vscode.postMessage({
                    type: "questionReply",
                    requestID: firstQuestion.id,
                    answers: [[label]],
                  })
                  setState((current) => ({ ...current, error: "" }))
                  return
                }

                setState((current) => {
                  const next = current.form.selected[key] ?? []
                  return {
                    ...current,
                    form: {
                      ...current.form,
                      selected: {
                        ...current.form.selected,
                        [key]: multiple
                          ? (next.includes(label) ? next.filter((item) => item !== label) : [...next, label])
                          : [label],
                      },
                      custom: multiple ? current.form.custom : {
                        ...current.form.custom,
                        [key]: "",
                      },
                    },
                  }
                })
              }}
              onCustom={(index, value) => {
                const key = answerKey(firstQuestion.id, index)
                setState((current) => ({
                  ...current,
                  form: {
                    ...current.form,
                    selected: firstQuestion.questions[index]?.multiple ? current.form.selected : {
                      ...current.form.selected,
                      [key]: value.trim() ? [] : (current.form.selected[key] ?? []),
                    },
                    custom: {
                      ...current.form.custom,
                      [key]: value,
                    },
                  },
                }))
              }}
              onReject={() => {
                vscode.postMessage({ type: "questionReject", requestID: firstQuestion.id })
                setState((current) => ({ ...current, error: "" }))
              }}
              onSubmit={() => sendQuestionReply(firstQuestion)}
            />
          ) : null}
          {!blocked && !isChildSession ? <RetryStatus status={state.snapshot.sessionStatus} /> : null}
          {isChildSession ? <SessionNav navigation={state.snapshot.navigation} onNavigate={(sessionID) => vscode.postMessage({ type: "navigateSession", sessionID })} /> : null}

          {!blocked && !isChildSession ? (
            <section className="oc-composer">
            <div className="oc-composerInputWrap">
              <textarea
                ref={composerRef}
                className="oc-composerInput"
                rows={1}
                value={state.draft}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setState((current) => ({ ...current, draft: value }))
                }}
                onInput={(event) => resizeComposer(event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
                    return
                  }
                  event.preventDefault()
                  submit()
                }}
                placeholder="Ask OpenCode to inspect, explain, or change this workspace."
                disabled={state.bootstrap.status !== "ready" || blocked}
              />
              <ComposerInfo state={state} />
            </div>
            <div className="oc-composerActions">
              <div className="oc-composerContextWrap">
                <ComposerMetrics state={state} />
                {state.error ? <div className="oc-errorText oc-composerErrorText">{state.error}</div> : null}
              </div>
          <ComposerStatusBadges state={state} pendingMcpActions={pendingMcpActions} onMcpActionStart={(name) => setPendingMcpActions((current) => ({ ...current, [name]: true }))} />
            </div>
            </section>
          ) : null}

              {!blocked && isChildSession ? <SubagentNotice /> : null}
              </div>
            </footer>
          </div>
        </ChildSessionsContext.Provider>
      </ChildMessagesContext.Provider>
    </WorkspaceDirContext.Provider>
  )
}

function ComposerInfo({ state }: { state: AppState }) {
  const info = composerIdentity(state)
  const running = isSessionRunning(state.snapshot.sessionStatus)
  return (
    <div className="oc-composerInfo" aria-hidden="true">
      <div className="oc-composerInfoSpacer" />
      <div className="oc-composerInfoRow">
        <span className="oc-composerIdentityStart">
          <span className="oc-composerAgent" style={{ color: agentColor(info.agent) }}>{info.agent}</span>
          <ComposerRunningIndicator running={running} />
        </span>
        {info.model ? <span className="oc-composerModel" title={info.model}>{info.model}</span> : null}
        {info.provider ? <span className="oc-composerProvider" title={info.provider}>{info.provider}</span> : null}
      </div>
    </div>
  )
}

function ComposerRunningIndicator({ running }: { running: boolean }) {
  return <span className={`oc-composerRunBar${running ? " is-running" : ""}`} aria-label="running" />
}

function ComposerMetrics({ state }: { state: AppState }) {
  const metrics = composerMetrics(state)
  const items = [
    `${metrics.tokens.toLocaleString()} tokens`,
    typeof metrics.percent === "number" ? `${metrics.percent}%` : "",
    formatUsd(metrics.cost),
  ].filter(Boolean)
  return (
    <div className="oc-contextRow">
      {items.map((item, index) => (
        <React.Fragment key={item}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          <span>{item}</span>
        </React.Fragment>
      ))}
    </div>
  )
}

function ComposerStatusBadges({ state, pendingMcpActions, onMcpActionStart }: { state: AppState; pendingMcpActions: Record<string, boolean>; onMcpActionStart: (name: string) => void }) {
  const mcp = overallMcpStatus(state.snapshot.mcp)
  const lsp = overallLspStatus(state.snapshot.lsp)
  return (
    <div className="oc-actionRow oc-composerBadgeRow">
      <StatusBadge label="MCP" tone={mcp.tone} items={mcp.items} pendingActions={pendingMcpActions} onActionStart={onMcpActionStart} />
      <StatusBadge label="LSP" tone={lsp.tone} items={lsp.items} />
    </div>
  )
}

function StatusBadge(props: { label: string; tone: StatusTone; items: StatusItem[]; pendingActions?: Record<string, boolean>; onActionStart?: (name: string) => void }) {
  const { label, tone, items, pendingActions, onActionStart } = props
  return (
    <div className="oc-statusBadgeWrap">
      <div className="oc-statusBadge">
        <span className={`oc-statusLight is-${tone}`} />
        <span>{label}</span>
      </div>
      {items.length > 0 ? (
        <div className="oc-statusPopover">
          {items.map((item) => (
            <div key={`${label}-${item.name}`} className="oc-statusPopoverItem">
              <span className={`oc-statusLight is-${item.tone}`} />
              <span className="oc-statusPopoverName">{item.name}</span>
              <span className="oc-statusPopoverValue" title={item.value}>{item.value}</span>
              {item.action ? <StatusPopoverAction item={item} pending={!!pendingActions?.[item.name]} onActionStart={onActionStart} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StatusPopoverAction({ item, pending, onActionStart }: { item: StatusItem; pending: boolean; onActionStart?: (name: string) => void }) {
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!item.action || pending) {
      return
    }
    onActionStart?.(item.name)
    vscode.postMessage({ type: "toggleMcp", name: item.name, action: item.action })
  }

  return (
    <button type="button" disabled={pending} className={`oc-statusPopoverAction${item.action === "disconnect" ? " is-disconnect" : ""}${item.action === "connect" ? " is-connect" : ""}${pending ? " is-pending" : ""}`} onClick={onClick} title={item.actionLabel} aria-label={item.actionLabel}>
      {item.action === "disconnect" ? <DisconnectIcon /> : null}
      {item.action === "connect" ? <ConnectIcon /> : null}
      {item.action === "reconnect" ? <ReconnectIcon /> : null}
    </button>
  )
}

function ConnectIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 22L6 18" className="oc-statusActionPath" />
      <rect x="5" y="13" width="7" height="5" rx="1" transform="rotate(-45 8.5 15.5)" className="oc-statusActionPath" />
      <path d="M8 14L10 12" className="oc-statusActionPath" />
      <path d="M10 16L12 14" className="oc-statusActionPath" />
      <rect x="12" y="6" width="7" height="5" rx="1" transform="rotate(-45 15.5 8.5)" className="oc-statusActionPath" />
      <path d="M18 6L22 2" className="oc-statusActionPath" />
    </svg>
  )
}

function DisconnectIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 22L6 18" className="oc-statusActionPath" />
      <rect x="5" y="13" width="7" height="5" rx="1" transform="rotate(-45 8.5 15.5)" className="oc-statusActionPath" />
      <path d="M8 14L10 12" className="oc-statusActionPath" />
      <path d="M10 16L12 14" className="oc-statusActionPath" />
      <rect x="12" y="6" width="7" height="5" rx="1" transform="rotate(-45 15.5 8.5)" className="oc-statusActionPath" />
      <path d="M18 6L22 2" className="oc-statusActionPath" />
      <path d="M4 4L20 20" className="oc-statusActionPath" />
    </svg>
  )
}

function ReconnectIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M12.5 6.5A4.5 4.5 0 0 0 5.25 4" className="oc-statusActionPath" />
      <path d="M4.75 2.75v2.5h2.5" className="oc-statusActionPath" />
      <path d="M3.5 9.5A4.5 4.5 0 0 0 10.75 12" className="oc-statusActionPath" />
      <path d="M11.25 13.25v-2.5h-2.5" className="oc-statusActionPath" />
    </svg>
  )
}

function isSessionRunning(status?: SessionStatus) {
  return status?.type === "busy" || status?.type === "retry"
}

type ToolDetails = {
  title: string
  subtitle: string
  args: string[]
}

const OUTPUT_WINDOW_COLLAPSED_LINES = 10
const OUTPUT_WINDOW_EXPANDED_LINES = 100
const OUTPUT_WINDOW_FONT_SIZE_PX = 12
const OUTPUT_WINDOW_LINE_HEIGHT = 1.65
const OUTPUT_WINDOW_VERTICAL_PADDING_PX = 24

type ToolFileSummary = {
  path: string
  summary: string
}

function PartView({ part, active = false, diffMode = "unified" }: { part: MessagePart; active?: boolean; diffMode?: "unified" | "split" }) {
  return <BasePartView DividerPartView={DividerPartView} MarkdownBlock={MarkdownBlock} ToolPartView={ToolPartView} diffMode={diffMode} part={part} active={active} cleanReasoning={cleanReasoning} fileLabel={fileLabel} isDividerPart={isDividerPart} partMeta={partMeta} partTitle={partTitle} renderPartBody={renderPartBody} />
}

function ToolPartView({ part, active = false, diffMode = "unified" }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) {
  return <BaseToolPartView ToolFilesPanel={ToolFilesPanel} ToolLinksPanel={ToolLinksPanel} ToolLspPanel={ToolLspPanel} ToolQuestionPanel={ToolQuestionPanel} ToolRow={ToolRow} ToolShellPanel={ToolShellPanel} ToolTextPanel={ToolTextPanel} ToolTodosPanel={ToolTodosPanel} active={active} diffMode={diffMode} isMcpTool={isMcpTool} lspRendersInline={lspRendersInline} part={part} />
}

function ToolRow({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  if (part.tool === "task") {
    return <TaskToolRow part={part} active={active} />
  }

  const childSessionID = toolChildSessionId(part)
  const workspaceDir = useWorkspaceDir()
  const summary = toolRowSummary(part)
  const extras = toolRowExtras(part)
  return <BaseToolRow ToolStatus={ToolStatus} active={active} isMcpTool={isMcpTool} part={part} renderToolRowExtra={renderToolRowExtra} renderToolRowSubtitle={(current) => renderToolRowSubtitle(current, toolDetails(current), workspaceDir)} renderToolRowTitle={(current) => renderToolRowTitle(current, toolDetails(current), workspaceDir)} summary={summary} extras={extras} childSessionID={childSessionID} onNavigate={(sessionID) => vscode.postMessage({ type: "navigateSession", sessionID })} toolLabel={toolLabel} />
}

function TaskToolRow({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  const childSessionID = toolChildSessionId(part)
  const agentName = taskAgentName(part)
  const child = useChildMessages()
  const sessions = useChildSessions()
  const title = taskSessionTitle(part, sessions[childSessionID])
  const body = taskBody(part, child[childSessionID] || [])
  return <BaseTaskToolRow AgentBadge={AgentBadge} ToolStatus={ToolStatus} active={active} part={part} child={child} sessions={sessions} childSessionID={childSessionID} agentName={agentName} title={title} body={body} onNavigate={(sessionID) => vscode.postMessage({ type: "navigateSession", sessionID })} />
}

function ToolTextPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  const details = toolDetails(part)
  const body = toolTextBody(part)
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, !!body))
  const status = part.state?.status || "pending"

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-${part.tool}${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <button type="button" className="oc-toolTrigger" onClick={() => setExpanded((current: boolean) => !current)}>
        <div className="oc-partHeader">
          <div className="oc-toolHeaderMain">
            <span className="oc-kicker">{toolLabel(part.tool)}</span>
            <span className="oc-toolPanelTitle">{details.title}</span>
          </div>
          <div className="oc-toolHeaderMeta">
            {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      </button>
      {expanded && details.args.length > 0 ? (
        <div className="oc-attachmentRow">
          {details.args.map((item) => <span key={item} className="oc-pill oc-pill-file">{item}</span>)}
        </div>
      ) : null}
      {expanded ? <ToolFallbackText part={part} body={body} /> : null}
    </section>
  )
}

function ToolLspPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  const details = toolDetails(part)
  const workspaceDir = useWorkspaceDir()
  const body = toolTextBody(part)
  const diagnostics = toolDiagnostics(part)
  const status = part.state?.status || "pending"
  const hasErrorBody = !diagnostics.length && !!body.trim() && body.trim() !== "No diagnostics found"
  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-lsp${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <div className="oc-partHeader">
        <div className="oc-toolHeaderMain">
          <span className="oc-kicker">{toolLabel(part.tool)}</span>
          <span className="oc-toolPanelTitle">{renderLspToolTitle(part, workspaceDir) || details.title}</span>
        </div>
        <div className="oc-toolHeaderMeta">
          {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
          <ToolStatus state={part.state?.status} />
        </div>
      </div>
      {details.args.length > 0 ? (
        <div className="oc-attachmentRow">
          {details.args.map((item) => <span key={item} className="oc-pill oc-pill-file">{item}</span>)}
        </div>
      ) : null}
      {diagnostics.length > 0
        ? <DiagnosticsList items={diagnostics} tone="error" />
        : hasErrorBody ? <pre className="oc-errorBlock">{body}</pre> : body ? <pre className="oc-partTerminal">{body}</pre> : null}
    </section>
  )
}

function ToolShellPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  const details = toolDetails(part)
  const body = toolTextBody(part)
  const status = part.state?.status || "pending"
  return (
    <OutputWindow
      action={toolLabel(part.tool)}
      title={details.title}
      running={status === "running"}
      lineCount={normalizedLineCount(body)}
      className={active ? "is-active" : ""}
    >
      <pre className="oc-outputWindowContent oc-outputWindowContent-shell">{body || " "}</pre>
    </OutputWindow>
  )
}

function ToolLinksPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  const details = toolDetails(part)
  const links = uniqueStrings(extractUrls(part.state?.output || ""))
  const status = part.state?.status || "pending"
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, links.length > 0))

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <button type="button" className="oc-toolTrigger" onClick={() => setExpanded((current: boolean) => !current)}>
        <div className="oc-partHeader">
          <div className="oc-toolHeaderMain">
            <span className="oc-kicker">{toolLabel(part.tool)}</span>
            <span className="oc-toolPanelTitle">{details.title}</span>
          </div>
          <div className="oc-toolHeaderMeta">
            {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      </button>
      {expanded && links.length > 0 ? (
        <div className="oc-linkList">
          {links.map((item) => <a key={item} className="oc-linkItem" href={item}>{item}</a>)}
        </div>
      ) : null}
    </section>
  )
}

function ToolFilesPanel({ part, active = false, diffMode = "unified" }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) {
  if (part.tool === "write") {
    return <ToolWritePanel part={part} active={active} />
  }

  if (part.tool === "edit") {
    return <ToolEditPanel part={part} active={active} diffMode={diffMode} />
  }

  if (part.tool === "apply_patch") {
    return <ToolApplyPatchPanel part={part} active={active} diffMode={diffMode} />
  }

  const details = toolDetails(part)
  const files = toolFiles(part)
  const status = part.state?.status || "pending"
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, files.length > 0 || !!toolTextBody(part)))

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-files${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <button type="button" className="oc-toolTrigger" onClick={() => setExpanded((current: boolean) => !current)}>
        <div className="oc-partHeader">
          <div className="oc-toolHeaderMain">
            <span className="oc-kicker">{toolLabel(part.tool)}</span>
            <span className="oc-toolPanelTitle">{details.title}</span>
          </div>
          <div className="oc-toolHeaderMeta">
            {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      </button>
      {expanded && files.length > 0 ? (
        <div className="oc-fileToolList">
          {files.map((item) => (
            <div key={`${item.path}:${item.summary}`} className="oc-fileToolItem">
              <div className="oc-fileToolPath">{item.path}</div>
              {item.summary ? <div className="oc-fileToolSummary">{item.summary}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
      {expanded && files.length === 0 ? <ToolFallbackText part={part} body={toolTextBody(part)} /> : null}
    </section>
  )
}

function ToolWritePanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  const details = toolDetails(part)
  const status = part.state?.status || "pending"
  const content = toolWriteContent(part)
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, !!content))

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-files${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <button type="button" className="oc-toolTrigger" onClick={() => setExpanded((current: boolean) => !current)}>
        <div className="oc-partHeader">
          <div className="oc-toolHeaderMain">
            <span className="oc-kicker">{toolLabel(part.tool)}</span>
            <span className="oc-toolPanelTitle">{details.title}</span>
          </div>
          <div className="oc-toolHeaderMeta">
            {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      </button>
      {expanded && content ? <CodeBlock value={content} filePath={details.title} /> : null}
      {expanded && !content ? <ToolFallbackText part={part} body={toolTextBody(part)} /> : null}
      {expanded && toolDiagnostics(part).length > 0 ? <DiagnosticsList items={toolDiagnostics(part)} /> : null}
    </section>
  )
}

function ToolEditPanel({ part, active = false, diffMode = "unified" }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) {
  const details = toolDetails(part)
  const status = part.state?.status || "pending"
  const diff = toolEditDiff(part)
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, !!diff || !!toolTextBody(part)))

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-files${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <button type="button" className="oc-toolTrigger" onClick={() => setExpanded((current: boolean) => !current)}>
        <div className="oc-partHeader">
          <div className="oc-toolHeaderMain">
            <span className="oc-kicker">{toolLabel(part.tool)}</span>
            <span className="oc-toolPanelTitle">{details.title}</span>
          </div>
          <div className="oc-toolHeaderMeta">
            {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      </button>
      {expanded && diff ? <DiffBlock value={diff} mode={diffMode} /> : null}
      {expanded && !diff ? <ToolFallbackText part={part} body={toolTextBody(part)} /> : null}
      {expanded && toolDiagnostics(part).length > 0 ? <DiagnosticsList items={toolDiagnostics(part)} /> : null}
    </section>
  )
}

function ToolApplyPatchPanel({ part, active = false, diffMode = "unified" }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) {
  const status = part.state?.status || "pending"
  const files = patchFiles(part)
  const details = toolDetails(part)

  return (
    <section className={`oc-patchPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      {files.length === 0 ? (
        <section className={`oc-part oc-part-tool oc-toolPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
          <div className="oc-partHeader">
            <div className="oc-toolHeaderMain">
              <span className="oc-kicker">{toolLabel(part.tool)}</span>
              <span className="oc-toolPanelTitle">{details.title}</span>
            </div>
            <div className="oc-toolHeaderMeta">
              {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
              <ToolStatus state={part.state?.status} />
            </div>
          </div>
          <ToolFallbackText part={part} body={toolTextBody(part)} />
        </section>
      ) : null}
      {files.length > 0 ? (
        <div className="oc-patchList">
          {files.map((item) => (
            <section key={`${item.path}:${item.type}:${item.summary}`} className="oc-patchItem">
              <OutputWindow
                action={item.type}
                title={<FileRefText value={item.path} display={item.path} />}
                running={status === "running"}
                lineCount={item.diff ? diffOutputLineCount(item.diff, diffMode) : normalizedLineCount(item.summary)}
                className="oc-outputWindow-patch"
              >
                {item.diff
                  ? <DiffWindowBody value={item.diff} mode={diffMode} filePath={item.path} />
                  : <pre className="oc-outputWindowContent oc-outputWindowContent-shell">{item.summary || " "}</pre>}
              </OutputWindow>
            </section>
          ))}
        </div>
      ) : null}
      {toolDiagnostics(part).length > 0 ? <DiagnosticsList items={toolDiagnostics(part)} /> : null}
    </section>
  )
}

function ToolFallbackText({ part, body }: { part: Extract<MessagePart, { type: "tool" }>; body: string }) {
  if (!body) {
    return null
  }
  if (part.state?.error) {
    return <pre className="oc-errorBlock">{body}</pre>
  }
  return <pre className="oc-partTerminal">{body}</pre>
}

function CodeBlock({ value, filePath }: { value: string; filePath?: string }) {
  const html = React.useMemo(() => highlightCode(value, codeLanguage(filePath)), [filePath, value])
  return <pre className="oc-codeBlock"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>
}

function DiffBlock({ value, mode = "unified" }: { value: string; mode?: "unified" | "split" }) {
  return <DiffBlockImpl value={value} mode={mode} />
}

function DiffWindowBody({ value, mode = "unified", filePath }: { value: string; mode?: "unified" | "split"; filePath?: string }) {
  return <DiffBlockImpl value={value} mode={mode} windowed filePath={filePath} />
}

function DiffBlockImpl({ value, mode, windowed = false, filePath }: { value: string; mode: "unified" | "split"; windowed?: boolean; filePath?: string }) {
  if (mode === "split") {
    return <SplitDiffBlock value={value} windowed={windowed} filePath={filePath} />
  }
  const rows = React.useMemo(() => parseUnifiedDiffRows(value), [value])
  const language = React.useMemo(() => codeLanguage(filePath), [filePath])
  return (
    <div className={`oc-diffBlock${windowed ? " is-window" : ""}`}>
      {rows.map((row, index) => (
        <div key={`${index}:${row.oldLine ?? ""}:${row.newLine ?? ""}:${row.marker}:${row.text}`} className={diffRowClass(row.type)}>
          <span className="oc-diffLineNo">{formatDiffLineNumber(row.oldLine)}</span>
          <span className="oc-diffLineNo">{formatDiffLineNumber(row.newLine)}</span>
          <span className="oc-diffLineMarker">{row.marker}</span>
          <DiffCodeText text={row.text} language={language} />
        </div>
      ))}
    </div>
  )
}

function SplitDiffBlock({ value, windowed = false, filePath }: { value: string; windowed?: boolean; filePath?: string }) {
  const rows = React.useMemo(() => splitDiffRows(value), [value])
  const language = React.useMemo(() => codeLanguage(filePath), [filePath])
  return (
    <div className={`oc-splitDiff${windowed ? " is-window" : ""}`}>
      <div className="oc-splitDiffBody">
        {rows.map((row, index) => (
          <React.Fragment key={`${index}:${row.left}:${row.right}`}>
            <div className={splitDiffClass(row.leftType)}>
              <span className="oc-diffLineNo">{formatDiffLineNumber(row.leftLine)}</span>
              <span className="oc-diffLineMarker">{row.leftMarker}</span>
              <DiffCodeText text={row.left} language={language} />
            </div>
            <div className={splitDiffClass(row.rightType)}>
              <span className="oc-diffLineNo">{formatDiffLineNumber(row.rightLine)}</span>
              <span className="oc-diffLineMarker">{row.rightMarker}</span>
              <DiffCodeText text={row.right} language={language} />
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function DiffCodeText({ text, language }: { text: string; language: string }) {
  const html = React.useMemo(() => highlightCode(text || " ", language), [language, text])
  return <span className="oc-diffLineText hljs" dangerouslySetInnerHTML={{ __html: html }} />
}

function DiagnosticsList({ items, tone = "warning" }: { items: string[]; tone?: "warning" | "error" }) {
  return (
    <div className={`oc-diagnosticsList is-${tone}`}>
      {items.map((item) => <div key={item} className={`oc-diagnosticItem is-${tone}`}>{item}</div>)}
    </div>
  )
}

function ToolTodosPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  const details = toolDetails(part)
  const todos = toolTodos(part)
  const status = part.state?.status || "pending"
  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-todos${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <div className="oc-partHeader">
        <div className="oc-toolHeaderMain">
          <span className="oc-kicker">to-dos</span>
          <span className="oc-toolPanelTitle">{details.title}</span>
        </div>
        <div className="oc-toolHeaderMeta">
          {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      {todos.length > 0 ? (
        <div className="oc-toolTodoList">
          {todos.map((item) => <div key={`${item.status}:${item.content}`} className={`oc-toolTodoItem is-${item.status}`}>{todoMarker(item.status)} {item.content}</div>)}
        </div>
      ) : status === "running" || status === "pending" ? <div className="oc-partEmpty">Updating todos...</div> : null}
    </section>
  )
}

function ToolQuestionPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  const details = toolDetails(part)
  const answers = questionAnswerGroups(part.state?.metadata?.answers)
  const questions = questionInfoList(part.state?.input)
  const status = part.state?.status || "pending"
  return (
    <section className={`oc-part oc-part-tool oc-toolPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <div className="oc-partHeader">
        <div className="oc-toolHeaderMain">
          <span className="oc-kicker">questions</span>
          <span className="oc-toolPanelTitle">{details.title}</span>
        </div>
        <div className="oc-toolHeaderMeta">
          {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      {questions.length > 0 ? <QuestionBlock request={{ id: part.id, questions }} mode="answered" answers={answers} /> : answers.flat().length > 0 ? <div className="oc-toolAnswerList">{answers.flat().map((item) => <div key={item} className="oc-toolAnswerItem">{item}</div>)}</div> : null}
    </section>
  )
}

function DividerPartView({ part }: { part: MessagePart }) {
  return (
    <div className={`oc-dividerPart oc-dividerPart-${part.type}`}>
      <span className="oc-dividerLine" />
      <span className="oc-dividerText">{dividerText(part)}</span>
      <span className="oc-dividerLine" />
    </div>
  )
}

function renderPartBody(part: MessagePart) {
  if (part.type === "tool") {
    return <pre className="oc-partTerminal">{toolTextBody(part)}</pre>
  }

  if (part.type === "patch") {
    const files = stringList((part as Record<string, unknown>).files)
    return files.length > 0
      ? <ul className="oc-list">{files.map((file) => <li key={file}>{file}</li>)}</ul>
      : <div className="oc-partEmpty">Patch created.</div>
  }

  if (part.type === "subtask") {
    return <MarkdownBlock content={textValue((part as Record<string, unknown>).description) || textValue((part as Record<string, unknown>).prompt) || ""} />
  }

  if (part.type === "snapshot") {
    return <pre className="oc-partTerminal">{textValue((part as Record<string, unknown>).snapshot) || "Workspace snapshot updated."}</pre>
  }

  if (part.type === "retry") {
    const error = (part as Record<string, unknown>).error
    return <pre className="oc-partTerminal">{retryText(error)}</pre>
  }

  if (part.type === "agent") {
    return <MarkdownBlock content={textValue((part as Record<string, unknown>).name) || "Agent task"} />
  }

  if (part.type === "compaction") {
    return <MarkdownBlock content={(part as Record<string, unknown>).auto ? "Automatic compaction completed." : "Compaction completed."} />
  }

  return <div className="oc-partEmpty">{partTitle(part)}</div>
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="oc-emptyWrap">
      <section className="oc-emptyState">
        <div className="oc-kicker">session</div>
        <h2 className="oc-emptyTitle">{title}</h2>
        <p className="oc-emptyText">{text}</p>
      </section>
    </div>
  )
}

function MarkdownBlock({ content, className = "" }: { content: string; className?: string }) {
  const html = React.useMemo(() => markdown.render(content || ""), [content])
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }

    const sync = () => syncMarkdownFileRefs(root)
    sync()
    window.addEventListener("oc-file-refs-updated", sync)
    return () => window.removeEventListener("oc-file-refs-updated", sync)
  }, [html])

  return (
    <div
      ref={rootRef}
      className={`oc-markdown${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        const target = event.target
        if (!(target instanceof Element)) {
          return
        }

        const link = target.closest("a")
        if (link instanceof HTMLAnchorElement) {
          const fileRef = parseFileReference(link.getAttribute("href") || "")
          if (fileRef && fileRefStatus.get(fileRef.key) !== false) {
            event.preventDefault()
            event.stopPropagation()
            vscode.postMessage({
              type: "openFile",
              filePath: fileRef.filePath,
              line: fileRef.line,
            })
          }
          return
        }

        const inlineCode = target.closest(".oc-inlineCode")
        if (inlineCode instanceof HTMLElement) {
          if (!event.metaKey && !event.ctrlKey) {
            return
          }
          const fileRef = parseFileReference(inlineCode.textContent || "")
          if (!fileRef || !fileRefStatus.get(fileRef.key)) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          vscode.postMessage({
            type: "openFile",
            filePath: fileRef.filePath,
            line: fileRef.line,
          })
          return
        }

        const button = target.closest("[data-copy-code]")
        if (!(button instanceof HTMLButtonElement)) {
          return
        }
        const value = button.getAttribute("data-copy-code") || ""
        if (!value) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        button.blur()
        const timer = copyTipTimers.get(button)
        if (timer) {
          window.clearTimeout(timer)
        }
        button.setAttribute("data-copied", "true")
        copyTipTimers.set(button, window.setTimeout(() => {
          button.removeAttribute("data-copied")
          copyTipTimers.delete(button)
        }, 1200))
        void copyText(value)
      }}
    />
  )
}

function sessionTitle(bootstrap: SessionBootstrap) {
  return bootstrap.session?.title || bootstrap.sessionRef.sessionId?.slice(0, 8) || "session"
}

function toolLabel(tool: string) {
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

function toolDetails(part: Extract<MessagePart, { type: "tool" }>): ToolDetails {
  const input = recordValue(part.state?.input)
  const metadata = recordValue(part.state?.metadata)
  const title = part.tool === "apply_patch"
    ? defaultToolTitle(part.tool, input, metadata)
    : stringValue(part.state?.title) || defaultToolTitle(part.tool, input, metadata)
  const subtitle = defaultToolSubtitle(part.tool, input, metadata)
  const args = defaultToolArgs(part.tool, input)
  return { title, subtitle, args }
}

function defaultToolTitle(tool: string, input: Record<string, unknown>, metadata: Record<string, unknown>) {
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

function defaultToolSubtitle(tool: string, input: Record<string, unknown>, metadata: Record<string, unknown>) {
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

function defaultToolArgs(tool: string, input: Record<string, unknown>) {
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

function toolTextBody(part: Extract<MessagePart, { type: "tool" }>) {
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
  if (lines.length === 0) {
    if (Object.keys(metadata).length > 0) {
      lines.push(JSON.stringify(metadata, null, 2))
    }
  }
  return lines.join("\n\n")
}

function defaultToolExpanded(part: Extract<MessagePart, { type: "tool" }>, active: boolean, hasBody: boolean) {
  const status = part.state?.status || "pending"
  if (active || status === "running" || status === "pending" || status === "error") {
    return true
  }
  if (part.tool === "bash" || part.tool === "apply_patch") {
    return true
  }
  if (part.tool === "bash" || part.tool === "edit" || part.tool === "write" || part.tool === "apply_patch") {
    return hasBody && status !== "completed"
  }
  return false
}

function toolRowTitle(part: Extract<MessagePart, { type: "tool" }>, details: ToolDetails) {
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
    const query = stringValue(input.query)
    return query || details.title
  }
  if (part.tool === "glob" || part.tool === "grep") {
    const pattern = stringValue(input.pattern)
    return pattern || details.title
  }
  if (part.tool === "list") {
    return details.title
  }
  return details.title
}

function renderToolRowTitle(part: Extract<MessagePart, { type: "tool" }>, details: ToolDetails, workspaceDir = "") {
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
    return renderLspToolTitle(part, workspaceDir)
  }

  return toolRowTitle(part, details)
}

function toolRowSubtitle(part: Extract<MessagePart, { type: "tool" }>, details: ToolDetails, workspaceDir = "") {
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

function renderToolRowSubtitle(part: Extract<MessagePart, { type: "tool" }>, details: ToolDetails, workspaceDir = "") {
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

function toolRowSummary(part: Extract<MessagePart, { type: "tool" }>) {
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

function taskSummary(part: Extract<MessagePart, { type: "tool" }>, messages: SessionMessage[]) {
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

function toolRowExtras(part: Extract<MessagePart, { type: "tool" }>) {
  const metadata = recordValue(part.state?.metadata)
  if (isMcpTool(part.tool)) {
    return [] as string[]
  }
  if (part.tool === "read") {
    return stringList(metadata.loaded).map((item) => `Loaded ${item}`)
  }
  return [] as string[]
}

function renderToolRowExtra(part: Extract<MessagePart, { type: "tool" }>, item: string) {
  if (part.tool === "read" && item.startsWith("Loaded ")) {
    const value = item.slice(7)
    return <><span>Loaded </span><FileRefText value={value} display={value} /></>
  }
  return item
}

function taskAgentName(part: Extract<MessagePart, { type: "tool" }>) {
  const input = recordValue(part.state?.input)
  const metadata = recordValue(part.state?.metadata)
  return stringValue(input.subagent_type) || stringValue(metadata.agent) || stringValue(metadata.name) || "subagent"
}

function taskSessionTitle(part: Extract<MessagePart, { type: "tool" }>, session?: SessionInfo) {
  if (session?.title?.trim()) {
    return session.title.trim()
  }

  const title = stringValue(part.state?.title) || toolDetails(part).title
  if (!title) {
    return "Task"
  }
  return title.toLowerCase().startsWith("task ") ? title : `Task ${title}`
}

function taskBody(part: Extract<MessagePart, { type: "tool" }>, messages: SessionMessage[]) {
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

function childTools(messages: SessionMessage[]) {
  return messages.flatMap((message) => message.parts.filter((part): part is Extract<MessagePart, { type: "tool" }> => part.type === "tool"))
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

function OutputWindow({
  action,
  title,
  running = false,
  lineCount,
  className = "",
  children,
}: {
  action: string
  title: React.ReactNode
  running?: boolean
  lineCount: number
  className?: string
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [contentHeight, setContentHeight] = React.useState(0)
  const toggleRef = React.useRef<HTMLButtonElement | null>(null)
  const scrollAdjustRef = React.useRef<{ scrollNode: HTMLElement; top: number } | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const collapsedHeight = React.useMemo(() => outputWindowBodyHeight(OUTPUT_WINDOW_COLLAPSED_LINES), [])
  const expandedHeight = React.useMemo(() => outputWindowBodyHeight(OUTPUT_WINDOW_EXPANDED_LINES), [])
  const collapsible = contentHeight > collapsedHeight + 1
  const scrollable = contentHeight > expandedHeight + 1

  React.useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) {
      return
    }

    const measure = () => {
      const next = Math.ceil(node.scrollHeight)
      setContentHeight((current) => current === next ? current : next)
    }

    measure()

    const Observer = window.ResizeObserver
    if (!Observer) {
      return
    }

    const observer = new Observer(() => measure())
    observer.observe(node)
    return () => observer.disconnect()
  }, [children, expanded])

  const bodyStyle = React.useMemo<React.CSSProperties>(() => {
    if (!collapsible) {
      return {}
    }
    if (!expanded) {
      return { maxHeight: `${collapsedHeight}px` }
    }
    if (scrollable) {
      return { maxHeight: `${expandedHeight}px` }
    }
    return {}
  }, [collapsedHeight, collapsible, expanded, expandedHeight, scrollable])

  React.useEffect(() => {
    if (!collapsible && expanded) {
      setExpanded(false)
    }
  }, [collapsible, expanded])

  React.useLayoutEffect(() => {
    const pending = scrollAdjustRef.current
    const toggleNode = toggleRef.current
    if (!pending || !toggleNode) {
      return
    }
    const nextTop = toggleNode.getBoundingClientRect().top
    pending.scrollNode.scrollTop += nextTop - pending.top
    scrollAdjustRef.current = null
  }, [expanded])

  const bodyClassName = [
    "oc-outputWindowBody",
    collapsible ? "is-collapsible" : "",
    collapsible && expanded ? "is-expanded" : "",
    collapsible && !expanded ? "is-collapsed" : "",
    collapsible && expanded && scrollable ? "is-scrollable" : "",
  ].filter(Boolean).join(" ")

  return (
    <section className={["oc-outputWindow", className].filter(Boolean).join(" ")}>
      <div className="oc-outputWindowHead">
        <div className="oc-outputWindowTitleRow">
          <span className="oc-outputWindowAction">{action}</span>
          <span className="oc-outputWindowTitle">{title}</span>
        </div>
        <span className="oc-outputWindowSpinnerSlot">{running ? <ToolStatus state="running" /> : null}</span>
      </div>
      <div className={bodyClassName} style={bodyStyle}>
        <div ref={contentRef} className="oc-outputWindowBodyInner">{children}</div>
      </div>
      {collapsible ? (
        <button
          ref={toggleRef}
          type="button"
          className="oc-outputWindowToggle"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse output" : "Expand output"}
          onClick={(event) => {
            const toggleNode = event.currentTarget
            if (expanded) {
              const scrollNode = toggleNode.closest(".oc-transcript")
              if (scrollNode instanceof HTMLElement) {
                scrollAdjustRef.current = {
                  scrollNode,
                  top: toggleNode.getBoundingClientRect().top,
                }
              } else {
                scrollAdjustRef.current = null
              }
            } else {
              scrollAdjustRef.current = null
            }
            setExpanded((current) => !current)
          }}
        >
          <svg className="oc-outputWindowToggleIcon" viewBox="0 0 16 16" aria-hidden="true">
            {expanded
              ? <path d="M4 10l4-4 4 4" />
              : <path d="M4 6l4 4 4-4" />}
          </svg>
          <span className="oc-outputWindowToggleMeta">{formatLineCount(lineCount)}</span>
        </button>
      ) : null}
    </section>
  )
}

function splitDiffRows(value: string) {
  const rows: Array<{
    left: string
    right: string
    leftType: string
    rightType: string
    leftLine?: number
    rightLine?: number
    leftMarker: string
    rightMarker: string
  }> = []
  const hunks = parseDiffHunks(value)
  for (const hunk of hunks) {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    for (let index = 0; index < hunk.lines.length; index += 1) {
      const line = hunk.lines[index] || ""
      if (line.startsWith("-")) {
        const next = hunk.lines[index + 1] || ""
        if (next.startsWith("+")) {
          rows.push({
            left: line.slice(1),
            right: next.slice(1),
            leftType: "del",
            rightType: "add",
            leftLine: oldLine,
            rightLine: newLine,
            leftMarker: "-",
            rightMarker: "+",
          })
          oldLine += 1
          newLine += 1
          index += 1
          continue
        }
        rows.push({ left: line.slice(1), right: "", leftType: "del", rightType: "empty", leftLine: oldLine, leftMarker: "-", rightMarker: "" })
        oldLine += 1
        continue
      }
      if (line.startsWith("+")) {
        rows.push({ left: "", right: line.slice(1), leftType: "empty", rightType: "add", rightLine: newLine, leftMarker: "", rightMarker: "+" })
        newLine += 1
        continue
      }
      const text = line.startsWith(" ") ? line.slice(1) : line
      rows.push({
        left: text,
        right: text,
        leftType: "ctx",
        rightType: "ctx",
        leftLine: oldLine,
        rightLine: newLine,
        leftMarker: " ",
        rightMarker: " ",
      })
      oldLine += 1
      newLine += 1
    }
  }
  return rows
}

function normalizedLineCount(value: string) {
  if (!value) {
    return 0
  }
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length
}

function diffOutputLineCount(value: string, mode: "unified" | "split") {
  if (mode === "split") {
    return splitDiffRows(value).length
  }
  return parseUnifiedDiffRows(value).length
}

function outputWindowBodyHeight(lines: number) {
  const lineHeightPx = OUTPUT_WINDOW_FONT_SIZE_PX * OUTPUT_WINDOW_LINE_HEIGHT
  return Math.round(lines * lineHeightPx + OUTPUT_WINDOW_VERTICAL_PADDING_PX)
}

function splitDiffClass(type: string) {
  if (type === "add") return "oc-splitDiffLine is-add"
  if (type === "del") return "oc-splitDiffLine is-del"
  if (type === "empty") return "oc-splitDiffLine is-empty"
  return "oc-splitDiffLine"
}

function diffRowClass(type: string) {
  if (type === "add") return "oc-diffLine is-add"
  if (type === "del") return "oc-diffLine is-del"
  return "oc-diffLine"
}

function parseUnifiedDiffRows(value: string) {
  const rows: Array<{ type: string; text: string; oldLine?: number; newLine?: number; marker: string }> = []
  const hunks = parseDiffHunks(value)
  for (const hunk of hunks) {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    for (const line of hunk.lines) {
      if (line.startsWith("-")) {
        rows.push({ type: "del", text: line.slice(1), oldLine, marker: "-" })
        oldLine += 1
        continue
      }
      if (line.startsWith("+")) {
        rows.push({ type: "add", text: line.slice(1), newLine, marker: "+" })
        newLine += 1
        continue
      }
      const text = line.startsWith(" ") ? line.slice(1) : line
      rows.push({ type: "ctx", text, oldLine, newLine, marker: " " })
      oldLine += 1
      newLine += 1
    }
  }
  return rows
}

function parseDiffHunks(value: string) {
  const lines = value.split("\n")
  const hunks: Array<{ oldStart: number; newStart: number; lines: string[] }> = []
  let current: { oldStart: number; newStart: number; lines: string[] } | null = null
  for (const rawLine of lines) {
    const line = rawLine || ""
    if (line.startsWith("@@")) {
      const header = parseHunkHeader(line)
      current = { oldStart: header.oldStart, newStart: header.newStart, lines: [] }
      hunks.push(current)
      continue
    }
    if (!current) {
      continue
    }
    if (line.startsWith("\\ No newline at end of file")) {
      continue
    }
    current.lines.push(line)
  }
  return hunks
}

function parseHunkHeader(line: string) {
  const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line)
  return {
    oldStart: match ? Number.parseInt(match[1] || "0", 10) : 0,
    newStart: match ? Number.parseInt(match[3] || "0", 10) : 0,
  }
}

function formatDiffLineNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : ""
}

function formatLineCount(value: number) {
  return `${value} ${value === 1 ? "line" : "lines"}`
}

function AgentBadge({ name }: { name: string }) {
  return (
    <span className="oc-agentBadge">
      <span className="oc-agentSwatch" style={{ background: agentColor(name) }} />
      <span className="oc-agentName">{name}</span>
    </span>
  )
}

function agentColor(name: string) {
  const palette = [
    "#9ece6a",
    "#6ab5ce",
    "#6a8cce",
    "#a06ace",
    "#ce6ab5",
    "#ce8c6a",
    "#ceb56a",
  ]
  let hash = 0
  for (const char of name) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0)
    hash |= 0
  }
  return palette[Math.abs(hash) % palette.length]
}

function relativeWorkspacePath(value: string, workspaceDir: string) {
  const path = normalizePath(value)
  const root = normalizePath(workspaceDir)
  if (!path) {
    return ""
  }
  if (root && path.startsWith(root.endsWith("/") ? root : `${root}/`)) {
    return path.slice(root.length + (root.endsWith("/") ? 0 : 1))
  }
  return path
}

function isMcpTool(tool: string) {
  return !!tool && !KNOWN_TOOLS.has(tool) && !tool.startsWith("lsp_")
}

function mcpDisplayTitle(part: Extract<MessagePart, { type: "tool" }>) {
  const input = recordValue(part.state?.input)
  const name = mcpName(part.tool)
  const args = mcpArgs(input)
  return args ? `${name} [${args}]` : name
}

function mcpName(tool: string) {
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

function displayWorkspacePath(value: string, workspaceDir: string) {
  const path = normalizePath(value)
  const root = normalizePath(workspaceDir)
  if (path && root && path === root) {
    return "."
  }
  return relativeWorkspacePath(value, workspaceDir)
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "")
}

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

function toolChildSessionId(part: Extract<MessagePart, { type: "tool" }>) {
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

function toolFiles(part: Extract<MessagePart, { type: "tool" }>): ToolFileSummary[] {
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

function toolWriteContent(part: Extract<MessagePart, { type: "tool" }>) {
  const input = recordValue(part.state?.input)
  return stringValue(input.content)
}

function toolEditDiff(part: Extract<MessagePart, { type: "tool" }>) {
  const metadata = recordValue(part.state?.metadata)
  return stringValue(metadata.diff)
}

function toolDiagnostics(part: Extract<MessagePart, { type: "tool" }>) {
  const metadata = recordValue(part.state?.metadata)
  const value = metadata.diagnostics
  if (!Array.isArray(value)) {
    return [] as string[]
  }
  return value
    .map((item) => formatDiagnostic(recordValue(item)))
    .filter(Boolean)
}

function lspRendersInline(part: Extract<MessagePart, { type: "tool" }>) {
  if (part.tool !== "lsp_diagnostics") {
    return false
  }
  return toolDiagnostics(part).length === 0 && toolTextBody(part).trim() === "No diagnostics found"
}

function renderLspToolTitle(part: Extract<MessagePart, { type: "tool" }>, workspaceDir = "") {
  if (part.tool !== "lsp_diagnostics") {
    return null
  }
  const input = recordValue(part.state?.input)
  const filePath = stringValue(input.filePath)
  const displayPath = relativeWorkspacePath(filePath, workspaceDir) || filePath
  const severity = stringValue(input.severity) || "all"
  return (
    <>
      {"lsp_diagnostics [filePath="}
      <FileRefText value={filePath} display={displayPath} />
      {`, severity=${severity}]`}
    </>
  )
}

function patchFiles(part: Extract<MessagePart, { type: "tool" }>) {
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

function patchSummary(type: string, additions: number, deletions: number, movePath: string, filePath: string) {
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

function formatDiagnostic(item: Record<string, unknown>) {
  const severity = stringValue(item.severity) || stringValue(item.level)
  const message = stringValue(item.message) || stringValue(item.text)
  const line = numberValue(item.line) || numberValue(item.lineNumber)
  const col = numberValue(item.column) || numberValue(item.col)
  const head = [severity, line > 0 ? `L${line}` : "", col > 0 ? `C${col}` : ""].filter(Boolean).join(" ")
  return [head, message].filter(Boolean).join(" · ")
}

function codeLanguage(filePath?: string) {
  const value = stringValue(filePath)
  const normalized = value.toLowerCase()
  if (normalized.endsWith(".ts")) return "typescript"
  if (normalized.endsWith(".tsx")) return "tsx"
  if (normalized.endsWith(".js")) return "javascript"
  if (normalized.endsWith(".jsx")) return "jsx"
  if (normalized.endsWith(".json")) return "json"
  if (normalized.endsWith(".css")) return "css"
  if (normalized.endsWith(".html")) return "html"
  if (normalized.endsWith(".md")) return "markdown"
  if (normalized.endsWith(".sh")) return "bash"
  if (normalized.endsWith(".yml") || normalized.endsWith(".yaml")) return "yaml"
  return ""
}

function highlightCode(value: string, language: string) {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(value, { language }).value
  }
  return hljs.highlightAuto(value).value
}

function renderMarkdownCodeWindow(value: string, language: string) {
  const lang = normalizeCodeLanguage(language)
  const title = lang ? capitalize(lang) : "Code"
  const lines = codeWindowRows(value, lang)
  const gutter = codeWindowGutter(value)
  return [
    '<section class="oc-outputWindow oc-outputWindow-markdownCode">',
    '<div class="oc-outputWindowHead">',
    '<div class="oc-outputWindowTitleRow">',
    '<span class="oc-outputWindowAction">Code</span>',
    `<span class="oc-outputWindowTitle">${escapeHtml(title)}</span>`,
    '</div>',
    '<button type="button" class="oc-outputWindowCopyBtn" aria-label="Copy code"',
    ` data-copy-code="${escapeAttribute(value)}">`,
    '<svg class="oc-outputWindowCopyIcon" viewBox="0 0 16 16" aria-hidden="true">',
    '<rect x="5" y="3" width="8" height="10" rx="1.5" />',
    '<path d="M3.5 10.5V5.5c0-.828.672-1.5 1.5-1.5h5" />',
    '</svg>',
    '<span class="oc-outputWindowCopyTip">Copied!</span>',
    '</button>',
    '</div>',
    '<div class="oc-outputWindowBody">',
    '<div class="oc-outputWindowBodyInner">',
    `<pre class="oc-codeWindowBody" style="--oc-codeWindow-gutter:${gutter}"><code class="oc-codeWindowText">`,
    lines,
    '</code></pre>',
    '</div>',
    '</div>',
    '</section>',
  ].join("")
}

function codeWindowRows(value: string, language: string) {
  const rows = normalizedLines(value)
  return rows.map((line, index) => {
    const html = highlightCode(line, language)
    return [
      '<span class="oc-codeWindowLine">',
      `<span class="oc-codeWindowLineNo">${index + 1}</span>`,
      `<span class="oc-codeWindowLineText hljs${language ? ` language-${escapeAttribute(language)}` : ""}">${html || " "}</span>`,
      '</span>',
    ].join("")
  }).join("")
}

function normalizeCodeLanguage(value: string) {
  const lang = value.trim().toLowerCase().split(/\s+/)[0] || ""
  if (!lang) {
    return ""
  }
  if (hljs.getLanguage(lang)) {
    return lang
  }
  if (lang === "ts") return "typescript"
  if (lang === "js") return "javascript"
  if (lang === "md") return "markdown"
  if (lang === "sh" || lang === "shell") return "bash"
  if (lang === "yml") return "yaml"
  return ""
}

function copyText(value: string) {
  const clipboard = window.navigator?.clipboard
  if (clipboard?.writeText) {
    return clipboard.writeText(value)
  }
  const input = document.createElement("textarea")
  input.value = value
  input.setAttribute("readonly", "true")
  input.style.position = "absolute"
  input.style.left = "-9999px"
  document.body.appendChild(input)
  input.select()
  document.execCommand("copy")
  document.body.removeChild(input)
  return Promise.resolve()
}

function normalizedLines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
}

function codeWindowGutter(value: string) {
  return `calc(${Math.max(String(normalizedLines(value).length).length, 2)}ch + 12px)`
}

function parseFileReference(value: string) {
  const input = value.trim()
  if (!input || isExternalTarget(input)) {
    return undefined
  }

  const lineMatch = input.match(/:(\d+)$/)
  const filePath = lineMatch ? input.slice(0, -lineMatch[0].length) : input
  const normalized = normalizeFileReference(filePath)
  if (!normalized || !looksLikeFilePath(normalized)) {
    return undefined
  }

  return {
    key: fileRefKey(normalized),
    filePath: normalized,
    line: lineMatch ? Number.parseInt(lineMatch[1] || "", 10) : undefined,
  }
}

function FileRefText({
  value,
  display,
  tone = "default",
}: {
  value: string
  display?: string
  tone?: "default" | "muted"
}) {
  const fileRef = React.useMemo(() => parseFileReference(value), [value])
  const [exists, setExists] = React.useState(() => fileRef ? fileRefStatus.get(fileRef.key) === true : false)

  React.useEffect(() => {
    if (!fileRef) {
      setExists(false)
      return
    }

    setExists(fileRefStatus.get(fileRef.key) === true)
    if (!fileRefStatus.has(fileRef.key)) {
      vscode.postMessage({
        type: "resolveFileRefs",
        refs: [{ key: fileRef.key, filePath: fileRef.filePath }],
      })
    }

    const sync = () => {
      setExists(fileRefStatus.get(fileRef.key) === true)
    }

    window.addEventListener("oc-file-refs-updated", sync)
    return () => window.removeEventListener("oc-file-refs-updated", sync)
  }, [fileRef])

  if (!fileRef) {
    return <>{display || value}</>
  }

  return (
    <span
      className={[
        "oc-fileRefText",
        exists ? "is-openable" : "",
        tone === "muted" ? "is-muted" : "",
      ].filter(Boolean).join(" ")}
      onClick={(event) => {
        if (!exists || (!event.metaKey && !event.ctrlKey)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        vscode.postMessage({
          type: "openFile",
          filePath: fileRef.filePath,
          line: fileRef.line,
        })
      }}
    >
      {display || value}
    </span>
  )
}

function fileRefKey(value: string) {
  return value.startsWith("file://") ? value : value.replace(/\\/g, "/")
}

function normalizeFileReference(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed.startsWith("file://")) {
    return trimmed
  }
  return trimmed.replace(/^['"]+|['"]+$/g, "")
}

function looksLikeFilePath(value: string) {
  return value.startsWith("file://")
    || /^[A-Za-z]:[\\/]/.test(value)
    || /^\.{1,2}[\\/]/.test(value)
    || value.startsWith("/")
    || value.includes("/")
    || value.includes("\\")
    || /^[^\s\\/]+\.[^\s\\/]+$/.test(value)
}

function isExternalTarget(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("file://")
}

function syncMarkdownFileRefs(root: HTMLElement) {
  const refs = new Map<string, string>()

  for (const link of Array.from(root.querySelectorAll("a"))) {
    const fileRef = parseFileReference(link.getAttribute("href") || "")
    if (!fileRef) {
      link.removeAttribute("data-file-ref")
      continue
    }
    link.setAttribute("data-file-ref", fileRef.key)
    refs.set(fileRef.key, fileRef.filePath)
  }

  for (const inlineCode of Array.from(root.querySelectorAll(".oc-inlineCode"))) {
    if (!(inlineCode instanceof HTMLElement)) {
      continue
    }
    const fileRef = parseFileReference(inlineCode.textContent || "")
    if (!fileRef) {
      inlineCode.removeAttribute("data-file-ref")
      inlineCode.classList.remove("oc-inlineCode-file")
      continue
    }
    inlineCode.setAttribute("data-file-ref", fileRef.key)
    inlineCode.classList.toggle("oc-inlineCode-file", !!fileRefStatus.get(fileRef.key))
    refs.set(fileRef.key, fileRef.filePath)
  }

  const unresolved = [...refs.entries()]
    .filter(([key]) => !fileRefStatus.has(key))
    .map(([key, filePath]) => ({ key, filePath }))

  if (unresolved.length > 0) {
    vscode.postMessage({
      type: "resolveFileRefs",
      refs: unresolved,
    })
  }
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function toolTodos(part: Extract<MessagePart, { type: "tool" }>) {
  return toolTodosFromMetadata(recordValue(part.state?.metadata))
}

function toolTodosFromMetadata(metadata: Record<string, unknown>) {
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

function extractUrls(value: string) {
  return value.match(/https?:\/\/[^\s)]+/g) || []
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)]
}

function todoMarker(status: string) {
  if (status === "completed") {
    return "[✓]"
  }
  if (status === "in_progress") {
    return "[•]"
  }
  return "[ ]"
}

function parentDir(value: string) {
  if (!value) {
    return ""
  }
  const normalized = value.replace(/\\/g, "/")
  const index = normalized.lastIndexOf("/")
  return index > 0 ? normalized.slice(0, index) : ""
}

function diffSummary(value: string) {
  if (!value) {
    return "modified"
  }
  const additions = (value.match(/^\+/gm) || []).length
  const deletions = (value.match(/^-/gm) || []).length
  if (!additions && !deletions) {
    return "modified"
  }
  return `+${additions} / -${deletions}`
}

function partTitle(part: MessagePart) {
  if (part.type === "text") {
    return part.synthetic ? "context" : "text"
  }
  if (part.type === "reasoning") {
    return "reasoning"
  }
  if (part.type === "tool") {
    return part.tool || "tool"
  }
  if (part.type === "file") {
    return part.filename || "attachment"
  }
  if (part.type === "step-start") {
    return "step started"
  }
  if (part.type === "step-finish") {
    return "step finished"
  }
  if (part.type === "snapshot") {
    return "snapshot"
  }
  if (part.type === "patch") {
    return "patch"
  }
  if (part.type === "agent") {
    return "agent"
  }
  if (part.type === "retry") {
    return "retry"
  }
  if (part.type === "compaction") {
    return "compaction"
  }
  if (part.type === "subtask") {
    return "subtask"
  }
  return part.type || "part"
}

function partMeta(part: MessagePart) {
  if (part.type === "tool") {
    return part.state?.status || "pending"
  }
  if (part.type === "file") {
    return part.mime || "file"
  }
  return ""
}

function isDividerPart(part: MessagePart) {
  return part.type === "retry"
    || part.type === "agent"
    || part.type === "subtask"
    || part.type === "step-start"
}

function dividerText(part: MessagePart) {
  if (part.type === "retry") {
    return retryText((part as Record<string, unknown>).error) || "Retry"
  }

  if (part.type === "agent") {
    return textValue((part as Record<string, unknown>).name) || "Agent task"
  }

  if (part.type === "subtask") {
    return textValue((part as Record<string, unknown>).description) || textValue((part as Record<string, unknown>).prompt) || "Subtask"
  }

  if (part.type === "step-start") {
    const model = textValue((part as Record<string, unknown>).model)
    return model ? `Step started · ${model}` : "Step started"
  }

  return partTitle(part)
}

function CompactionDivider() {
  return (
    <div className="oc-dividerPart oc-dividerPart-compaction">
      <span className="oc-dividerCompactionLine" />
      <span className="oc-dividerText">Compaction</span>
    </div>
  )
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function cleanReasoning(value: string) {
  return value.replace(/\[REDACTED\]/g, "").trim()
}

function fileLabel(value: string) {
  const normalized = value.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).pop() || value
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function questionInfoList(value: unknown) {
  if (!Array.isArray(recordValue(value).questions)) {
    return [] as QuestionInfo[]
  }
  return recordValue(value).questions as QuestionInfo[]
}

function questionAnswerGroups(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[][]
  }
  return value.map((item) => stringList(item))
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function recordValue(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function capitalize(value: string) {
  if (!value) {
    return ""
  }
  return value[0].toUpperCase() + value.slice(1)
}

function formatToolName(value: string) {
  if (!value) {
    return "Tool"
  }
  if (value === "lsp") {
    return "LSP"
  }
  return value
    .split("_")
    .map((part) => part.toLowerCase() === "lsp" ? "LSP" : capitalize(part))
    .join(" ")
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

type StatusTone = "green" | "orange" | "red" | "gray"

type StatusItem = {
  name: string
  tone: StatusTone
  value: string
  action?: "connect" | "disconnect" | "reconnect"
  actionLabel?: string
}

function composerIdentity(state: AppState) {
  const lastUser = lastUserMessage(state.snapshot.messages)
  const fallback = fallbackModelRef(state.snapshot.providers, state.snapshot.providerDefault)
  return {
    agent: lastUser?.info.agent?.trim() || "main",
    model: displayModelRef(lastUser?.info.model, state.snapshot.providers) || displayModelRef(fallback, state.snapshot.providers) || "",
    provider: displayProviderRef(lastUser?.info.model, state.snapshot.providers) || displayProviderRef(fallback, state.snapshot.providers) || "",
  }
}

function composerMetrics(state: AppState) {
  const context = contextUsage(state.snapshot.messages, state.snapshot.providers)
  return {
    tokens: context?.tokens ?? 0,
    percent: context?.percent,
    cost: sessionCost(state.snapshot.messages),
  }
}

function contextUsage(messages: SessionMessage[], providers: ProviderInfo[]) {
  const info = lastAssistantWithOutput(messages)?.info
  const tokens = totalTokens(info)
  if (!info || tokens <= 0) {
    return undefined
  }

  const limit = modelContextLimit(info, providers)
  return {
    tokens,
    percent: typeof limit === "number" && limit > 0 ? Math.round(tokens / limit * 100) : undefined,
  }
}

function sessionCost(messages: SessionMessage[]) {
  return messages.reduce((acc, item) => item.info.role === "assistant" ? acc + (item.info.cost ?? 0) : acc, 0)
}

function totalTokens(info?: MessageInfo) {
  const tokens = info?.tokens
  if (!tokens) {
    return 0
  }
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

function modelContextLimit(info: MessageInfo | undefined, providers: ProviderInfo[]) {
  const providerID = info?.model?.providerID?.trim()
  const modelID = info?.model?.modelID?.trim()
  if (!providerID || !modelID) {
    return undefined
  }

  const provider = providerById(providers, providerID)
  const model = providerModelById(provider, modelID)
  return model?.limit?.context
}

function providerById(providers: ProviderInfo[], providerID?: string) {
  return providers.find((item) => item.id === providerID)
}

function displayModelRef(model: MessageInfo["model"] | undefined, providers: ProviderInfo[]) {
  const providerID = model?.providerID?.trim()
  const modelID = model?.modelID?.trim()
  if (!modelID) {
    return ""
  }
  const provider = providerById(providers, providerID)
  return providerModelById(provider, modelID)?.name || modelID
}

function displayProviderRef(model: MessageInfo["model"] | undefined, providers: ProviderInfo[]) {
  const providerID = model?.providerID?.trim()
  if (!providerID) {
    return ""
  }
  return providerById(providers, providerID)?.name || providerID
}

function fallbackModelRef(providers: ProviderInfo[], defaults?: Record<string, string>) {
  const provider = providers[0]
  if (!provider?.id) {
    return undefined
  }

  const modelID = defaults?.[provider.id]?.trim()
  const model = modelID ? providerModelById(provider, modelID) : firstProviderModel(provider)
  if (!provider?.id || !model?.id) {
    return undefined
  }

  return {
    providerID: provider.id,
    modelID: model.id,
  }
}

function lastUserMessage(messages: SessionMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.info.role === "user") {
      return messages[i]
    }
  }
}

function providerModelById(provider: ProviderInfo | undefined, modelID: string) {
  if (!provider?.models || !modelID) {
    return undefined
  }
  return provider.models[modelID]
}

function firstProviderModel(provider: ProviderInfo | undefined) {
  if (!provider?.models) {
    return undefined
  }
  return Object.values(provider.models)[0]
}

function lastAssistantWithOutput(messages: SessionMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i]
    if (item?.info.role === "assistant" && (item.info.tokens?.output ?? 0) > 0) {
      return item
    }
  }
}

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`
}

function overallMcpStatus(statuses: Record<string, McpStatus>) {
  const items = Object.entries(statuses)
    .map(([name, status]) => statusItemForMcp(name, status))

  if (items.length === 0) {
    return { tone: "gray" as const, items: [] }
  }

  const ok = items.filter((item) => item.tone === "green").length
  const warn = items.filter((item) => item.tone === "orange").length
  const err = items.filter((item) => item.tone === "red").length
  if (ok === items.length) {
    return { tone: "green" as const, items }
  }
  if (err > 0 && ok === 0 && warn === 0) {
    return { tone: "red" as const, items }
  }
  return { tone: "orange" as const, items }
}

function overallLspStatus(statuses: LspStatus[]) {
  const items = statuses.map(statusItemForLsp)
  if (items.length === 0) {
    return { tone: "gray" as const, items: [] }
  }

  const ok = items.filter((item) => item.tone === "green").length
  if (ok === items.length) {
    return { tone: "green" as const, items }
  }
  if (ok === 0) {
    return { tone: "red" as const, items }
  }
  return { tone: "orange" as const, items }
}

function statusItemForMcp(name: string, status: McpStatus): StatusItem {
  if (status.status === "connected") {
    return { name, tone: "green", value: "Connected", action: "disconnect", actionLabel: `Disconnect ${name}` }
  }
  if (status.status === "disabled") {
    return { name, tone: "gray", value: "Disabled", action: "connect", actionLabel: `Connect ${name}` }
  }
  if (status.status === "needs_auth") {
    return { name, tone: "orange", value: "Needs authentication", action: "reconnect", actionLabel: `Reconnect ${name}` }
  }
  if (status.status === "needs_client_registration") {
    return { name, tone: "red", value: status.error || "Client registration required", action: "reconnect", actionLabel: `Reconnect ${name}` }
  }
  return { name, tone: "red", value: status.error || "Error", action: "reconnect", actionLabel: `Reconnect ${name}` }
}

function statusItemForLsp(status: LspStatus): StatusItem {
  return {
    name: status.name,
    tone: status.status === "connected" ? "green" : "red",
    value: status.root || ".",
  }
}

function retryText(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  if (value && typeof value === "object") {
    const maybe = value as { message?: unknown }
    if (typeof maybe.message === "string") {
      return maybe.message
    }
  }

  return "Retry requested."
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
