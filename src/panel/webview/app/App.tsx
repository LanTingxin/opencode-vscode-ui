import React from "react"
import type { ComposerPathResult, SessionBootstrap } from "../../../bridge/types"
import type { QuestionRequest } from "../../../core/sdk"
import { ChildMessagesContext, ChildSessionsContext, WorkspaceDirContext } from "./contexts"
import { answerKey, PermissionDock, QuestionDock, RetryStatus, SessionNav, SubagentNotice } from "./docks"
import { createInitialState, type AppState, type ComposerEditorPart, type VsCodeApi } from "./state"
import { Timeline } from "./timeline"
import { AgentBadge, CompactionDivider, EmptyState, MarkdownBlock, PartView, WebviewBindingsProvider } from "./webview-bindings"
import { ensureComposerCursorVisible, resizeComposer, useComposerResize } from "../hooks/useComposer"
import { useComposerAutocomplete, type ComposerAutocompleteItem, type ComposerAutocompleteState } from "../hooks/useComposerAutocomplete"
import { useHostMessages } from "../hooks/useHostMessages"
import { useModifierState } from "../hooks/useModifierState"
import { useTimelineScroll } from "../hooks/useTimelineScroll"
import { agentColor, composerIdentity, composerMetrics, composerSelection, formatUsd, isSessionRunning, overallLspStatus, overallMcpStatus, sessionTitle, type StatusItem, type StatusTone } from "../lib/session-meta"
import { buildComposerSubmitParts, composerAgentOverride } from "./composer-mentions"
import { composerMentions as mentionsFromParts, composerPartsEqual, composerText, deleteStructuredRange, emptyComposerParts, ensureTextPart, replaceRangeWithMention, replaceRangeWithText } from "./composer-editor"
import { getSelectionOffsets, parseComposerEditor, renderComposerEditor, setCursorPosition } from "./composer-editor-dom"

