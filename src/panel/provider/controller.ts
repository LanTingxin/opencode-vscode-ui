import * as vscode from "vscode"
import { postToWebview } from "../../bridge/host"
import type { ComposerPromptPart, HostMessage, SessionPanelRef, SessionSnapshot, WebviewMessage } from "../../bridge/types"
import { affectsDisplaySettings, updatePanelTheme } from "../../core/settings"
import { EventHub } from "../../core/events"
import type { SessionEvent } from "../../core/sdk"
import { WorkspaceManager } from "../../core/workspace"
import { providerAuthAction, rejectQuestion, replyPermission, replyQuestion, runComposerAction, runMcpAction, runShellCommand, runSlashCommand, submit, type PanelActionState } from "./actions"
import { openFile, resolveFileRefs, searchFiles } from "./files"
import { needsRefresh, reduce } from "./reducer"
import { buildSessionSnapshot, DEFAULT_SESSION_MESSAGE_LIMIT, patch } from "./snapshot"
import { boot, panelIconPath, panelTitle } from "./utils"
import { sessionPanelHtml } from "../html"

export class SessionPanelController implements vscode.Disposable {
  ref: SessionPanelRef
  key: string
  private messageLimit = DEFAULT_SESSION_MESSAGE_LIMIT
  private ready = false
  private incrementalReady = false
  private pending: Promise<void> | undefined
  private pendingComposerParts: ComposerPromptPart[] | undefined
  private pendingComposerFocus = false
  private current: SessionSnapshot | undefined
  private refreshSeq = 0
  private deferredDirty = {
    sessionStatus: false,
    permissions: false,
    questions: false,
  }
  private readonly bag: vscode.Disposable[] = []
  private readonly state: PanelActionState = {
    disposed: false,
    run: 0,
    pendingSubmitCount: 0,
  }

