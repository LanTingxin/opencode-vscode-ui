import React from "react"
import type { ComposerPathResult, ComposerPromptPart, SessionBootstrap } from "../../../bridge/types"
import type { QuestionRequest, SessionMessage } from "../../../core/sdk"
import { ChildMessagesContext, ChildSessionsContext, WorkspaceDirContext } from "./contexts"
import { answerKey, PermissionDock, QuestionDock, RetryStatus, SessionNav, SubagentNotice } from "./docks"
import { createInitialState, persistableAppState, resolvePanelThemeValue, type AppState, type ComposerEditorPart, type ImageAttachment, type PersistedAppState, type VsCodeApi } from "./state"
import { Timeline } from "./timeline"
import { AgentBadge, CompactionDivider, EmptyState, FileRefText, MarkdownBlock, PartView, WebviewBindingsProvider } from "./webview-bindings"
import { ensureComposerCursorVisible, resizeComposer, useComposerResize } from "../hooks/useComposer"
import { filterItems, matchAutocomplete, useComposerAutocomplete, type ComposerAutocompleteItem, type ComposerAutocompleteState } from "../hooks/useComposerAutocomplete"
import { useHostMessages } from "../hooks/useHostMessages"
import { useModifierState } from "../hooks/useModifierState"
import { useTimelineScroll } from "../hooks/useTimelineScroll"
import { formatComposerFileContent, parseComposerFileQuery } from "../lib/composer-file-selection"
import { agentColorClass, composerIdentity, composerMetrics, composerSelection, cycleModelVariant, formatUsd, isSessionRunning, lastUserSelection, modelKey, modelVariants, overallLspStatus, overallMcpStatus, pushRecentModel, sessionTitle, toggleFavoriteModel } from "../lib/session-meta"
import { buildComposerSubmitParts, composerMentionAgentOverride } from "./composer-mentions"
import { ComposerFooter, ContextButtonRing } from "./composer-footer"
import { absorbFileSelectionSuffix, composerMentions as mentionsFromParts, composerPartsEqual, composerText, deleteStructuredRange, emptyComposerParts, ensureTextPart, replaceRangeWithMention, replaceRangeWithText } from "./composer-editor"
import { getSelectionOffsets, parseComposerEditor, renderComposerEditor, setCursorPosition, syncComposerPillSelection } from "./composer-editor-dom"
import { isCompletedSlashCommand, resolveComposerAutocompleteAction, resolveComposerSlashAction } from "./composer-actions"
import { collectDroppedFilePaths, shouldHandleComposerFileDrop } from "./composer-drop"
import { autocompleteItemView, buildComposerMenuItems, mentionForQuery } from "./composer-menu"
import { composerPrimaryAction } from "./composer-primary-action"
import { composerEnterIntent, composerTabIntent, cycleAgentName, isShortcutTarget, leaderAction, shouldEnterShellMode, shouldExitShellModeOnBackspace, type ComposerMode } from "./keyboard-shortcuts"
import { buildModelPickerRecoveryActions, buildModelPickerSections, ModelPicker } from "./model-picker"
import { buildComposerHostMessage } from "./composer-submit"
import { mergeRestoredComposerParts, restoredComposerCursor } from "./composer-seed"
import { activeChildSessionId } from "./session-navigation"
import { captureCommandPromptInvocations, consumeFailedCommandPrompt, shouldTrackCommandPromptInvocation, type CommandPromptInvocation } from "./command-prompt"
import { CodexTodoPopover } from "./codex-todo-popover"
import { ContextPanel } from "./context-panel"
import { SessionPicker } from "./session-picker"
import { composerRunningState } from "./composer-running-state"
import { buildThemePickerItems, ThemePicker } from "./theme-picker"
import { resolveTranscriptHistoryMode, shouldAutoLoadEarlierMessages, transcriptHistoryScrollThreshold } from "./transcript-history"