declare global {
  interface Window {
    __OPENCODE_INITIAL_STATE__?: SessionBootstrap["sessionRef"] | null
  }
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()
const initialRef = window.__OPENCODE_INITIAL_STATE__ ?? null
const fileRefStatus = new Map<string, boolean>()
const FILE_SEARCH_DEBOUNCE_MS = 180

if (initialRef) {
  vscode.setState(initialRef)
}

export function App() {
  const [state, setState] = React.useState(() => createInitialState(initialRef))
  const [composing, setComposing] = React.useState(false)
  const [composerFocused, setComposerFocused] = React.useState(false)
  const [pendingMcpActions, setPendingMcpActions] = React.useState<Record<string, boolean>>({})
  const [fileResults, setFileResults] = React.useState<ComposerPathResult[]>([])
  const [fileSearch, setFileSearch] = React.useState<{ status: "idle" | "searching" | "done"; query: string }>({ status: "idle", query: "" })
  const timelineRef = React.useRef<HTMLDivElement | null>(null)
  const composerRef = React.useRef<HTMLDivElement | null>(null)
  const composerCursorRef = React.useRef<number | null>(null)
  const searchRef = React.useRef<{ requestID: string; query: string } | null>(null)
  const composerMenuItems = React.useMemo(() => buildComposerMenuItems(state, fileResults), [fileResults, state])
  const composerAutocomplete = useComposerAutocomplete(composerMenuItems)

  const blocked = state.snapshot.permissions.length > 0 || state.snapshot.questions.length > 0
  const isChildSession = !!state.bootstrap.session?.parentID
  const firstPermission = state.snapshot.permissions[0]
  const firstQuestion = state.snapshot.questions[0]

  useHostMessages({
    fileRefStatus,
    onFileSearchResults: (payload) => {
      if (!searchRef.current || payload.requestID !== searchRef.current.requestID) {
        return
      }
      if (payload.query !== searchRef.current.query) {
        return
      }
      setFileResults(payload.results)
      setFileSearch({ status: "done", query: payload.query })
    },
    setPendingMcpActions,
    setState,
    vscode,
  })
  useComposerResize(composerRef, state.draft)
  useTimelineScroll(timelineRef, [state.snapshot.messages, state.snapshot.submitting, state.snapshot.permissions, state.snapshot.questions])
  useModifierState()

  React.useEffect(() => {
    document.title = `OpenCode: ${sessionTitle(state.bootstrap)}`
  }, [state.bootstrap])

  React.useEffect(() => {
    if (composerAutocomplete.state?.trigger !== "mention") {
      searchRef.current = null
      setFileResults([])
      setFileSearch({ status: "idle", query: "" })
      return
    }

    const query = composerAutocomplete.state.query.trim()

    const requestID = `file-search:${Date.now()}:${query}`
    searchRef.current = { requestID, query }
    setFileSearch({ status: "searching", query })
    const timer = window.setTimeout(() => {
      vscode.postMessage({
        type: "searchFiles",
        requestID,
        query,
      })
    }, FILE_SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [composerAutocomplete.state])

  const setComposerState = React.useCallback((parts: ComposerEditorPart[], error = "") => {
    const composerParts = ensureTextPart(parts)
    const draft = composerText(composerParts)
    const composerMentions = mentionsFromParts(composerParts)
    setState((current) => ({
      ...current,
      draft,
      composerParts,
      composerMentions,
      composerAgentOverride: composerAgentOverride(composerMentions),
      error,
    }))
    return { draft, composerParts, composerMentions }
  }, [])

  const syncComposerInput = React.useCallback((value: string, start: number | null | undefined, end: number | null | undefined) => {
    composerAutocomplete.sync(value, start, end)
  }, [composerAutocomplete])

  const restoreComposerCursor = React.useCallback((value: string, cursor: number) => {
    composerCursorRef.current = cursor
    window.setTimeout(() => {
      const input = composerRef.current
      if (!input) {
        return
      }
      input.focus()
      setCursorPosition(input, cursor)
      resizeComposer(input)
      ensureComposerCursorVisible(input)
      syncComposerInput(value, cursor, cursor)
    }, 0)
  }, [syncComposerInput])

  React.useLayoutEffect(() => {
    const input = composerRef.current
    if (!input) {
      return
    }
    const next = ensureTextPart(state.composerParts)
    const current = ensureTextPart(parseComposerEditor(input))
    if (!composerPartsEqual(current, next)) {
      renderComposerEditor(input, next)
    }
    if (typeof composerCursorRef.current === "number") {
      setCursorPosition(input, composerCursorRef.current)
      composerCursorRef.current = null
    }
    resizeComposer(input)
    ensureComposerCursorVisible(input)
  }, [state.composerParts])

  const submit = React.useCallback(() => {
    if (!state.draft.trim() || blocked) {
      return
    }

    const selection = composerSelection({ ...state.snapshot, composerAgentOverride: state.composerAgentOverride })
    const parts = buildComposerSubmitParts(state.draft, state.composerMentions)
    vscode.postMessage({
      type: "submit",
      text: state.draft,
      parts,
      agent: selection.agent,
      model: selection.model,
    })
    setState((current) => ({
      ...current,
      draft: "",
      composerParts: emptyComposerParts(),
      composerMentions: [],
      composerAgentOverride: undefined,
      error: "",
    }))
  }, [blocked, state.composerAgentOverride, state.composerMentions, state.draft, state.snapshot])

  const acceptComposerAutocomplete = React.useCallback((item: ComposerAutocompleteItem) => {
    if (item.kind === "action") {
      if (item.id === "slash-clear") {
        setState((current) => ({ ...current, draft: "", composerParts: emptyComposerParts(), composerMentions: [], composerAgentOverride: undefined, error: "" }))
        composerAutocomplete.close()
        return
      }

      if (item.id === "slash-reset-agent") {
        setState((current) => ({
          ...current,
          draft: "",
          composerParts: emptyComposerParts(),
          composerMentions: [],
          composerAgentOverride: undefined,
          error: "",
        }))
        composerAutocomplete.close()
        return
      }

      if (item.id === "slash-refresh") {
        vscode.postMessage({ type: "composerAction", action: "refreshSession" })
        composerAutocomplete.close()
        return
      }
    }

    if (item.mention) {
      const range = composerAutocomplete.state
      if (!range) {
        composerAutocomplete.close()
        return
      }

      const next = replaceRangeWithMention(state.composerParts, range.start, range.end, item.mention)
      const result = setComposerState(next.parts, "")
      composerAutocomplete.close()
      restoreComposerCursor(result.draft, next.cursor)
    }
  }, [composerAutocomplete, restoreComposerCursor, setComposerState, state.composerParts])

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
          <WebviewBindingsProvider fileRefStatus={fileRefStatus} vscode={vscode}>
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
              <div className="oc-composerBody">
                <div className="oc-composerInputWrap">
                  <div
                    ref={composerRef}
                    className="oc-composerInput"
                    role="textbox"
                    aria-multiline="true"
                    aria-label="Ask OpenCode to inspect explain or change this workspace"
                    contentEditable={state.bootstrap.status === "ready" && !blocked}
                    suppressContentEditableWarning
                    spellCheck
                    onInput={(event) => {
                      const composerParts = ensureTextPart(parseComposerEditor(event.currentTarget))
                      const draft = composerText(composerParts)
                      const composerMentions = mentionsFromParts(composerParts)
                      const selection = getSelectionOffsets(event.currentTarget)
                      syncComposerInput(draft, selection.start, selection.end)
                      setState((current) => ({
                        ...current,
                        draft,
                        composerParts,
                        composerMentions,
                        composerAgentOverride: composerAgentOverride(composerMentions),
                      }))
                      resizeComposer(event.currentTarget)
                      ensureComposerCursorVisible(event.currentTarget)
                    }}
                    onPaste={(event) => {
                      const text = event.clipboardData.getData("text/plain")
                      if (!text) {
                        return
                      }
                      event.preventDefault()
                      const selection = getSelectionOffsets(event.currentTarget)
                      const next = replaceRangeWithText(state.composerParts, selection.start, selection.end, text.replace(/\r\n?/g, "\n"))
                      const result = setComposerState(next.parts, "")
                      restoreComposerCursor(result.draft, next.cursor)
                    }}
                    onKeyUp={() => {
                      const input = composerRef.current
                      if (!input) {
                        return
                      }
                      const selection = getSelectionOffsets(input)
                      ensureComposerCursorVisible(input)
                      syncComposerInput(state.draft, selection.start, selection.end)
                    }}
                    onMouseUp={() => {
                      const input = composerRef.current
                      if (!input) {
                        return
                      }
                      const selection = getSelectionOffsets(input)
                      ensureComposerCursorVisible(input)
                      syncComposerInput(state.draft, selection.start, selection.end)
                    }}
                    onFocus={() => {
                      setComposerFocused(true)
                      const input = composerRef.current
                      if (!input) {
                        return
                      }
                      const selection = getSelectionOffsets(input)
                      ensureComposerCursorVisible(input)
                      syncComposerInput(state.draft, selection.start, selection.end)
                    }}
                    onBlur={() => {
                      setComposerFocused(false)
                      setComposing(false)
                      window.setTimeout(() => composerAutocomplete.close(), 0)
                    }}
                    onCompositionStart={() => setComposing(true)}
                    onCompositionEnd={() => {
                      setComposing(false)
                      const input = composerRef.current
                      if (!input) {
                        return
                      }
                      const selection = getSelectionOffsets(input)
                      ensureComposerCursorVisible(input)
                      syncComposerInput(state.draft, selection.start, selection.end)
                    }}
                    onKeyDown={(event) => {
                      const native = event.nativeEvent as KeyboardEvent & { keyCode?: number }
                      const isImeComposing = native.isComposing || composing || native.keyCode === 229
                      const selection = getSelectionOffsets(event.currentTarget)

                      if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "Backspace" || event.key === "Delete")) {
                        const next = deleteStructuredRange(state.composerParts, selection.start, selection.end, event.key)
                        if (next) {
                          event.preventDefault()
                          const result = setComposerState(next.parts, "")
                          restoreComposerCursor(result.draft, next.cursor)
                          return
                        }
                      }

                      if (event.key === "Enter" && isImeComposing) {
                        return
                      }

                      if (event.key === "Enter" && !(event.metaKey || event.ctrlKey) && !composerAutocomplete.state) {
                        event.preventDefault()
                        const next = replaceRangeWithText(state.composerParts, selection.start, selection.end, "\n")
                        const result = setComposerState(next.parts, "")
                        restoreComposerCursor(result.draft, next.cursor)
                        return
                      }

                      if (composerAutocomplete.state) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault()
                          composerAutocomplete.move(1)
                          return
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault()
                          composerAutocomplete.move(-1)
                          return
                        }

                        if (event.key === "Escape") {
                          event.preventDefault()
                          composerAutocomplete.close()
                          return
                        }

                        if ((event.key === "Enter" && !(event.metaKey || event.ctrlKey)) || event.key === "Tab") {
                          event.preventDefault()
                          if (composerAutocomplete.currentItem) {
                            acceptComposerAutocomplete(composerAutocomplete.currentItem)
                          }
                          return
                        }
                      }

                      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
                        return
                      }
                      event.preventDefault()
                      submit()
                    }}
                  />
                  {!state.draft.trim() && !composerFocused ? <div className="oc-composerPlaceholder" aria-hidden="true">Ask OpenCode to inspect, explain, or change this workspace.</div> : null}
                </div>
                <ComposerInfo state={state} />
                {composerAutocomplete.state ? <ComposerAutocompletePopup state={composerAutocomplete.state} fileSearch={fileSearch} onSelect={acceptComposerAutocomplete} /> : null}
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
          </WebviewBindingsProvider>
        </ChildSessionsContext.Provider>
      </ChildMessagesContext.Provider>
    </WorkspaceDirContext.Provider>
  )
}