  constructor(
    private extensionUri: vscode.Uri,
    ref: SessionPanelRef,
    key: string,
    readonly panel: vscode.WebviewPanel,
    private mgr: WorkspaceManager,
    private events: EventHub,
    private out: vscode.OutputChannel,
    private onActive: (ref: SessionPanelRef | undefined) => void,
    private onDispose: (key: string) => void,
  ) {
    this.ref = ref
    this.key = key
    panel.webview.options = { enableScripts: true }
    panel.webview.html = sessionPanelHtml(panel.webview, this.extensionUri, ref)
    panel.title = panelTitle(ref.sessionId)
    panel.iconPath = panelIconPath(this.extensionUri)

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        if (message?.type === "ready") {
          this.ready = true
          void (async () => {
            await this.push(false, "webview:ready")
            await this.flushSeedComposer()
            await this.flushComposerFocus()
          })()
          return
        }

        if (message?.type === "refresh") {
          void this.push(true, "webview:refresh")
          return
        }

        if (message?.type === "submit") {
          void submit(this.actionContext(), message.text, message.parts, message.agent, message.model, message.variant, message.images)
          return
        }

        if (message?.type === "permissionReply") {
          void replyPermission(this.actionContext(), message.requestID, message.reply, message.message)
          return
        }

        if (message?.type === "questionReply") {
          void replyQuestion(this.actionContext(), message.requestID, message.answers)
          return
        }

        if (message?.type === "questionReject") {
          void rejectQuestion(this.actionContext(), message.requestID)
          return
        }

        if (message?.type === "navigateSession") {
          void vscode.commands.executeCommand("opencode-ui.openSessionById", this.ref, message.sessionID)
          return
        }

        if (message?.type === "newSession") {
          void vscode.commands.executeCommand("opencode-ui.newSessionAndOpen", this.ref)
          return
        }

        if (message?.type === "newSessionInPlace") {
          void vscode.commands.executeCommand("opencode-ui.newSessionInPlace", this.ref)
          return
        }

        if (message?.type === "requestSessionPicker") {
          void this.postSessionPicker()
          return
        }

        if (message?.type === "switchSessionInPlace") {
          void vscode.commands.executeCommand("opencode-ui.switchSessionInPlace", this.ref, message.sessionID)
          return
        }

        if (message?.type === "sessionPickerAction") {
          void (async () => {
            await vscode.commands.executeCommand("opencode-ui.sessionPickerAction", this.ref, message.sessionID, message.action)
            await this.postSessionPicker()
          })()
          return
        }

        if (message?.type === "openFile") {
          void openFile(this.ref, message.filePath, message.line)
          return
        }

        if (message?.type === "resolveFileRefs") {
          void resolveFileRefs(this.panel.webview, this.ref, message.refs)
          return
        }

        if (message?.type === "searchFiles") {
          void searchFiles(this.panel.webview, this.mgr, this.ref.workspaceId, message.requestID, message.query)
          return
        }

        if (message?.type === "openDocs") {
          if (message.target === "providers") {
            void vscode.commands.executeCommand("opencode-ui.openProviderDocs")
          }
          return
        }

        if (message?.type === "loadEarlierMessages") {
          if (!this.current?.messageHistory?.hasEarlier) {
            return
          }

          this.messageLimit += DEFAULT_SESSION_MESSAGE_LIMIT
          void this.push(true, "webview:loadEarlierMessages")
          return
        }

        if (message?.type === "providerAuthAction") {
          void providerAuthAction(this.actionContext(), message.providerID)
          return
        }

        if (message?.type === "mcpAction") {
          void runMcpAction(this.actionContext(), message.name, message.action)
          return
        }

        if (message?.type === "composerAction") {
          void runComposerAction(this.actionContext(), message.action, message.model)
          return
        }

        if (message?.type === "updatePanelTheme") {
          void updatePanelTheme(message.theme)
          return
        }

        if (message?.type === "messageAction") {
          if (message.action === "undoUserMessage") {
            void runComposerAction(this.actionContext(), "undoSession", undefined, message.messageID)
            return
          }

          if (message.action === "forkUserMessage") {
            void vscode.commands.executeCommand("opencode-ui.forkSessionMessage", this.ref, message.messageID)
          }
          return
        }

        if (message?.type === "runSlashCommand") {
          void runSlashCommand(this.actionContext(), message.command, message.arguments, message.agent, message.model, message.variant, message.parts)
          return
        }

        if (message?.type === "runShellCommand") {
          void runShellCommand(this.actionContext(), message.command, message.agent, message.model, message.variant)
        }
      },
      undefined,
      this.bag,
    )

    this.panel.onDidDispose(() => {
      this.dispose()
    }, undefined, this.bag)

    this.panel.onDidChangeViewState(({ webviewPanel }) => {
      this.onActive(webviewPanel.active ? this.ref : undefined)
    }, undefined, this.bag)

    this.bag.push(
      this.mgr.onDidChange(() => {
        void this.push(true, "workspace:change")
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!affectsDisplaySettings(event)) {
          return
        }

        void this.push(true, "config:display")
      }),
      this.events.onDidEvent((item) => {
        if (item.workspaceId !== this.ref.workspaceId) {
          return
        }
        void this.handle(item.event)
      }),
    )
  }

  async reveal(viewColumn = this.panel.viewColumn ?? vscode.ViewColumn.Active) {
    await this.push(false, "reveal")
    this.panel.reveal(viewColumn)
  }

  async seedComposer(parts: ComposerPromptPart[]) {
    if (!parts.length) {
      return
    }

    this.pendingComposerParts = parts
    await this.flushSeedComposer()
  }

  async requestComposerFocus() {
    this.pendingComposerFocus = true
    await this.flushComposerFocus()
  }

  async runImagePreviewCommand(action: "copy" | "save") {
    await postToWebview(this.panel.webview, { type: "imagePreviewCommand", action })
  }

  async push(force?: boolean, reason?: string) {
    if (!this.ready || this.state.disposed) {
      return
    }

    if (!force && this.current) {
      await this.post(this.current, reason || "push:cached")
      return
    }

    if (!this.pending) {
      const pending = this.refresh(reason || (force ? "push:forced" : "push:initial")).finally(() => {
        if (this.pending === pending) {
          this.pending = undefined
        }
      })
      this.pending = pending
    }

    await this.pending
    await this.flushSeedComposer()
  }

  dispose() {
    if (this.state.disposed) {
      return
    }

    this.state.disposed = true
    this.state.run += 1
    this.onDispose(this.key)
    vscode.Disposable.from(...this.bag).dispose()
  }

  async retarget(ref: SessionPanelRef, key: string) {
    this.refreshSeq += 1
    this.state.run += 1
    this.state.pendingSubmitCount = 0
    this.messageLimit = DEFAULT_SESSION_MESSAGE_LIMIT
    this.pending = undefined
    this.pendingComposerParts = undefined
    this.pendingComposerFocus = false
    this.current = undefined
    this.incrementalReady = false
    this.deferredDirty = {
      sessionStatus: false,
      permissions: false,
      questions: false,
    }
    this.ref = ref
    this.key = key
    this.panel.title = panelTitle(ref.sessionId)
    this.panel.iconPath = panelIconPath(this.extensionUri)
    await this.push(true, "retarget")
  }

  private async refresh(reason: string) {
    const seq = ++this.refreshSeq
    const currentAtStart = this.current
    this.incrementalReady = false
    this.deferredDirty = {
      sessionStatus: false,
      permissions: false,
      questions: false,
    }
    const build = await buildSessionSnapshot({
      ref: this.ref,
      mgr: this.mgr,
      log: (message) => {
        this.log(message)
      },
      isSubmitting: () => this.isSubmitting(),
      messageLimit: this.messageLimit,
    })
    // Snapshot build returns the core session payload immediately, while status,
    // permission, question, MCP, LSP, and command data arrives through the
    // deferred path. Seed those deferred fields from the current snapshot first
    // so the webview does not briefly fall back to empty defaults during a
    // forced refresh.
    const payload = this.seedDeferredFields(
      preserveIncrementalTranscript(build.snapshot, currentAtStart, this.current),
    )
    this.current = payload
    await this.post(payload, `${reason}:snapshot`)
    this.incrementalReady = true

    if (!build.deferred || payload.status !== "ready") {
      return
    }

    void build.deferred
      .then(async (deferred) => {
        if (this.state.disposed || this.refreshSeq !== seq || !this.current || this.current.status !== "ready") {
          return
        }

        const deferredPayload = {
          sessionStatus: this.deferredDirty.sessionStatus ? this.current.sessionStatus : deferred.sessionStatus,
          permissions: this.deferredDirty.permissions ? this.current.permissions : deferred.permissions,
          questions: this.deferredDirty.questions ? this.current.questions : deferred.questions,
          mcp: deferred.mcp,
          mcpResources: deferred.mcpResources,
          lsp: deferred.lsp,
          commands: deferred.commands,
        }
        this.current = patch({
          ...this.current,
          ...deferredPayload,
        })
        this.panel.iconPath = panelIconPath(this.extensionUri)
        await this.postDeferred(deferredPayload, `${reason}:deferred`)
        this.incrementalReady = true
      })
      .catch(() => {
        if (this.state.disposed || this.refreshSeq !== seq) {
          return
        }
      })
  }

  private async post(payload: SessionSnapshot, reason: string) {
    this.panel.title = panelTitle(payload.session?.title || this.ref.sessionId)
    this.panel.iconPath = panelIconPath(this.extensionUri)
    await postToWebview(this.panel.webview, {
      type: "bootstrap",
      payload: boot(payload),
    })
    await postToWebview(this.panel.webview, {
      type: "snapshot",
      payload,
      reason,
    })
  }

  private async postDeferred(payload: Extract<HostMessage, { type: "deferredUpdate" }>["payload"], reason: string) {
    await postToWebview(this.panel.webview, {
      type: "deferredUpdate",
      payload,
      reason,
    })
  }

  private async postSubmitting(value: boolean) {
    await postToWebview(this.panel.webview, {
      type: "submitting",
      value,
    })
  }

  private async postEvent(message: Extract<HostMessage, { type: "sessionEvent" }>) {
    await postToWebview(this.panel.webview, message)
  }

  private async postSessionPicker() {
    const payload = await vscode.commands.executeCommand<Extract<HostMessage, { type: "sessionPicker" }>["payload"] | undefined>(
      "opencode-ui.getSessionPickerPayload",
      this.ref,
      this.current?.relatedSessionIds ?? [this.ref.sessionId],
    )

    if (!payload) {
      return
    }

    await postToWebview(this.panel.webview, {
      type: "sessionPicker",
      payload,
    })
  }

  async flushSeedComposer() {
    if (this.state.disposed || !this.ready || !this.pendingComposerParts?.length) {
      return
    }

    const parts = this.pendingComposerParts
    this.pendingComposerParts = undefined
    await postToWebview(this.panel.webview, {
      type: "restoreComposer",
      parts,
    })
  }

  async flushComposerFocus() {
    if (this.state.disposed || !this.ready || !this.pendingComposerFocus) {
      return
    }

    this.pendingComposerFocus = false
    await postToWebview(this.panel.webview, {
      type: "focusComposer",
    })
  }

  private isSubmitting() {
    return this.state.pendingSubmitCount > 0
  }

  private async handle(event: SessionEvent) {
    if (this.state.disposed || !this.ready) {
      return
    }

    this.logRelevantEvent(event)
    this.markDeferredDirty(event)

    if (this.current && needsRefresh(event, this.current)) {
      await this.push(true, refreshReason(event, this.current))
      return
    }

    if (!this.current || this.current.status !== "ready") {
      return
    }

    const next = reduce(this.current, event)
    if (!next) {
      return
    }

    this.current = patch(next)
    this.panel.title = panelTitle(this.current.session?.title || this.ref.sessionId)
    this.panel.iconPath = panelIconPath(this.extensionUri)
    if (canPostIncrementalSessionEvent(event) && (this.incrementalReady || canPostDuringRefresh(event, this.pending))) {
      await this.postEvent({ type: "sessionEvent", event })
      return
    }

    await this.post(this.current, `event:${event.type}:snapshot`)
  }

  private log(message: string) {
    this.out.appendLine(`[panel ${this.key}] ${message}`)
  }

  private logRelevantEvent(event: SessionEvent) {
    const summary = summarizePanelEvent(this.ref.sessionId, event)
    if (!summary) {
      return
    }

    this.log(summary)
  }

  private seedDeferredFields(snapshot: SessionSnapshot) {
    if (!this.current || this.current.status !== "ready" || snapshot.status !== "ready") {
      return snapshot
    }

    // Only carry over fields that are loaded by loadDeferredSnapshot(). The new
    // snapshot already contains the latest transcript/session tree data.
    return patch({
      ...snapshot,
      sessionStatus: this.current.sessionStatus,
      permissions: this.current.permissions,
      questions: this.current.questions,
      mcp: this.current.mcp,
      mcpResources: this.current.mcpResources,
      lsp: this.current.lsp,
      commands: this.current.commands,
    })
  }

  private markDeferredDirty(event: SessionEvent) {
    if (event.type === "session.status") {
      this.deferredDirty.sessionStatus = true
      return
    }

    if (event.type === "permission.asked" || event.type === "permission.replied") {
      this.deferredDirty.permissions = true
      return
    }

    if (event.type === "question.asked" || event.type === "question.replied" || event.type === "question.rejected") {
      this.deferredDirty.questions = true
    }
  }

  private actionContext() {
    return {
      ref: this.ref,
      mgr: this.mgr,
      panel: this.panel,
      state: this.state,
      log: (message: string) => {
        this.log(message)
      },
      push: (force?: boolean) => this.push(force, force ? "action:forced" : "action"),
      syncSubmitting: async () => {
        if (!this.current) {
          return
        }
        this.current = patch({
          ...this.current,
          submitting: this.isSubmitting(),
        })
        await this.postSubmitting(this.current.submitting)
      },
    }
  }
}

