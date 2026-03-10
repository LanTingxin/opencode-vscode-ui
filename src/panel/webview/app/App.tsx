import React from "react"
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
import { CodeBlock as BaseCodeBlock } from "../renderers/CodeBlock"
import { DiffBlock as BaseDiffBlock, DiffWindowBody as BaseDiffWindowBody, diffOutputLineCount } from "../renderers/DiffBlock"
import { FileRefText as BaseFileRefText } from "../renderers/FileRefText"
import { MarkdownBlock as BaseMarkdownBlock } from "../renderers/MarkdownBlock"
import { OutputWindow as BaseOutputWindow, normalizedLineCount } from "../renderers/OutputWindow"
import { ToolFilesPanel as BaseToolFilesPanel } from "../tools/ToolFilesPanel"
import { ToolLinksPanel as BaseToolLinksPanel } from "../tools/ToolLinksPanel"
import { ToolLspPanel as BaseToolLspPanel } from "../tools/ToolLspPanel"
import { ToolApplyPatchPanel as BaseToolApplyPatchPanel } from "../tools/ToolApplyPatchPanel"
import { ToolEditPanel as BaseToolEditPanel } from "../tools/ToolEditPanel"
import { ToolQuestionPanel as BaseToolQuestionPanel } from "../tools/ToolQuestionPanel"
import { ToolTextPanel as BaseToolTextPanel } from "../tools/ToolTextPanel"
import { ToolTodosPanel as BaseToolTodosPanel } from "../tools/ToolTodosPanel"
import { ToolWritePanel as BaseToolWritePanel } from "../tools/ToolWritePanel"
import type { ToolDetails, ToolFileSummary } from "../tools/types"

declare global {
  interface Window {
    __OPENCODE_INITIAL_STATE__?: SessionBootstrap["sessionRef"] | null
  }
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()
const initialRef = window.__OPENCODE_INITIAL_STATE__ ?? null
const fileRefStatus = new Map<string, boolean>()

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
  return <BaseToolTextPanel ToolFallbackText={ToolFallbackText} ToolStatus={ToolStatus} active={active} defaultToolExpanded={defaultToolExpanded} part={part} toolDetails={toolDetails} toolLabel={toolLabel} toolTextBody={toolTextBody} />
}

function ToolLspPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  return <BaseToolLspPanel DiagnosticsList={DiagnosticsList} ToolStatus={ToolStatus} active={active} part={part} renderLspToolTitle={renderLspToolTitle} toolDetails={toolDetails} toolDiagnostics={toolDiagnostics} toolLabel={toolLabel} toolTextBody={toolTextBody} />
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
  return <BaseToolLinksPanel ToolStatus={ToolStatus} active={active} defaultToolExpanded={defaultToolExpanded} extractUrls={extractUrls} part={part} toolDetails={toolDetails} toolLabel={toolLabel} uniqueStrings={uniqueStrings} />
}

function ToolFilesPanel({ part, active = false, diffMode = "unified" }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) {
  return <BaseToolFilesPanel ToolApplyPatchPanel={ToolApplyPatchPanel} ToolEditPanel={ToolEditPanel} ToolFallbackText={ToolFallbackText} ToolStatus={ToolStatus} ToolWritePanel={ToolWritePanel} active={active} defaultToolExpanded={defaultToolExpanded} diffMode={diffMode} part={part} toolDetails={toolDetails} toolFiles={toolFiles} toolLabel={toolLabel} toolTextBody={toolTextBody} />
}

function ToolWritePanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  return <BaseToolWritePanel CodeBlock={CodeBlock} DiagnosticsList={DiagnosticsList} ToolFallbackText={ToolFallbackText} ToolStatus={ToolStatus} active={active} defaultToolExpanded={defaultToolExpanded} part={part} toolDetails={toolDetails} toolDiagnostics={toolDiagnostics} toolLabel={toolLabel} toolTextBody={toolTextBody} toolWriteContent={toolWriteContent} />
}