function ComposerAutocompletePopup({ state, fileSearch, onSelect }: { state: ComposerAutocompleteState; fileSearch: { status: "idle" | "searching" | "done"; query: string }; onSelect: (item: ComposerAutocompleteItem) => void }) {
  if (!state) {
    return null
  }

  const empty = popupEmptyText(state, fileSearch)
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([])

  React.useEffect(() => {
    const item = itemRefs.current[state.selectedIndex]
    item?.scrollIntoView({ block: "nearest" })
  }, [state.selectedIndex, state.items])

  return (
    <div className="oc-composerAutocomplete" role="listbox" aria-label={`${state.trigger} suggestions`}>
      <div className="oc-composerAutocompleteHeader">
        <span className="oc-composerAutocompleteTrigger">{state.trigger === "slash" ? "/" : "@"}</span>
        <span>{popupHeaderText(state, fileSearch)}</span>
      </div>
      <div className="oc-composerAutocompleteList">
        {state.items.length > 0 ? state.items.map((item, index) => renderComposerAutocompleteItem(state, item, index, itemRefs, onSelect)) : (
          <div className="oc-composerAutocompleteEmpty">{empty}</div>
        )}
      </div>
    </div>
  )
}

function renderComposerAutocompleteItem(state: ComposerAutocompleteState, item: ComposerAutocompleteItem, index: number, itemRefs: React.RefObject<Array<HTMLButtonElement | null>>, onSelect: (item: ComposerAutocompleteItem) => void) {
  return (
    <button
      type="button"
      key={item.id}
      ref={(node) => {
        itemRefs.current[index] = node
      }}
      className={`oc-composerAutocompleteItem${index === state.selectedIndex ? " is-active" : ""}`}
      role="option"
      aria-selected={index === state.selectedIndex}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(item)}
    >
      <div className="oc-composerAutocompleteLabelWrap">
        <div className="oc-composerAutocompleteLabel">{highlightAutocompleteText(item.label, item.match?.label)}</div>
        <div className="oc-composerAutocompleteDetail" title={item.detail}>{highlightAutocompleteText(item.detail, item.match?.detail)}</div>
        <div className="oc-composerAutocompleteKind">{item.kind}</div>
      </div>
    </button>
  )
}