declare global {
  interface Window {
    __OPENCODE_INITIAL_STATE__?: SessionBootstrap["sessionRef"] | null
  }
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()
const initialRef = window.__OPENCODE_INITIAL_STATE__ ?? null
const persistedState = normalizePersistedState(vscode.getState<PersistedAppState | SessionBootstrap["sessionRef"]>())
const fileRefStatus = new Map<string, boolean>()
const ESC_INTERRUPT_WINDOW_MS = 5000
const INITIAL_RENDERED_MESSAGE_COUNT = 120
const RENDER_EARLIER_MESSAGE_COUNT = 120

type PreviewImage = {
  src: string
  name: string
}

function sameAutocompleteMatch(
  left: { trigger: ComposerAutocompleteState["trigger"]; query: string; start: number; end: number } | null,
  right: { trigger: ComposerAutocompleteState["trigger"]; query: string; start: number; end: number } | null,
) {
  return !!left && !!right && left.trigger === right.trigger && left.query === right.query && left.start === right.start && left.end === right.end
}

export function App() {
  const [state, setState] = React.useState(() => createInitialState(initialRef, persistedState))
  const [composerMode, setComposerMode] = React.useState<ComposerMode>("normal")
  const [composing, setComposing] = React.useState(false)
  const [composerFocused, setComposerFocused] = React.useState(false)
  const [escPending, setEscPending] = React.useState(false)
  const [leaderPending, setLeaderPending] = React.useState(false)
  const [pendingMcpActions, setPendingMcpActions] = React.useState<Record<string, boolean>>({})
  const [fileResults, setFileResults] = React.useState<ComposerPathResult[]>([])
  const [fileSearch, setFileSearch] = React.useState<{ status: "idle" | "searching" | "done"; query: string }>({ status: "idle", query: "" })
  const [composerDrag, setComposerDrag] = React.useState<null | "mention">(null)
  const [modelPickerOpen, setModelPickerOpen] = React.useState(false)
  const [themePickerOpen, setThemePickerOpen] = React.useState(false)
  const [sessionPickerOpen, setSessionPickerOpen] = React.useState(false)
  const [sidePanelTab, setSidePanelTab] = React.useState<null | "context">(null)
  const [previewImage, setPreviewImage] = React.useState<PreviewImage | null>(null)
  const [skillPickerOpen, setSkillPickerOpen] = React.useState(false)
  const [skillPickerSelectedIndex, setSkillPickerSelectedIndex] = React.useState(0)
  const [codexTodoCollapsed, setCodexTodoCollapsed] = React.useState(false)
  const [renderedMessageCount, setRenderedMessageCount] = React.useState(INITIAL_RENDERED_MESSAGE_COUNT)
  const [loadingEarlierMessages, setLoadingEarlierMessages] = React.useState(false)
  const timelineRef = React.useRef<HTMLDivElement | null>(null)
  const composerRef = React.useRef<HTMLDivElement | null>(null)
  const modelPickerRef = React.useRef<HTMLDivElement | null>(null)
  const themePickerRef = React.useRef<HTMLDivElement | null>(null)
  const sessionPickerRef = React.useRef<HTMLDivElement | null>(null)
  const composerCursorRef = React.useRef<number | null>(null)
  const searchRef = React.useRef<{ requestID: string; query: string } | null>(null)
  const escTimerRef = React.useRef<number | null>(null)
  const escPendingRef = React.useRef(false)
  const autocompleteDismissedRef = React.useRef<null | { trigger: ComposerAutocompleteState["trigger"]; query: string; start: number; end: number }>(null)
  const leaderTimerRef = React.useRef<number | null>(null)
  const leaderPendingRef = React.useRef(false)
  const previousMessagesRef = React.useRef<SessionMessage[]>([])
  const pendingTranscriptOffsetRef = React.useRef<null | { scrollTop: number; scrollHeight: number }>(null)
  const transcriptHistoryArmedRef = React.useRef(true)
  const previousTranscriptStateRef = React.useRef({
    sessionKey: "",
    loadedCount: 0,
    historyLimit: 0,
  })
  const onHostErrorMessage = React.useCallback(() => {
    setState((current) => ({
      ...current,
      pendingCommandPromptInvocations: consumeFailedCommandPrompt(current.pendingCommandPromptInvocations),
    }))
  }, [])
  const onFileSearchResults = React.useCallback((payload: { requestID: string; query: string; results: ComposerPathResult[] }) => {
    if (!searchRef.current || payload.requestID !== searchRef.current.requestID) {
      return
    }
    if (payload.query !== searchRef.current.query) {
      return
    }
    setFileResults(payload.results)
    setFileSearch({ status: "done", query: payload.query })
  }, [])
  const composerMenuItems = React.useMemo(() => buildComposerMenuItems({
    composerAgentOverride: state.composerAgentOverride,
    composerMentionAgentOverride: state.composerMentionAgentOverride,
    snapshot: {
      display: state.snapshot.display,
      session: state.snapshot.session,
      commands: state.snapshot.commands,
      agents: state.snapshot.agents,
      mcpResources: state.snapshot.mcpResources,
    },
  }, fileResults), [
    fileResults,
    state.composerAgentOverride,
    state.composerMentionAgentOverride,
    state.snapshot.agents,
    state.snapshot.commands,
    state.snapshot.display,
    state.snapshot.mcpResources,
    state.snapshot.session,
  ])
  const composerAutocomplete = useComposerAutocomplete(composerMenuItems)
  const skillPickerItems = React.useMemo(() => skillPickerOpen
    ? filterItems(composerMenuItems, "skill", state.draft)
    : [], [composerMenuItems, skillPickerOpen, state.draft])
  React.useEffect(() => {
    setSkillPickerSelectedIndex((current) => skillPickerItems.length === 0 ? 0 : Math.min(current, skillPickerItems.length - 1))
  }, [skillPickerItems])
  const skillPickerAutocomplete = React.useMemo<ComposerAutocompleteState | null>(() => {
    if (!skillPickerOpen) {
      return null
    }

    const selectedIndex = skillPickerItems.length === 0 ? 0 : Math.min(skillPickerSelectedIndex, skillPickerItems.length - 1)
    return {
      trigger: "skill",
      query: state.draft,
      start: 0,
      end: state.draft.length,
      items: skillPickerItems,
      selectedIndex,
    }
  }, [skillPickerItems, skillPickerOpen, skillPickerSelectedIndex, state.draft])
  const suppressSlashAutocomplete = React.useMemo(() => isCompletedSlashCommand(state.draft, state.snapshot.commands), [state.draft, state.snapshot.commands])
  const activeAutocomplete = composerMode === "shell" || !composerFocused
    ? null
    : skillPickerOpen
      ? skillPickerAutocomplete
      : suppressSlashAutocomplete && composerAutocomplete.state?.trigger === "slash"
        ? null
      : composerAutocomplete.state
  const activeAutocompleteItem = activeAutocomplete?.items[activeAutocomplete.selectedIndex]
  const currentSelection = React.useMemo(() => composerSelection({
    ...state.snapshot,
    composerAgentOverride: state.composerAgentOverride,
    composerMentionAgentOverride: state.composerMentionAgentOverride,
    composerRecentModels: state.composerRecentModels,
    composerModelOverrides: state.composerModelOverrides,
    composerModelVariants: state.composerModelVariants,
  }), [state.composerAgentOverride, state.composerMentionAgentOverride, state.composerModelOverrides, state.composerModelVariants, state.composerRecentModels, state.snapshot])
  const latestUserSelection = React.useMemo(() => lastUserSelection(state.snapshot.messages, state.snapshot.providers), [state.snapshot.messages, state.snapshot.providers])
  const modelPickerSections = React.useMemo(() => buildModelPickerSections({
    providers: state.snapshot.providers,
    favorites: state.composerFavoriteModels,
    recents: state.composerRecentModels,
    currentModel: currentSelection.model,
    variants: state.composerModelVariants,
  }), [currentSelection.model, state.composerFavoriteModels, state.composerModelVariants, state.composerRecentModels, state.snapshot.providers])
  const modelPickerRecoveryActions = React.useMemo(() => buildModelPickerRecoveryActions({
    providers: state.snapshot.providers,
    providerAuth: state.snapshot.providerAuth,
  }), [state.snapshot.providerAuth, state.snapshot.providers])
  const themePickerItems = React.useMemo(() => buildThemePickerItems(resolvePanelThemeValue(state.snapshot.display.panelTheme)), [state.snapshot.display.panelTheme])

  const blocked = state.snapshot.permissions.length > 0 || state.snapshot.questions.length > 0
  const isChildSession = !!state.bootstrap.session?.parentID
  const contextPanelOpen = sidePanelTab === "context"
  const firstPermission = state.snapshot.permissions[0]
  const firstQuestion = state.snapshot.questions[0]
  const transcriptSessionKey = `${state.bootstrap.sessionRef.workspaceId}:${state.bootstrap.sessionRef.sessionId}`
  const visibleTranscriptMessages = React.useMemo(() => {
    if (renderedMessageCount >= state.snapshot.messages.length) {
      return state.snapshot.messages
    }

    const start = Math.max(0, state.snapshot.messages.length - renderedMessageCount)
    return state.snapshot.messages.slice(start)
  }, [renderedMessageCount, state.snapshot.messages])
  const transcriptHistoryMode = React.useMemo(() => resolveTranscriptHistoryMode({
    renderedCount: visibleTranscriptMessages.length,
    loadedCount: state.snapshot.messages.length,
    hasEarlier: state.snapshot.messageHistory.hasEarlier,
  }), [state.snapshot.messageHistory.hasEarlier, state.snapshot.messages.length, visibleTranscriptMessages.length])
  const transcriptHistoryStatus = loadingEarlierMessages
    ? "loading"
    : transcriptHistoryMode === "idle"
      ? "hidden"
      : "ready"
  const captureTranscriptOffset = React.useCallback(() => {
    const node = timelineRef.current
    if (!node) {
      return
    }

    pendingTranscriptOffsetRef.current = {
      scrollTop: node.scrollTop,
      scrollHeight: node.scrollHeight,
    }
  }, [])
  const renderEarlierMessages = React.useCallback(() => {
    captureTranscriptOffset()
    setRenderedMessageCount((current) => Math.min(
      state.snapshot.messages.length,
      Math.max(0, current) + RENDER_EARLIER_MESSAGE_COUNT,
    ))
  }, [captureTranscriptOffset, state.snapshot.messages.length])
  const loadEarlierMessages = React.useCallback(() => {
    if (loadingEarlierMessages || !state.snapshot.messageHistory.hasEarlier) {
      return
    }

    captureTranscriptOffset()
    setRenderedMessageCount((current) => Math.max(current, state.snapshot.messages.length))
    setLoadingEarlierMessages(true)
    vscode.postMessage({ type: "loadEarlierMessages" })
  }, [captureTranscriptOffset, loadingEarlierMessages, state.snapshot.messageHistory.hasEarlier, state.snapshot.messages.length])

  useComposerResize(composerRef, state.draft)
  useTimelineScroll(timelineRef, [visibleTranscriptMessages, state.snapshot.submitting, state.snapshot.permissions, state.snapshot.questions])
  useModifierState()

  React.useEffect(() => {
    transcriptHistoryArmedRef.current = true
  }, [transcriptSessionKey])

  React.useEffect(() => {
    const node = timelineRef.current
    if (!node) {
      return
    }

    const handleScroll = () => {
      const threshold = transcriptHistoryScrollThreshold(Number.parseFloat(window.getComputedStyle(node).lineHeight || ""))
      if (node.scrollTop > threshold) {
        transcriptHistoryArmedRef.current = true
        return
      }

      if (!shouldAutoLoadEarlierMessages({
        scrollTop: node.scrollTop,
        threshold,
        mode: transcriptHistoryMode,
        loading: loadingEarlierMessages,
        armed: transcriptHistoryArmedRef.current,
      })) {
        return
      }

      transcriptHistoryArmedRef.current = false
      if (transcriptHistoryMode === "render") {
        renderEarlierMessages()
        return
      }

      if (transcriptHistoryMode === "load") {
        loadEarlierMessages()
      }
    }

    node.addEventListener("scroll", handleScroll)
    return () => node.removeEventListener("scroll", handleScroll)
  }, [loadEarlierMessages, loadingEarlierMessages, renderEarlierMessages, transcriptHistoryMode])

  React.useEffect(() => {
    const previous = previousTranscriptStateRef.current
    const loadedCount = state.snapshot.messages.length

    if (previous.sessionKey !== transcriptSessionKey) {
      previousTranscriptStateRef.current = {
        sessionKey: transcriptSessionKey,
        loadedCount,
        historyLimit: state.snapshot.messageHistory.limit,
      }
      pendingTranscriptOffsetRef.current = null
      transcriptHistoryArmedRef.current = true
      setLoadingEarlierMessages(false)
      if (loadedCount > 0) {
        setRenderedMessageCount(loadedCount > INITIAL_RENDERED_MESSAGE_COUNT ? INITIAL_RENDERED_MESSAGE_COUNT : loadedCount)
      }
      return
    }

    if (loadedCount > 0) {
      setRenderedMessageCount((current) => {
        if (loadedCount <= INITIAL_RENDERED_MESSAGE_COUNT) {
          return loadedCount
        }

        if (previous.loadedCount === 0) {
          return INITIAL_RENDERED_MESSAGE_COUNT
        }

        return current >= previous.loadedCount ? loadedCount : current
      })
    }

    if (
      loadedCount !== previous.loadedCount
      || state.snapshot.messageHistory.limit !== previous.historyLimit
      || !state.snapshot.messageHistory.hasEarlier
    ) {
      setLoadingEarlierMessages(false)
    }

    previousTranscriptStateRef.current = {
      sessionKey: transcriptSessionKey,
      loadedCount,
      historyLimit: state.snapshot.messageHistory.limit,
    }
  }, [
    state.snapshot.messageHistory.hasEarlier,
    state.snapshot.messageHistory.limit,
    state.snapshot.messages.length,
    transcriptSessionKey,
  ])

  React.useLayoutEffect(() => {
    const pending = pendingTranscriptOffsetRef.current
    const node = timelineRef.current
    if (!pending || !node) {
      return
    }

    pendingTranscriptOffsetRef.current = null
    const delta = node.scrollHeight - pending.scrollHeight
    if (delta !== 0) {
      node.scrollTop = pending.scrollTop + delta
    }
  }, [transcriptSessionKey, visibleTranscriptMessages.length, state.snapshot.messageHistory.limit])

  React.useEffect(() => {
    document.title = `OpenCode: ${sessionTitle(state.bootstrap)}`
  }, [state.bootstrap])

  const autocompleteTrigger = activeAutocomplete?.trigger ?? null
  const autocompleteQuery = activeAutocomplete?.query ?? null

  React.useEffect(() => {
    if (composerMode === "shell") {
      searchRef.current = null
      setFileResults([])
      setFileSearch({ status: "idle", query: "" })
      return
    }

    if (autocompleteTrigger !== "mention" || autocompleteQuery === null) {
      searchRef.current = null
      setFileResults([])
      setFileSearch({ status: "idle", query: "" })
      return
    }

    const query = parseComposerFileQuery(autocompleteQuery.trim()).baseQuery.trim()

    const requestID = `file-search:${Date.now()}:${query}`
    searchRef.current = { requestID, query }
    setFileSearch({ status: "searching", query })
    vscode.postMessage({
      type: "searchFiles",
      requestID,
      query,
    })
  }, [autocompleteQuery, autocompleteTrigger, composerMode])

  const setComposerState = React.useCallback((parts: ComposerEditorPart[], error = "", allowTerminal = false) => {
    const composerParts = ensureTextPart(absorbFileSelectionSuffix(parts, allowTerminal).parts)
    const draft = composerText(composerParts)
    const composerMentions = mentionsFromParts(composerParts)
    setState((current) => ({
      ...current,
      draft,
      composerParts,
      composerMentions,
      composerMentionAgentOverride: composerMentionAgentOverride(composerMentions),
      error,
    }))
    return { draft, composerParts, composerMentions }
  }, [])

  const syncComposerInput = React.useCallback((
    value: string,
    start: number | null | undefined,
    end: number | null | undefined,
    source: "input" | "passive" = "input",
  ) => {
    if (composerMode === "shell") {
      autocompleteDismissedRef.current = null
      composerAutocomplete.close()
      return
    }

    if (skillPickerOpen) {
      autocompleteDismissedRef.current = null
      composerAutocomplete.close()
      return
    }

    const next = matchAutocomplete(value, start, end)

    // Upstream only reevaluates autocomplete after content changes. In the webview we
    // also resync on passive events like keyup, focus, mouseup, and compositionend,
    // so dismissing @ autocomplete with Esc would immediately reopen on the next passive
    // sync unless we suppress that exact unchanged match until real input changes it.
    if (sameAutocompleteMatch(autocompleteDismissedRef.current, next)) {
      if (source === "passive") {
        return
      }

      return
    }

    autocompleteDismissedRef.current = null
    composerAutocomplete.sync(value, start, end)
  }, [composerAutocomplete, composerMode, skillPickerOpen])

  const enterShellMode = React.useCallback(() => {
    autocompleteDismissedRef.current = null
    composerAutocomplete.close()
    setComposerMode("shell")
  }, [composerAutocomplete])

  const exitShellMode = React.useCallback(() => {
    autocompleteDismissedRef.current = null
    composerAutocomplete.close()
    setComposerMode("normal")
    setState((current) => ({
      ...current,
      draft: "",
      composerParts: emptyComposerParts(),
      composerMentions: [],
      composerMentionAgentOverride: undefined,
      error: "",
    }))

    window.setTimeout(() => {
      const input = composerRef.current
      if (!input) {
        return
      }
      const selection = getSelectionOffsets(input)
      syncComposerInput("", selection.start, selection.end, "passive")
    }, 0)
  }, [composerAutocomplete, syncComposerInput])

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

  const closeComposerAutocomplete = React.useCallback(() => {
    if (skillPickerOpen) {
      closeSkillPicker()
      return
    }

    const autocomplete = activeAutocomplete
    if (!autocomplete) {
      return
    }

    if (autocomplete.trigger === "slash") {
      autocompleteDismissedRef.current = null
      const next = replaceRangeWithText(state.composerParts, autocomplete.start, autocomplete.end, "")
      const result = setComposerState(next.parts, "")
      restoreComposerCursor(result.draft, next.cursor)
      return
    }

    autocompleteDismissedRef.current = autocomplete
    composerAutocomplete.close()
  }, [activeAutocomplete, closeSkillPicker, composerAutocomplete, restoreComposerCursor, setComposerState, skillPickerOpen, state.composerParts])

  const onRestoreComposer = React.useCallback((payload: { parts: ComposerPromptPart[] }) => {
    const parts = mergeRestoredComposerParts(state.composerParts, payload.parts)
    const result = setComposerState(parts, "")
    restoreComposerCursor(result.draft, restoredComposerCursor(parts))
  }, [restoreComposerCursor, setComposerState, state.composerParts])

  const onFocusComposer = React.useCallback(() => {
    window.setTimeout(() => {
      const input = composerRef.current
      if (!input || state.bootstrap.status !== "ready" || blocked || leaderPending) {
        return
      }

      const cursor = state.draft.length
      input.focus()
      setCursorPosition(input, cursor)
      resizeComposer(input)
      ensureComposerCursorVisible(input)
      syncComposerInput(state.draft, cursor, cursor, "passive")
    }, 0)
  }, [blocked, leaderPending, state.bootstrap.status, state.draft, syncComposerInput])

  const onComposerDragOver = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    const mentions = droppedFileMentions(event.dataTransfer, state.bootstrap.sessionRef.dir)
    if (!shouldHandleComposerFileDrop({
      shiftKey: event.shiftKey,
      filePaths: mentions.map((mention) => mention.path),
    })) {
      setComposerDrag(null)
      return
    }

    event.preventDefault()
    setComposerDrag("mention")
  }, [state.bootstrap.sessionRef.dir])

  const onComposerDragLeave = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    const related = event.relatedTarget
    if (related instanceof Node && event.currentTarget.contains(related)) {
      return
    }

    setComposerDrag(null)
  }, [])

  const onComposerDrop = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    const mentions = droppedFileMentions(event.dataTransfer, state.bootstrap.sessionRef.dir)
    setComposerDrag(null)
    if (!shouldHandleComposerFileDrop({
      shiftKey: event.shiftKey,
      filePaths: mentions.map((mention) => mention.path),
    })) {
      return
    }

    event.preventDefault()
    const input = composerRef.current
    if (!input) {
      return
    }

    const selection = composerFocused
      ? getSelectionOffsets(input)
      : { start: state.draft.length, end: state.draft.length }

    let parts = state.composerParts
    let cursor = selection.start
    let end = selection.end
    for (const mention of mentions) {
      const next = replaceRangeWithMention(parts, cursor, end, mention)
      parts = next.parts
      cursor = next.cursor
      end = next.cursor
    }

    const result = setComposerState(parts, "")
    restoreComposerCursor(result.draft, cursor)
  }, [composerFocused, restoreComposerCursor, setComposerState, state.bootstrap.sessionRef.dir, state.composerParts, state.draft])

  useHostMessages({
    fileRefStatus,
    onFileSearchResults,
    onFocusComposer,
    onErrorMessage: onHostErrorMessage,
    onRestoreComposer,
    onShellCommandSucceeded: exitShellMode,
    setPendingMcpActions,
    setState,
    vscode,
  })

  React.useEffect(() => {
    setState((current) => {
      const next = captureCommandPromptInvocations(
        previousMessagesRef.current,
        current.snapshot.messages,
        current.pendingCommandPromptInvocations,
        current.commandPromptInvocations,
      )
      previousMessagesRef.current = current.snapshot.messages
      if (next.pending === current.pendingCommandPromptInvocations && next.catalog === current.commandPromptInvocations) {
        return current
      }

      return {
        ...current,
        pendingCommandPromptInvocations: next.pending,
        commandPromptInvocations: next.catalog,
      }
    })
  }, [state.snapshot.messages])

  const persistedPanelState = React.useMemo(() => persistableAppState(state), [
    state.bootstrap.sessionRef.workspaceId,
    state.bootstrap.sessionRef.dir,
    state.bootstrap.sessionRef.sessionId,
    state.composerAgentOverride,
    state.composerFavoriteModels,
    state.composerModelOverrides,
    state.composerModelVariants,
    state.commandPromptInvocations,
    state.composerRecentModels,
  ])

  React.useEffect(() => {
    vscode.setState(persistedPanelState)
  }, [persistedPanelState])

  React.useEffect(() => {
    previousMessagesRef.current = []
  }, [state.bootstrap.sessionRef.workspaceId, state.bootstrap.sessionRef.sessionId])

  React.useEffect(() => {
    if (!latestUserSelection?.messageID) {
      return
    }

    setState((current) => {
      if (current.composerHydratedMessageID === latestUserSelection.messageID) {
        return current
      }

      const nextOverrides = { ...current.composerModelOverrides }
      if (latestUserSelection.agent && latestUserSelection.model) {
        nextOverrides[latestUserSelection.agent] = latestUserSelection.model
      }

      const nextVariants = { ...current.composerModelVariants }
      const nextModelKey = modelKey(latestUserSelection.model)
      if (nextModelKey) {
        if (latestUserSelection.variant) {
          nextVariants[nextModelKey] = latestUserSelection.variant
        } else {
          delete nextVariants[nextModelKey]
        }
      }

      return {
        ...current,
        composerAgentOverride: latestUserSelection.agent || current.composerAgentOverride,
        composerModelOverrides: nextOverrides,
        composerRecentModels: pushRecentModel(current.composerRecentModels, latestUserSelection.model),
        composerModelVariants: nextVariants,
        composerHydratedMessageID: latestUserSelection.messageID,
      }
    })
  }, [latestUserSelection])

  React.useEffect(() => {
    if (!modelPickerOpen && !themePickerOpen && !sessionPickerOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && modelPickerRef.current?.contains(target)) {
        return
      }
      if (target instanceof Node && themePickerRef.current?.contains(target)) {
        return
      }
      if (target instanceof Node && sessionPickerRef.current?.contains(target)) {
        return
      }
      setModelPickerOpen(false)
      setThemePickerOpen(false)
      setSessionPickerOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModelPickerOpen(false)
        setThemePickerOpen(false)
        setSessionPickerOpen(false)
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [modelPickerOpen, sessionPickerOpen, themePickerOpen])

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
    syncComposerPillSelection(input)
  }, [state.composerParts])

  React.useEffect(() => {
    const syncSelection = () => {
      const input = composerRef.current
      if (!input) {
        return
      }
      syncComposerPillSelection(input)
    }

    document.addEventListener("selectionchange", syncSelection)
    return () => document.removeEventListener("selectionchange", syncSelection)
  }, [])

  const submit = React.useCallback(() => {
    const hasImages = state.imageAttachments.length > 0
    if (!state.draft.trim() && !hasImages) {
      return
    }
    if (blocked) {
      return
    }

    const finalized = ensureTextPart(absorbFileSelectionSuffix(state.composerParts, true).parts)
    const draft = composerText(finalized)
    const selection = currentSelection

    if (composerMode === "shell") {
      setState((current) => ({
        ...current,
        draft: "",
        composerParts: emptyComposerParts(),
        composerMentions: [],
        composerMentionAgentOverride: undefined,
        error: "",
      }))

      vscode.postMessage({
        type: "runShellCommand",
        command: draft,
        agent: selection.agent,
        model: selection.model ? { providerID: selection.model.providerID, modelID: selection.model.modelID } : undefined,
        variant: selection.variant,
      })
      return
    }

    const slashAction = resolveComposerSlashAction(draft, state.snapshot.commands, {
      showSkillsInSlashAutocomplete: state.snapshot.display.showSkillsInSlashAutocomplete,
    })
    if (slashAction) {
      if (slashAction.type === "newSession") {
        setState((current) => ({
          ...current,
          draft: "",
          composerParts: emptyComposerParts(),
          composerMentions: [],
          composerMentionAgentOverride: undefined,
          imageAttachments: [],
          error: "",
        }))
        vscode.postMessage({ type: "newSession" })
        return
      }

      if (slashAction.type === "openSkillPicker") {
        openSkillPicker()
        return
      }

      if (slashAction.type === "openSessionPicker") {
        setState((current) => ({
          ...current,
          draft: "",
          composerParts: emptyComposerParts(),
          composerMentions: [],
          composerMentionAgentOverride: undefined,
          imageAttachments: [],
          error: "",
        }))
        openSessionPicker()
        return
      }

      if (slashAction.type === "openThemePicker") {
        setState((current) => ({
          ...current,
          draft: "",
          composerParts: emptyComposerParts(),
          composerMentions: [],
          composerMentionAgentOverride: undefined,
          error: "",
        }))
        openThemePicker()
        return
      }
    }

    const mentions = mentionsFromParts(finalized)
    const parts = buildComposerSubmitParts(draft, mentions)
    const images = state.imageAttachments.map((img) => ({ dataUrl: img.dataUrl, mime: img.mime, name: img.name }))
    const hostMessage = buildComposerHostMessage({
      draft,
      commands: state.snapshot.commands,
      showSkillsInSlashAutocomplete: state.snapshot.display.showSkillsInSlashAutocomplete,
      parts,
      images,
      agent: selection.agent,
      model: selection.model,
      variant: selection.variant,
    })

    if (hostMessage.type === "submit" && !selection.model) {
      setState((current) => ({
        ...current,
        error: current.snapshot.providers.length > 0 ? "Select a model before sending this message." : "Configure a provider before sending this message.",
      }))
      setThemePickerOpen(false)
      setModelPickerOpen(true)
      return
    }

    vscode.postMessage(hostMessage)
    setState((current) => ({
      ...current,
      draft: "",
      composerParts: emptyComposerParts(),
      composerMentions: [],
      composerMentionAgentOverride: undefined,
      pendingCommandPromptInvocations: hostMessage.type === "runSlashCommand" && shouldTrackCommandPromptInvocation(hostMessage.command, state.snapshot.commands)
        ? [...current.pendingCommandPromptInvocations, {
            command: hostMessage.command,
            arguments: hostMessage.arguments,
          } satisfies CommandPromptInvocation]
        : current.pendingCommandPromptInvocations,
      imageAttachments: [],
      error: "",
    }))
  }, [blocked, composerMode, currentSelection, exitShellMode, openSkillPicker, openThemePicker, state.composerParts, state.imageAttachments, state.snapshot.commands])

  const composerPlaceholder = composerMode === "shell"
    ? "Enter shell command to run in this workspace."
    : "Ask OpenCode to inspect, explain, or change this workspace."

  const composerAriaLabel = composerMode === "shell"
    ? "Enter shell command to run in this workspace"
    : "Ask OpenCode to inspect explain or change this workspace"

  const composerRunningStatus = React.useMemo(() => composerRunningState(state.snapshot.sessionStatus, escPending), [escPending, state.snapshot.sessionStatus])
  const composerRunning = isSessionRunning(state.snapshot.sessionStatus)
  const primaryAction = composerPrimaryAction({
    draft: state.draft,
    imageCount: state.imageAttachments.length,
    blocked,
    running: composerRunning,
    escPending,
    runningState: composerRunningStatus,
  })

  const clearComposerDraft = React.useCallback(() => {
    setState((current) => ({
      ...current,
      draft: "",
      composerParts: emptyComposerParts(),
      composerMentions: [],
      composerMentionAgentOverride: undefined,
      error: "",
    }))
  }, [])

  function openSkillPicker() {
    autocompleteDismissedRef.current = null
    composerAutocomplete.close()
    setModelPickerOpen(false)
    setThemePickerOpen(false)
    setSessionPickerOpen(false)
    setSkillPickerSelectedIndex(0)
    setSkillPickerOpen(true)
    const result = setComposerState(emptyComposerParts(), "")
    restoreComposerCursor(result.draft, 0)
  }

  function closeSkillPicker() {
    autocompleteDismissedRef.current = null
    setSkillPickerOpen(false)
    setSkillPickerSelectedIndex(0)
    const result = setComposerState(emptyComposerParts(), "")
    restoreComposerCursor(result.draft, 0)
  }

  function moveSkillPicker(delta: number) {
    setSkillPickerSelectedIndex((current) => {
      if (skillPickerItems.length === 0) {
        return 0
      }

      const size = skillPickerItems.length
      return (current + delta + size) % size
    })
  }

  const clearLeaderPending = React.useCallback(() => {
    leaderPendingRef.current = false
    setLeaderPending(false)
    if (leaderTimerRef.current !== null) {
      window.clearTimeout(leaderTimerRef.current)
      leaderTimerRef.current = null
    }
  }, [])

  const startLeaderPending = React.useCallback(() => {
    clearLeaderPending()
    leaderPendingRef.current = true
    setLeaderPending(true)
    leaderTimerRef.current = window.setTimeout(() => {
      leaderPendingRef.current = false
      setLeaderPending(false)
      leaderTimerRef.current = null
    }, 2000)
  }, [clearLeaderPending])

  const navigateSession = React.useCallback((sessionID: string) => {
    vscode.postMessage({ type: "navigateSession", sessionID })
  }, [])

  const openFileAttachment = React.useCallback((filePath: string) => {
    vscode.postMessage({ type: "openFile", filePath })
  }, [])

  const previewAttachmentImage = React.useCallback((image: PreviewImage) => {
    setPreviewImage(image)
  }, [])

  const postNewSession = React.useCallback(() => {
    vscode.postMessage({ type: "newSessionInPlace" })
  }, [])

  const requestSessionPicker = React.useCallback(() => {
    vscode.postMessage({ type: "requestSessionPicker" })
  }, [])

  const openSessionPicker = React.useCallback(() => {
    autocompleteDismissedRef.current = null
    composerAutocomplete.close()
    setModelPickerOpen(false)
    setThemePickerOpen(false)
    setSkillPickerOpen(false)
    setSessionPickerOpen(true)
    requestSessionPicker()
    setComposerState(emptyComposerParts(), "")
  }, [composerAutocomplete, requestSessionPicker, setComposerState])

  const closeSessionPicker = React.useCallback(() => {
    setSessionPickerOpen(false)
  }, [])

  const switchSessionInPlace = React.useCallback((sessionID: string) => {
    setSessionPickerOpen(false)
    vscode.postMessage({ type: "switchSessionInPlace", sessionID })
  }, [])

  const openModelPicker = React.useCallback(() => {
    setSessionPickerOpen(false)
    setThemePickerOpen(false)
    setModelPickerOpen(true)
  }, [])

  function openThemePicker() {
    setSessionPickerOpen(false)
    setModelPickerOpen(false)
    setThemePickerOpen(true)
  }

  const toggleContextPanel = React.useCallback(() => {
    setSessionPickerOpen(false)
    setModelPickerOpen(false)
    setThemePickerOpen(false)
    setSidePanelTab((current) => current === "context" ? null : "context")
  }, [])

  const toggleModelPicker = React.useCallback(() => {
    setThemePickerOpen(false)
    setModelPickerOpen((current) => !current)
  }, [])

  const selectComposerModel = React.useCallback((model: { providerID: string; modelID: string }) => {
    setState((current) => {
      const agent = composerSelection({
        ...current.snapshot,
        composerAgentOverride: current.composerAgentOverride,
        composerMentionAgentOverride: current.composerMentionAgentOverride,
        composerRecentModels: current.composerRecentModels,
        composerModelOverrides: current.composerModelOverrides,
        composerModelVariants: current.composerModelVariants,
      }).agent
      if (!agent) {
        return current
      }

      return {
        ...current,
        composerModelOverrides: {
          ...current.composerModelOverrides,
          [agent]: model,
        },
        composerRecentModels: pushRecentModel(current.composerRecentModels, model),
        error: "",
      }
    })
    setModelPickerOpen(false)
  }, [])

  const toggleComposerFavorite = React.useCallback((model: { providerID: string; modelID: string }) => {
    setState((current) => ({
      ...current,
      composerFavoriteModels: toggleFavoriteModel(current.composerFavoriteModels, model),
    }))
  }, [])

  const cycleComposerVariant = React.useCallback((model?: { providerID: string; modelID: string }) => {
    setState((current) => {
      const target = model || composerSelection({
        ...current.snapshot,
        composerAgentOverride: current.composerAgentOverride,
        composerMentionAgentOverride: current.composerMentionAgentOverride,
        composerRecentModels: current.composerRecentModels,
        composerModelOverrides: current.composerModelOverrides,
        composerModelVariants: current.composerModelVariants,
      }).model
      const nextVariant = cycleModelVariant(current.snapshot.providers, target, target ? current.composerModelVariants[modelKey(target)] : undefined)
      const nextVariants = { ...current.composerModelVariants }
      const key = modelKey(target)
      if (!key) {
        return current
      }
      if (nextVariant) {
        nextVariants[key] = nextVariant
      } else {
        delete nextVariants[key]
      }
      return {
        ...current,
        composerModelVariants: nextVariants,
      }
    })
  }, [])

  const openProviderDocs = React.useCallback(() => {
    vscode.postMessage({ type: "openDocs", target: "providers" })
  }, [])

  const startProviderAuth = React.useCallback((providerID: string) => {
    vscode.postMessage({ type: "providerAuthAction", providerID })
  }, [])

  const selectPanelTheme = React.useCallback((theme: "default" | "codex" | "claude") => {
    setThemePickerOpen(false)
    vscode.postMessage({ type: "updatePanelTheme", theme })
  }, [])

  const postComposerAction = React.useCallback((action: "refreshSession" | "compactSession" | "undoSession" | "redoSession" | "interruptSession", model?: { providerID: string; modelID: string }) => {
    vscode.postMessage({ type: "composerAction", action, model })
  }, [])

  const postMessageAction = React.useCallback((action: "forkUserMessage" | "undoUserMessage", messageID: string) => {
    vscode.postMessage({ type: "messageAction", action, messageID })
  }, [])

  const copyUserMessage = React.useCallback((message: SessionMessage) => {
    const value = visibleUserMessageText(message)
    if (!value.trim()) {
      return
    }

    void copyText(value)
  }, [])

  const copyAssistantText = React.useCallback((value: string) => {
    if (!value.trim()) {
      return
    }

    void copyText(value)
  }, [])

  const forkUserMessage = React.useCallback((message: SessionMessage) => {
    vscode.postMessage({ type: "messageAction", action: "forkUserMessage", messageID: message.info.id })
  }, [])

  const redoSession = React.useCallback(() => {
    postComposerAction("redoSession")
  }, [postComposerAction])

  const undoUserMessage = React.useCallback((message: SessionMessage) => {
    postMessageAction("undoUserMessage", message.info.id)
  }, [postMessageAction])

  const clearEscPending = React.useCallback(() => {
    escPendingRef.current = false
    setEscPending(false)
    if (escTimerRef.current !== null) {
      window.clearTimeout(escTimerRef.current)
      escTimerRef.current = null
    }
  }, [])

  const startEscPending = React.useCallback(() => {
    if (escTimerRef.current !== null) {
      window.clearTimeout(escTimerRef.current)
    }
    escPendingRef.current = true
    setEscPending(true)
    escTimerRef.current = window.setTimeout(() => {
      escPendingRef.current = false
      setEscPending(false)
      escTimerRef.current = null
    }, ESC_INTERRUPT_WINDOW_MS)
  }, [])

  const handleComposerPrimaryAction = React.useCallback(() => {
    if (primaryAction.disabled) {
      return
    }

    if (primaryAction.kind === "interrupt") {
      if (escPendingRef.current) {
        clearEscPending()
        postComposerAction("interruptSession")
        return
      }

      startEscPending()
      return
    }

    submit()
  }, [clearEscPending, postComposerAction, primaryAction.disabled, primaryAction.kind, startEscPending, submit])

  const composerFooterContextStats = React.useMemo(() => {
    const metrics = composerMetrics({
      ...state.snapshot,
      model: currentSelection.model,
    })
    return {
      tokens: metrics.tokens.toLocaleString(),
      usage: typeof metrics.percent === "number" ? `${metrics.percent}%` : "—",
      cost: formatUsd(metrics.cost),
      percent: metrics.percent,
    }
  }, [currentSelection.model, state.snapshot])

  const composerFooterBadges = React.useMemo(() => {
    const mcp = overallMcpStatus(state.snapshot.mcp)
    const lsp = overallLspStatus(state.snapshot.lsp)
    return [
      { label: "MCP", tone: mcp.tone, items: mcp.items },
      { label: "LSP", tone: lsp.tone, items: lsp.items },
    ]
  }, [state.snapshot.lsp, state.snapshot.mcp])

  const cycleComposerAgent = React.useCallback(() => {
    const next = cycleAgentName(state.snapshot.agents, currentSelection.agent)
    if (!next) {
      return false
    }

    setState((currentState) => ({
      ...currentState,
      composerAgentOverride: next,
      error: "",
    }))
    return true
  }, [currentSelection.agent, state.snapshot.agents])

  const runLeaderAction = React.useCallback((action: ReturnType<typeof leaderAction>) => {
    if (!action) {
      return false
    }

    if (action === "childFirst") {
      const childSessionID = activeChildSessionId(state.snapshot.messages, state.snapshot.childMessages, state.snapshot.childSessions)
      if (!childSessionID) {
        return false
      }
      navigateSession(childSessionID)
      return true
    }

    if (action === "newSession") {
      clearComposerDraft()
      postNewSession()
      return true
    }

    if (action === "redoSession") {
      if (!state.snapshot.session?.revert?.messageID) {
        return false
      }
      clearComposerDraft()
      postComposerAction("redoSession")
      return true
    }

    clearComposerDraft()
    postComposerAction("undoSession")
    return true
  }, [clearComposerDraft, navigateSession, postComposerAction, postNewSession, state.snapshot.childMessages, state.snapshot.childSessions, state.snapshot.messages, state.snapshot.session])

  React.useEffect(() => () => clearLeaderPending(), [clearLeaderPending])
  React.useEffect(() => () => clearEscPending(), [clearEscPending])

  React.useEffect(() => {
    if (activeAutocomplete) {
      clearLeaderPending()
    }
  }, [activeAutocomplete, clearLeaderPending])

  React.useEffect(() => {
    if (!isSessionRunning(state.snapshot.sessionStatus)) {
      clearEscPending()
    }
  }, [clearEscPending, state.snapshot.sessionStatus])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.bootstrap.status !== "ready") {
        clearLeaderPending()
        return
      }

      const targetMatches = isShortcutTarget(event.target, composerRef.current)
        if (leaderPendingRef.current) {
          const action = leaderAction(event.key)
          clearLeaderPending()
          if (!targetMatches || activeAutocomplete) {
            return
          }
        event.preventDefault()
        if (!action) {
          return
        }
        if (runLeaderAction(action)) {
          return
        }
        return
      }

      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "x") {
        if (!targetMatches || activeAutocomplete) {
          return
        }
        event.preventDefault()
        startLeaderPending()
        return
      }

      if (!isChildSession || !targetMatches || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return
      }

      if (event.key === "ArrowLeft" && state.snapshot.navigation.prev?.id) {
        event.preventDefault()
        navigateSession(state.snapshot.navigation.prev.id)
        return
      }

      if (event.key === "ArrowUp" && state.snapshot.navigation.parent?.id) {
        event.preventDefault()
        navigateSession(state.snapshot.navigation.parent.id)
        return
      }

      if (event.key === "ArrowRight" && state.snapshot.navigation.next?.id) {
        event.preventDefault()
        navigateSession(state.snapshot.navigation.next.id)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [activeAutocomplete, clearEscPending, clearLeaderPending, isChildSession, navigateSession, runLeaderAction, startLeaderPending, state.bootstrap.status, state.snapshot.navigation.next, state.snapshot.navigation.parent, state.snapshot.navigation.prev])

  const acceptComposerAutocomplete = React.useCallback((item: ComposerAutocompleteItem, options?: { completeDirectory?: boolean }) => {
    if (composerMode === "shell") {
      composerAutocomplete.close()
      return
    }

    const autocompleteAction = resolveComposerAutocompleteAction(item)
    if (autocompleteAction) {
      if (autocompleteAction.type === "newSessionInPlace") {
        clearComposerDraft()
        postNewSession()
        composerAutocomplete.close()
        return
      }

      if (autocompleteAction.type === "openSkillPicker") {
        openSkillPicker()
        return
      }

      if (autocompleteAction.type === "undoSession") {
        clearComposerDraft()
        postComposerAction("undoSession")
        composerAutocomplete.close()
        return
      }

      if (autocompleteAction.type === "redoSession") {
        clearComposerDraft()
        postComposerAction("redoSession")
        composerAutocomplete.close()
        return
      }

      if (autocompleteAction.type === "compactSession") {
        clearComposerDraft()
        postComposerAction("compactSession", currentSelection.model)
        composerAutocomplete.close()
        return
      }

      if (autocompleteAction.type === "openModelPicker") {
        clearComposerDraft()
        openModelPicker()
        composerAutocomplete.close()
        return
      }

      if (autocompleteAction.type === "openThemePicker") {
        clearComposerDraft()
        openThemePicker()
        composerAutocomplete.close()
        return
      }

      if (autocompleteAction.type === "resetAgent") {
        setState((current) => ({
          ...current,
          draft: "",
          composerParts: emptyComposerParts(),
          composerMentions: [],
          composerAgentOverride: undefined,
          composerMentionAgentOverride: undefined,
          error: "",
        }))
        composerAutocomplete.close()
        return
      }

      if (autocompleteAction.type === "refreshSession") {
        clearComposerDraft()
        postComposerAction("refreshSession")
        composerAutocomplete.close()
        return
      }

      if (autocompleteAction.type === "openSessionPicker") {
        openSessionPicker()
        return
      }
    }

    if (item.kind === "command" || item.kind === "SKILL") {
      const cmdDraft = item.trigger === "skill"
        ? `/${item.label} `
        : `/${item.label} `
      if (item.trigger === "skill") {
        autocompleteDismissedRef.current = matchAutocomplete(cmdDraft, cmdDraft.length, cmdDraft.length)
        setSkillPickerOpen(false)
        setSkillPickerSelectedIndex(0)
      }
      const next = replaceRangeWithText(emptyComposerParts(), 0, 0, cmdDraft)
      const result = setComposerState(next.parts, "")
      composerAutocomplete.close()
      restoreComposerCursor(result.draft, cmdDraft.length)
      return
    }

    if (item.mention) {
      const range = composerAutocomplete.state
      if (!range) {
        composerAutocomplete.close()
        return
      }

      if (options?.completeDirectory && item.mention.type === "file" && item.mention.kind === "directory") {
        const next = replaceRangeWithText(state.composerParts, range.start, range.end, `@${item.mention.path}`)
        const result = setComposerState(next.parts, "")
        restoreComposerCursor(result.draft, next.cursor)
        return
      }

      const mention = item.mention.type === "file"
        ? mentionForQuery(item.mention, range.query)
        : item.mention
      const next = replaceRangeWithMention(state.composerParts, range.start, range.end, mention)
      const result = setComposerState(next.parts, "")
      composerAutocomplete.close()
      restoreComposerCursor(result.draft, next.cursor)
    }
  }, [clearComposerDraft, composerAutocomplete, composerMode, currentSelection.model, openModelPicker, openSkillPicker, openThemePicker, postComposerAction, restoreComposerCursor, setComposerState, state.composerParts, state.snapshot])

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

  const panelTheme = resolvePanelThemeValue(state.snapshot.display.panelTheme)
  const hasIncompleteTodos = state.snapshot.todos.some((todo) => todo.status !== "completed")
  const showCodexTodoPopover = panelTheme === "codex" && state.snapshot.todos.length > 0 && hasIncompleteTodos

  React.useEffect(() => {
    if (!showCodexTodoPopover) {
      setCodexTodoCollapsed(false)
    }
  }, [showCodexTodoPopover])

  return (
    <WorkspaceDirContext.Provider value={state.bootstrap.sessionRef.dir || ""}>
      <ChildMessagesContext.Provider value={state.snapshot.childMessages}>
        <ChildSessionsContext.Provider value={state.snapshot.childSessions}>
          <WebviewBindingsProvider fileRefStatus={fileRefStatus} vscode={vscode}>
            <div className={`oc-shell${contextPanelOpen ? " has-sidePanel" : ""}`} data-oc-theme={panelTheme}>
              <main ref={timelineRef} className="oc-transcript">
                <div className="oc-transcriptInner">
                  <Timeline
                    bootstrapStatus={state.bootstrap.status}
                    compactSkillInvocations={state.snapshot.display.compactSkillInvocations !== false}
                    bootstrapMessage={state.bootstrap.message}
                    commandPromptInvocations={state.commandPromptInvocations}
                    commands={state.snapshot.commands}
                    diffMode={state.snapshot.display.diffMode}
                    historyStatus={transcriptHistoryStatus}
                    messages={visibleTranscriptMessages}
                    onCopyAssistantText={copyAssistantText}
                    onCopyUserMessage={copyUserMessage}
                    onForkUserMessage={forkUserMessage}
                    onOpenFileAttachment={openFileAttachment}
                    onPreviewImageAttachment={previewAttachmentImage}
                    onRedoSession={redoSession}
                    onUndoUserMessage={undoUserMessage}
                    revertID={state.snapshot.session?.revert?.messageID}
                    revertDiff={state.snapshot.session?.revert?.diff}
                    showInternals={state.snapshot.display.showInternals}
                    showThinking={state.snapshot.display.showThinking}
                    panelTheme={panelTheme}
                    skillCatalog={state.snapshot.skillCatalog}
                    AgentBadge={AgentBadge}
                    CompactionDivider={CompactionDivider}
                    EmptyState={EmptyState}
                    MarkdownBlock={MarkdownBlock}
                    PartView={PartView}
                  />
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
                FileRefText={FileRefText}
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
              <>
                {showCodexTodoPopover ? (
                  <div className={`oc-codexTodoDock${codexTodoCollapsed ? " is-collapsed" : ""}`}>
                    <CodexTodoPopover
                      todos={state.snapshot.todos}
                      collapsed={codexTodoCollapsed}
                      onToggle={() => setCodexTodoCollapsed((current) => !current)}
                    />
                  </div>
                ) : null}
                <section
                  className={`oc-composer${leaderPending ? " is-leaderPending" : ""}${composerMode === "shell" ? " is-shell" : ""}`}
                  onDragOver={onComposerDragOver}
                  onDragLeave={onComposerDragLeave}
                  onDrop={onComposerDrop}
                >
                  <div className="oc-composerBody">
                    {composerDrag ? <div className="oc-composerDropOverlay">Drop to @mention file</div> : null}
                    {state.imageAttachments.length > 0 ? (
                      <div className="oc-composerImageStrip">
                        {state.imageAttachments.map((img) => (
                          <div key={img.id} className="oc-composerImageThumb">
                            <img
                              src={img.dataUrl}
                              alt={img.name}
                              className="oc-composerImageThumbImg"
                              onClick={() => setPreviewImage({ src: img.dataUrl, name: img.name })}
                            />
                            <button
                              type="button"
                              className="oc-composerImageThumbClose"
                              aria-label={`Remove ${img.name}`}
                              onClick={() => setState((current) => ({
                                ...current,
                                imageAttachments: current.imageAttachments.filter((a) => a.id !== img.id),
                              }))}
                            >
                              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4L12 12M12 4L4 12" /></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="oc-composerInputWrap">
                      {leaderPending ? <div className="oc-composerLeaderOverlay"><span className="oc-composerLeaderOverlayText">Ctrl + X Pressed</span></div> : null}
                      <div
                          ref={composerRef}
                          className={`oc-composerInput${composerMode === "shell" ? " is-shell" : ""}`}
                          role="textbox"
                          aria-multiline="true"
                          aria-label={composerAriaLabel}
                          contentEditable={state.bootstrap.status === "ready" && !blocked && !leaderPending}
                          suppressContentEditableWarning
                          spellCheck
                          onInput={(event) => {
                            const selection = getSelectionOffsets(event.currentTarget)
                            const rawParts = ensureTextPart(parseComposerEditor(event.currentTarget))
                            const normalized = absorbFileSelectionSuffix(rawParts)
                            const composerParts = ensureTextPart(normalized.parts)
                            const draft = composerText(composerParts)
                            const composerMentions = mentionsFromParts(composerParts)
                            syncComposerInput(draft, selection.start, selection.end, "input")
                            setState((current) => ({
                              ...current,
                              draft,
                              composerParts,
                              composerMentions,
                              composerMentionAgentOverride: composerMentionAgentOverride(composerMentions),
                            }))
                            if (normalized.changed) {
                              composerCursorRef.current = selection.end
                            }
                            resizeComposer(event.currentTarget)
                            ensureComposerCursorVisible(event.currentTarget)
                          }}
                          onPaste={(event) => {
                            const items = Array.from(event.clipboardData.items)
                            const imageItems = items.filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                            if (imageItems.length > 0) {
                              event.preventDefault()
                              for (const item of imageItems) {
                                const file = item.getAsFile()
                                if (!file) {
                                  continue
                                }
                                const reader = new FileReader()
                                reader.onload = () => {
                                  const dataUrl = reader.result as string
                                  const attachment: ImageAttachment = {
                                    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                    dataUrl,
                                    mime: file.type || "image/png",
                                    name: file.name || `image.${(file.type || "image/png").split("/")[1] || "png"}`,
                                  }
                                  setState((current) => ({
                                    ...current,
                                    imageAttachments: [...current.imageAttachments, attachment],
                                  }))
                                }
                                reader.readAsDataURL(file)
                              }
                              return
                            }

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
                            syncComposerInput(state.draft, selection.start, selection.end, "passive")
                          }}
                          onMouseUp={() => {
                            const input = composerRef.current
                            if (!input) {
                              return
                            }
                            const selection = getSelectionOffsets(input)
                            ensureComposerCursorVisible(input)
                            syncComposerInput(state.draft, selection.start, selection.end, "passive")
                          }}
                          onFocus={() => {
                            setComposerFocused(true)
                            const input = composerRef.current
                            if (!input) {
                              return
                            }
                            const selection = getSelectionOffsets(input)
                            ensureComposerCursorVisible(input)
                            syncComposerInput(state.draft, selection.start, selection.end, "passive")
                          }}
                          onBlur={() => {
                            setComposerFocused(false)
                            setComposing(false)
                            clearLeaderPending()
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
                            syncComposerInput(state.draft, selection.start, selection.end, "passive")
                          }}
                          onKeyDown={(event) => {
                            const native = event.nativeEvent as KeyboardEvent & { keyCode?: number }
                            const isImeComposing = native.isComposing || composing || native.keyCode === 229
                            const selection = getSelectionOffsets(event.currentTarget)
                            const enterIntent = composerEnterIntent({
                              mode: composerMode,
                              key: event.key,
                              metaKey: event.metaKey,
                              ctrlKey: event.ctrlKey,
                              shiftKey: event.shiftKey,
                              hasAutocomplete: !!activeAutocomplete,
                              isImeComposing,
                            })

                            if (shouldEnterShellMode({
                              mode: composerMode,
                              draft: state.draft,
                              key: event.key,
                              start: selection.start,
                              end: selection.end,
                              metaKey: event.metaKey,
                              ctrlKey: event.ctrlKey,
                              altKey: event.altKey,
                            })) {
                              event.preventDefault()
                              enterShellMode()
                              return
                            }

                            if (shouldExitShellModeOnBackspace({
                              mode: composerMode,
                              draft: state.draft,
                              key: event.key,
                              start: selection.start,
                              end: selection.end,
                              metaKey: event.metaKey,
                              ctrlKey: event.ctrlKey,
                              altKey: event.altKey,
                            })) {
                              event.preventDefault()
                              exitShellMode()
                              return
                            }

                            if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "Backspace" || event.key === "Delete")) {
                              const next = deleteStructuredRange(state.composerParts, selection.start, selection.end, event.key)
                              if (next) {
                                event.preventDefault()
                                const result = setComposerState(next.parts, "")
                                restoreComposerCursor(result.draft, next.cursor)
                                return
                              }
                            }

                            if (enterIntent === "ignore") {
                              return
                            }

                            if (activeAutocomplete) {
                              if (event.key === "ArrowDown") {
                                event.preventDefault()
                                if (skillPickerOpen) {
                                  moveSkillPicker(1)
                                } else {
                                  composerAutocomplete.move(1)
                                }
                                return
                              }

                              if (event.key === "ArrowUp") {
                                event.preventDefault()
                                if (skillPickerOpen) {
                                  moveSkillPicker(-1)
                                } else {
                                  composerAutocomplete.move(-1)
                                }
                                return
                              }

                              if (event.key === "Escape") {
                                event.preventDefault()
                                closeComposerAutocomplete()
                                return
                              }

                              if (enterIntent === "acceptAutocomplete") {
                                event.preventDefault()
                                if (activeAutocompleteItem) {
                                  acceptComposerAutocomplete(activeAutocompleteItem)
                                }
                                return
                              }

                              if (event.key === "Tab" && activeAutocompleteItem) {
                                event.preventDefault()
                                acceptComposerAutocomplete(activeAutocompleteItem, { completeDirectory: activeAutocompleteItem.kind === "directory" })
                                return
                              }
                            }

                            if (event.key === "Escape" && composerMode === "shell" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                              event.preventDefault()
                              exitShellMode()
                              return
                            }

                            if (enterIntent === "newline") {
                              event.preventDefault()
                              const next = replaceRangeWithText(state.composerParts, selection.start, selection.end, "\n")
                              const result = setComposerState(next.parts, "")
                              restoreComposerCursor(result.draft, next.cursor)
                              return
                            }

                            if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
                              if (!isSessionRunning(state.snapshot.sessionStatus)) {
                                return
                              }

                              event.preventDefault()
                              if (escPendingRef.current) {
                                clearEscPending()
                                postComposerAction("interruptSession")
                                return
                              }

                              startEscPending()
                              return
                            }

                            if (event.key === "Tab") {
                              const nextAgent = cycleAgentName(state.snapshot.agents, currentSelection.agent)
                              const tabIntent = composerTabIntent({
                                mode: composerMode,
                                hasAutocomplete: !!activeAutocomplete,
                                hasCurrentItem: !!activeAutocompleteItem,
                                metaKey: event.metaKey,
                                ctrlKey: event.ctrlKey,
                                altKey: event.altKey,
                                canCycleAgent: !!nextAgent,
                              })

                              if (tabIntent === "ignore") {
                                event.preventDefault()
                                return
                              }

                              if (tabIntent === "cycleAgent" && cycleComposerAgent()) {
                                event.preventDefault()
                                return
                              }
                            }

                            if (!event.shiftKey && !event.altKey && !event.metaKey && event.ctrlKey && event.key.toLowerCase() === "t") {
                              if (modelVariants(state.snapshot.providers, currentSelection.model).length > 0) {
                                event.preventDefault()
                                cycleComposerVariant()
                                return
                              }
                            }

                            if (enterIntent !== "submit") {
                              return
                            }
                            event.preventDefault()
                            submit()
                          }}
                        />
                      {!state.draft.trim() && !composerFocused ? <div className="oc-composerPlaceholder" aria-hidden="true">{composerPlaceholder}</div> : null}
                    </div>
                    <div className="oc-modelPickerLayer" ref={sessionPickerOpen ? sessionPickerRef : themePickerOpen ? themePickerRef : modelPickerRef}>
                      <div className="oc-composerInfoWrap">
                        <ComposerInfo state={state} leaderPending={leaderPending} modelPickerOpen={modelPickerOpen} onToggleModelPicker={toggleModelPicker} onCycleVariant={() => cycleComposerVariant()} />
                      </div>
                      <ComposerPrimaryActionButton action={primaryAction} onClick={handleComposerPrimaryAction} />
                      {sessionPickerOpen ? (
                        <SessionPicker
                          payload={state.sessionPicker}
                          onClose={closeSessionPicker}
                          onSwitch={switchSessionInPlace}
                        />
                      ) : null}
                      {modelPickerOpen ? (
                        <ModelPicker
                          sections={modelPickerSections}
                          recoveryActions={modelPickerRecoveryActions}
                          currentAgent={currentSelection.agent}
                          onClose={() => setModelPickerOpen(false)}
                          onOpenProviderDocs={openProviderDocs}
                          onStartProviderAuth={startProviderAuth}
                          onSelect={selectComposerModel}
                          onToggleFavorite={toggleComposerFavorite}
                          onCycleVariant={cycleComposerVariant}
                        />
                      ) : null}
                      {themePickerOpen ? (
                        <ThemePicker
                          items={themePickerItems}
                          onClose={() => setThemePickerOpen(false)}
                          onSelect={selectPanelTheme}
                        />
                      ) : null}
                    </div>
                    {activeAutocomplete ? <ComposerAutocompletePopup state={activeAutocomplete} fileSearch={fileSearch} onSelect={acceptComposerAutocomplete} /> : null}
                  </div>
                  <ComposerFooter
                    contextStats={composerFooterContextStats}
                    status={composerRunningStatus}
                    contextOpen={contextPanelOpen}
                    badges={composerFooterBadges}
                    error={state.error || undefined}
                    onOpenContext={toggleContextPanel}
                    pendingActions={pendingMcpActions}
                    onActionStart={(name) => setPendingMcpActions((current) => ({ ...current, [name]: true }))}
                    onBadgeAction={(item) => {
                      if (!item.action) {
                        return
                      }
                      vscode.postMessage({ type: "mcpAction", name: item.name, action: item.action })
                    }}
                  />
                </section>
              </>
            ) : null}

            {!blocked && isChildSession ? <SubagentNotice /> : null}
                </div>
              </footer>
              {contextPanelOpen ? (
                <aside className="oc-sidePanel" aria-label="Session context">
                  <div className="oc-sidePanelHeader">
                    <div className="oc-sidePanelTabs" role="tablist" aria-label="Session side panel">
                      <button type="button" className="oc-sidePanelTab is-active" role="tab" aria-selected="true">
                        <ContextButtonRing percent={composerFooterContextStats.percent} decorative={true} />
                        <span>Context</span>
                      </button>
                    </div>
                    <button type="button" className="oc-sidePanelClose" onClick={() => setSidePanelTab(null)} aria-label="Close context">
                      Close
                    </button>
                  </div>
                  <div className="oc-sidePanelBody">
                    <ContextPanel
                      session={state.snapshot.session}
                      messages={state.snapshot.messages}
                      providers={state.snapshot.providers}
                    />
                  </div>
                </aside>
              ) : null}
            {previewImage ? (
              <div className="oc-imagePreviewOverlay" onClick={() => setPreviewImage(null)}>
                <div className="oc-imagePreviewContent" onClick={(event) => event.stopPropagation()}>
                  <img src={previewImage.src} alt={previewImage.name} className="oc-imagePreviewImg" />
                  <button
                    type="button"
                    className="oc-imagePreviewClose"
                    aria-label="Close preview"
                    onClick={() => setPreviewImage(null)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4L12 12M12 4L4 12" /></svg>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          </WebviewBindingsProvider>
        </ChildSessionsContext.Provider>
      </ChildMessagesContext.Provider>
    </WorkspaceDirContext.Provider>
  )
}

function visibleUserMessageText(message: SessionMessage) {
  return message.parts
    .flatMap((part) => part.type === "text" && !part.synthetic ? [part.text] : [])
    .join("")
}

function copyText(value: string) {
  const clipboard = window.navigator?.clipboard
  if (clipboard?.writeText) {
    return clipboard.writeText(value)
  }

  const input = document.createElement("textarea")
  input.value = value
  input.setAttribute("readonly", "")
  input.className = "oc-copyScratchpad"
  document.body.appendChild(input)
  input.select()
  document.execCommand("copy")
  document.body.removeChild(input)
  return Promise.resolve()
}

function normalizePersistedState(value: PersistedAppState | SessionBootstrap["sessionRef"] | null | undefined): PersistedAppState | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const maybe = value as Partial<PersistedAppState> & { workspaceId?: string }
  if (!maybe.dir || !maybe.sessionId) {
    return undefined
  }

  return {
    workspaceId: maybe.workspaceId || maybe.dir,
    dir: maybe.dir,
    sessionId: maybe.sessionId,
    composerAgentOverride: maybe.composerAgentOverride,
    composerModelOverrides: maybe.composerModelOverrides,
    composerRecentModels: maybe.composerRecentModels,
    composerFavoriteModels: maybe.composerFavoriteModels,
    composerModelVariants: maybe.composerModelVariants,
    commandPromptInvocations: maybe.commandPromptInvocations,
  }
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
        <span className="oc-composerAutocompleteTrigger">{state.trigger === "mention" ? "@" : "/"}</span>
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
  const view = autocompleteItemView(state.query, item)
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
        <div className="oc-composerAutocompleteLabel">{highlightAutocompleteText(view.label, item.match?.label)}</div>
        <div className="oc-composerAutocompleteDetail" title={view.fullDetail}>{highlightAutocompleteText(view.detail, item.match?.detail)}</div>
        <div className="oc-composerAutocompleteKind">{view.kind}</div>
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

  if (state.trigger === "skill") {
    return state.query ? `Skill filter: ${state.query}` : "Search skills"
  }

  const query = parseComposerFileQuery(state.query).baseQuery.trim()
  if (!state.query) {
    return "Agents, resources, and project paths"
  }

  if (fileSearch.status === "searching" && fileSearch.query === query) {
    return `Searching paths for \"${state.query}\"...`
  }

  return `Filter: ${state.query}`
}

function popupEmptyText(state: ComposerAutocompleteState, fileSearch: { status: "idle" | "searching" | "done"; query: string }) {
  if (state.trigger === "slash") {
    return state.query ? `No slash actions match \"${state.query}\"` : "Start typing to filter"
  }

  if (state.trigger === "skill") {
    return state.query ? `No skills match \"${state.query}\"` : "Type a skill name"
  }

  const query = parseComposerFileQuery(state.query).baseQuery.trim()
  if (!state.query) {
    return "Type an agent, resource, path, or path#12-20"
  }

  if (fileSearch.status === "searching" && fileSearch.query === query) {
    return `Searching paths for \"${state.query}\"...`
  }

  return `No agents or paths match \"${state.query}\"`
}

function ComposerInfo({
  state,
  leaderPending: _leaderPending,
  modelPickerOpen,
  onToggleModelPicker,
  onCycleVariant,
}: {
  state: AppState
  leaderPending: boolean
  modelPickerOpen: boolean
  onToggleModelPicker: () => void
  onCycleVariant: () => void
}) {
  const info = composerIdentity({
    ...state.snapshot,
    composerAgentOverride: state.composerAgentOverride,
    composerMentionAgentOverride: state.composerMentionAgentOverride,
    composerRecentModels: state.composerRecentModels,
    composerModelOverrides: state.composerModelOverrides,
    composerModelVariants: state.composerModelVariants,
  })
  const variantOptions = modelVariants(state.snapshot.providers, info.modelRef)
  const colorClass = agentColorClass(info.agent)
  return (
    <div className="oc-composerInfo">
      <div className="oc-composerInfoRow">
        <span className="oc-composerIdentityStart">
          <span className={`oc-composerAgent ${colorClass}`}>{info.agent}</span>
        </span>
        {info.model || info.provider ? (
          <button
            type="button"
            className={`oc-composerModelTrigger${modelPickerOpen ? " is-open" : ""}`}
            aria-label="Switch model"
            aria-expanded={modelPickerOpen}
            onClick={onToggleModelPicker}
          >
            {info.model ? <span className="oc-composerModel" title={info.model}>{info.model}</span> : null}
            {info.provider ? <span className="oc-composerProvider" title={info.provider}>{info.provider}</span> : null}
          </button>
        ) : null}
        {variantOptions.length > 0 ? (
          <button type="button" className="oc-composerVariantTrigger" onClick={onCycleVariant} title="Cycle variant">
            {info.variant || "default"}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function droppedFileMentions(data: DataTransfer | null, workspaceDir: string) {
  const paths = collectDroppedFilePaths(data, workspaceDir)
  return paths.map((path) => ({
    type: "file" as const,
    path,
    kind: "file" as const,
    content: formatComposerFileContent(path),
  }))
}

function ComposerPrimaryActionButton({
  action,
  onClick,
}: {
  action: ReturnType<typeof composerPrimaryAction>
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`oc-composerPrimaryAction is-${action.kind}${action.disabled ? " is-disabled" : ""}${action.icon === "stop-confirm" ? " is-armed" : ""}`}
      onClick={onClick}
      disabled={action.disabled}
      title={action.title}
      aria-label={action.ariaLabel}
    >
      {action.icon === "send" ? <SendIcon /> : null}
      {action.icon === "stop" ? <StopIcon /> : null}
      {action.icon === "stop-confirm" ? <StopConfirmIcon /> : null}
    </button>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.25 7.75 13.75 2.75 8.75 13.75 7.1 8.4 2.25 7.75Z" className="oc-composerPrimaryActionPath is-fill" />
      <path d="M7 8.5 13.75 2.75" className="oc-composerPrimaryActionPath" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.5" className="oc-composerPrimaryActionPath is-fill" />
    </svg>
  )
}

function StopConfirmIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" className="oc-composerPrimaryActionPath" />
      <rect x="5" y="5" width="6" height="6" rx="1.25" className="oc-composerPrimaryActionPath is-fill" />
    </svg>
  )
}