function ToolEditPanel({ part, active = false, diffMode = "unified" }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) {
  return <BaseToolEditPanel DiagnosticsList={DiagnosticsList} DiffBlock={DiffBlock} ToolFallbackText={ToolFallbackText} ToolStatus={ToolStatus} active={active} defaultToolExpanded={defaultToolExpanded} diffMode={diffMode} part={part} toolDetails={toolDetails} toolDiagnostics={toolDiagnostics} toolEditDiff={toolEditDiff} toolLabel={toolLabel} toolTextBody={toolTextBody} />
}

function ToolApplyPatchPanel({ part, active = false, diffMode = "unified" }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean; diffMode?: "unified" | "split" }) {
  return <BaseToolApplyPatchPanel DiagnosticsList={DiagnosticsList} DiffWindowBody={DiffWindowBody} FileRefText={FileRefText} OutputWindow={OutputWindow} ToolFallbackText={ToolFallbackText} ToolStatus={ToolStatus} active={active} diffMode={diffMode} diffOutputLineCount={diffOutputLineCount} normalizedLineCount={normalizedLineCount} part={part} patchFiles={patchFiles} toolDetails={toolDetails} toolDiagnostics={toolDiagnostics} toolLabel={toolLabel} toolTextBody={toolTextBody} />
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
  return <BaseCodeBlock value={value} filePath={filePath} />
}

function DiffBlock({ value, mode = "unified" }: { value: string; mode?: "unified" | "split" }) {
  return <BaseDiffBlock value={value} mode={mode} />
}

function DiffWindowBody({ value, mode = "unified", filePath }: { value: string; mode?: "unified" | "split"; filePath?: string }) {
  return <BaseDiffWindowBody value={value} mode={mode} filePath={filePath} />
}

function DiagnosticsList({ items, tone = "warning" }: { items: string[]; tone?: "warning" | "error" }) {
  return (
    <div className={`oc-diagnosticsList is-${tone}`}>
      {items.map((item) => <div key={item} className={`oc-diagnosticItem is-${tone}`}>{item}</div>)}
    </div>
  )
}

function ToolTodosPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  return <BaseToolTodosPanel ToolStatus={ToolStatus} active={active} part={part} todoMarker={todoMarker} toolDetails={toolDetails} toolTodos={toolTodos} />
}

function ToolQuestionPanel({ part, active = false }: { part: Extract<MessagePart, { type: "tool" }>; active?: boolean }) {
  return <BaseToolQuestionPanel QuestionBlock={QuestionBlock} ToolStatus={ToolStatus} active={active} part={part} questionAnswerGroups={questionAnswerGroups} questionInfoList={questionInfoList} toolDetails={toolDetails} />
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
  return <BaseMarkdownBlock fileRefStatus={fileRefStatus} onOpenFile={(filePath, line) => vscode.postMessage({ type: "openFile", filePath, line })} onResolveFileRefs={(refs) => vscode.postMessage({ type: "resolveFileRefs", refs })} content={content} className={className} />
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

function OutputWindow({ action, title, running = false, lineCount, className = "", children }: { action: string; title: React.ReactNode; running?: boolean; lineCount: number; className?: string; children: React.ReactNode }) {
  return <BaseOutputWindow ToolStatus={ToolStatus} action={action} title={title} running={running} lineCount={lineCount} className={className}>{children}</BaseOutputWindow>
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

function FileRefText({ value, display, tone = "default" }: { value: string; display?: string; tone?: "default" | "muted" }) {
  return <BaseFileRefText fileRefStatus={fileRefStatus} onOpenFile={(filePath, line) => vscode.postMessage({ type: "openFile", filePath, line })} onResolveFileRefs={(refs) => vscode.postMessage({ type: "resolveFileRefs", refs })} value={value} display={display} tone={tone} />
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