function highlightAutocompleteText(value: string, indexes?: number[]) {
  if (!indexes || indexes.length === 0) {
    return value
  }

  const marks = new Set(indexes)
  return Array.from(value).map((char, index) => marks.has(index)
    ? <mark key={`${char}-${index}`} className="oc-composerAutocompleteMatch">{char}</mark>
    : <React.Fragment key={`${char}-${index}`}>{char}</React.Fragment>)
}

function popupHeaderText(state: ComposerAutocompleteState, fileSearch: { status: "idle" | "searching" | "done"; query: string }) {
  if (state.trigger === "slash") {
    return state.query ? `Filter: ${state.query}` : "Start typing to filter"
  }

  if (!state.query) {
    return "Agents and recent files"
  }

  if (fileSearch.status === "searching" && fileSearch.query === state.query) {
    return `Searching paths for \"${state.query}\"...`
  }

  return `Filter: ${state.query}`
}

function popupEmptyText(state: ComposerAutocompleteState, fileSearch: { status: "idle" | "searching" | "done"; query: string }) {
  if (state.trigger === "slash") {
    return state.query ? `No slash actions match \"${state.query}\"` : "Start typing to filter"
  }

  if (!state.query) {
    return "Type an agent name or pick a recent file"
  }

  if (fileSearch.status === "searching" && fileSearch.query === state.query) {
    return `Searching paths for \"${state.query}\"...`
  }

  return `No agents or paths match \"${state.query}\"`
}