export function preserveIncrementalTranscript(
  snapshot: SessionSnapshot,
  currentAtStart: SessionSnapshot | undefined,
  currentNow: SessionSnapshot | undefined,
) {
  if (!currentAtStart || !currentNow || currentNow === currentAtStart) {
    return snapshot
  }

  if (currentAtStart.status !== "ready" || currentNow.status !== "ready" || snapshot.status !== "ready") {
    return snapshot
  }

  return patch({
    ...snapshot,
    messages: currentNow.messages,
    childMessages: currentNow.childMessages,
    agentMode: currentNow.agentMode,
  })
}

function canPostIncrementalSessionEvent(event: SessionEvent) {
  return event.type === "session.diff"
    || event.type === "session.status"
    || event.type === "todo.updated"
    || event.type === "session.created"
    || event.type === "session.updated"
    || event.type === "session.deleted"
    || event.type === "message.updated"
    || event.type === "message.removed"
    || event.type === "message.part.updated"
    || event.type === "message.part.removed"
    || event.type === "message.part.delta"
    || event.type === "permission.asked"
    || event.type === "permission.replied"
    || event.type === "question.asked"
    || event.type === "question.replied"
    || event.type === "question.rejected"
}

function summarizePanelEvent(sessionId: string, event: SessionEvent) {
  if (event.type === "session.error") {
    const props = event.properties as { sessionID?: string; error?: { name?: string } }
    if (props.sessionID !== sessionId) {
      return undefined
    }

    return `event session.error session=${props.sessionID} error=${props.error?.name || "unknown"}`
  }

  if (event.type === "session.status") {
    const props = event.properties as { sessionID: string; status: { type: string } }
    if (props.sessionID !== sessionId) {
      return undefined
    }

    return `event session.status session=${props.sessionID} status=${props.status?.type || "unknown"}`
  }

  if (event.type === "message.updated") {
    const props = event.properties as { info: { id: string; sessionID: string; role: string } }
    if (props.info.sessionID !== sessionId) {
      return undefined
    }

    return `event message.updated session=${props.info.sessionID} message=${props.info.id} role=${props.info.role}`
  }

  if (event.type === "message.part.updated") {
    const props = event.properties as { part: { sessionID: string; messageID: string; id: string; type: string } }
    if (props.part.sessionID !== sessionId) {
      return undefined
    }

    return `event message.part.updated session=${props.part.sessionID} message=${props.part.messageID} part=${props.part.id} partType=${props.part.type}`
  }

  return undefined
}

function canPostDuringRefresh(event: SessionEvent, pending: Promise<void> | undefined) {
  return !!pending && isTranscriptEvent(event)
}

function isTranscriptEvent(event: SessionEvent) {
  return event.type === "message.updated"
    || event.type === "message.removed"
    || event.type === "message.part.updated"
    || event.type === "message.part.removed"
    || event.type === "message.part.delta"
}

function refreshReason(event: SessionEvent, payload: SessionSnapshot) {
  if (payload.session?.parentID) {
    return `event:${event.type}:refresh:child-navigation`
  }

  if (event.type === "session.updated") {
    const props = event.properties as { info?: { id: string; parentID?: string } }
    if (props.info && !payload.relatedSessionIds.includes(props.info.id) && payload.relatedSessionIds.includes(props.info.parentID ?? "")) {
      return `event:${event.type}:refresh:reparent-in`
    }
  }

  return `event:${event.type}:refresh`
}