function ComposerInfo({ state }: { state: AppState }) {
  const info = composerIdentity({ ...state.snapshot, composerAgentOverride: state.composerAgentOverride })
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

function buildComposerMenuItems(state: AppState, files: ComposerPathResult[]): ComposerAutocompleteItem[] {
  const slashItems: ComposerAutocompleteItem[] = [
    {
      id: "slash-refresh",
      label: "refresh",
      detail: "Ask the host to reload the current session snapshot.",
      keywords: ["reload", "snapshot", "panel", "host"],
      trigger: "slash",
      kind: "action",
    },
    {
      id: "slash-clear",
      label: "clear",
      detail: "Clear the current composer draft locally.",
      keywords: ["reset", "draft", "composer"],
      trigger: "slash",
      kind: "action",
    },
  ]

  if (state.composerAgentOverride) {
    slashItems.push({
      id: "slash-reset-agent",
      label: "reset-agent",
      detail: "Return the composer to the default agent selection.",
      keywords: ["agent", "default", "override"],
      trigger: "slash",
      kind: "action",
    })
  }

  const agentItems = state.snapshot.agents.map((agent) => ({
    id: `agent:${agent.name}`,
    label: agent.name,
    detail: agent.mode === "subagent" ? "Subagent" : agent.mode === "primary" ? "Primary agent" : "Agent",
    keywords: [agent.mode, agent.variant ?? ""].filter(Boolean),
    trigger: "mention" as const,
    kind: "agent" as const,
    mention: {
      type: "agent" as const,
      name: agent.name,
      content: `@${agent.name}`,
    },
  }))

  const fileItems = files.map((item) => ({
    id: `${item.source}:${item.kind}:${item.path}`,
    label: item.kind === "directory" ? `${item.path.split("/").filter(Boolean).pop() || item.path}/` : item.path.split("/").pop() || item.path,
    detail: item.path,
    keywords: item.path.split("/").filter(Boolean).concat(item.source, item.kind),
    trigger: "mention" as const,
    kind: item.source === "recent" ? "recent" as const : item.kind === "directory" ? "directory" as const : "file" as const,
    mention: {
      type: "file" as const,
      path: item.path,
      kind: item.kind,
      content: `@${item.path}`,
    },
  }))

  return [...slashItems, ...agentItems, ...fileItems]
}

function ComposerRunningIndicator({ running }: { running: boolean }) {
  return <span className={`oc-composerRunBar${running ? " is-running" : ""}`} aria-label="running" />
}

function ComposerMetrics({ state }: { state: AppState }) {
  const metrics = composerMetrics(state.snapshot)
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
