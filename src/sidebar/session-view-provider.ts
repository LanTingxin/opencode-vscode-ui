import * as vscode from "vscode"
import { postToWebview } from "../bridge/host"
import type { HostMessage, SessionPanelRef, SessionSnapshot, WebviewMessage } from "../bridge/types"
import { affectsDisplaySettings } from "../core/settings"
import { EventHub } from "../core/events"
import type { SessionEvent } from "../core/sdk"
import { DEFAULT_NEW_SESSION_TITLE } from "../core/session-titles"
import { WorkspaceManager } from "../core/workspace"
import { FocusedSessionStore } from "./focused"
import { sessionPanelHtml } from "../panel/html"
import { buildSessionSnapshot, patch } from "../panel/provider/snapshot"
import { needsRefresh, reduce } from "../panel/provider/reducer"
import { rejectQuestion, replyPermission, replyQuestion, runComposerAction, runShellCommand, runSlashCommand, submit, toggleMcp, type PanelActionState } from "../panel/provider/actions"
import { openFile, resolveFileRefs, searchFiles } from "../panel/provider/files"
import { boot } from "../panel/provider/utils"

export class SessionViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly bag: vscode.Disposable[] = []
  private view: vscode.WebviewView | undefined
  private ready = false
  private incrementalReady = false
  private pending: Promise<void> | undefined
  private current: SessionSnapshot | undefined
  private currentRef: SessionPanelRef | undefined
  private refreshSeq = 0
  private deferredDirty = {
    sessionStatus: false,
    permissions: false,
    questions: false,
  }
  private readonly state: PanelActionState = {
    disposed: false,
    run: 0,
    pendingSubmitCount: 0,
  }

  constructor(
    private extensionUri: vscode.Uri,
    private mgr: WorkspaceManager,
    private events: EventHub,
    private focused: FocusedSessionStore,
    private out: vscode.OutputChannel,
  ) {
    this.bag.push(
      this.focused.onDidChange(() => {
        const snap = this.focused.snapshot()
        const ref = snap.ref
        if (sameRef(ref, this.currentRef)) {
          return
        }
        this.switchSession(ref)
      }),
      this.events.onDidEvent((item) => {
        void this.handleEvent(item.workspaceId, item.event)
      }),
      this.mgr.onDidChange(() => {
        if (!this.currentRef) {
          void this.autoResolve()
          return
        }
        void this.push(true, "workspace:change")
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!affectsDisplaySettings(event)) {
          return
        }
        void this.push(true, "config:display")
      }),
    )
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
    }
    view.webview.html = sessionPanelHtml(view.webview, this.extensionUri, this.currentRef)

    view.webview.onDidReceiveMessage((message: WebviewMessage) => {
      this.onMessage(message)
    }, undefined, this.bag)

    view.onDidChangeVisibility(() => {
      if (view.visible && this.ready && this.current) {
        void this.post(this.current, "visibility:restored")
      }
    }, undefined, this.bag)

    if (!this.currentRef) {
      void this.autoResolve()
    }
  }

  dispose() {
    this.state.disposed = true
    this.state.run += 1
    vscode.Disposable.from(...this.bag).dispose()
  }

  private switchSession(ref: SessionPanelRef | undefined) {
    this.currentRef = ref
    this.current = undefined
    this.ready = false
    this.incrementalReady = false
    this.refreshSeq += 1
    this.deferredDirty = { sessionStatus: false, permissions: false, questions: false }
    this.state.run += 1
    this.state.pendingSubmitCount = 0

    if (this.view) {
      this.view.webview.html = sessionPanelHtml(this.view.webview, this.extensionUri, ref)
    }
  }

  private async autoResolve() {
    if (this.currentRef || this.state.disposed) {
      return
    }

    const rt = this.mgr.list().find((r) => r.state === "ready" && r.sdk)
    if (!rt || !rt.sdk) {
      return
    }

    try {
      const res = await rt.sdk.session.list({ directory: rt.dir, roots: true })
      if (this.currentRef || this.state.disposed) {
        return
      }

      const sessions = (res.data ?? []).sort((a, b) => b.time.updated - a.time.updated)
      let sessionId: string

      if (sessions.length > 0) {
        sessionId = sessions[0].id
      } else {
        const created = await rt.sdk.session.create({ directory: rt.dir, title: DEFAULT_NEW_SESSION_TITLE })
        if (this.currentRef || this.state.disposed || !created.data) {
          return
        }
        sessionId = created.data.id
      }

      if (this.currentRef || this.state.disposed) {
        return
      }

      this.switchSession({ workspaceId: rt.workspaceId, dir: rt.dir, sessionId })
    } catch (err) {
      this.log(`autoResolve failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private onMessage(message: WebviewMessage) {
    if (message?.type === "ready") {
      this.ready = true
      void this.push(false, "webview:ready")
      return
    }

    if (message?.type === "refresh") {
      void this.push(true, "webview:refresh")
      return
    }

    if (!this.currentRef) {
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
      void vscode.commands.executeCommand("opencode-ui.openSessionById", this.currentRef, message.sessionID)
      return
    }

    if (message?.type === "newSession") {
      void vscode.commands.executeCommand("opencode-ui.newSessionAndOpen", this.currentRef)
      return
    }

    if (message?.type === "openFile") {
      void openFile(this.currentRef, message.filePath, message.line)
      return
    }

    if (message?.type === "resolveFileRefs") {
      if (!this.view) {
        return
      }
      void resolveFileRefs(this.view.webview, this.currentRef, message.refs)
      return
    }

    if (message?.type === "searchFiles") {
      if (!this.view) {
        return
      }
      void searchFiles(this.view.webview, this.mgr, this.currentRef.workspaceId, message.requestID, message.query)
      return
    }

    if (message?.type === "openDocs") {
      if (message.target === "providers") {
        void vscode.commands.executeCommand("opencode-ui.openProviderDocs")
      }
      return
    }

    if (message?.type === "toggleMcp") {
      void toggleMcp(this.actionContext(), message.name, message.action)
      return
    }

    if (message?.type === "composerAction") {
      void runComposerAction(this.actionContext(), message.action, message.model)
      return
    }

    if (message?.type === "runSlashCommand") {
      void runSlashCommand(this.actionContext(), message.command, message.arguments, message.agent, message.model, message.variant, message.parts)
      return
    }

    if (message?.type === "runShellCommand") {
      void runShellCommand(this.actionContext(), message.command, message.agent, message.model, message.variant)
    }
  }

  private async push(force?: boolean, reason?: string) {
    if (!this.ready || this.state.disposed || !this.currentRef) {
      return
    }

    if (!force && this.current) {
      await this.post(this.current, reason || "push:cached")
      return
    }

    if (!this.pending) {
      this.pending = this.refresh(reason || (force ? "push:forced" : "push:initial")).finally(() => {
        this.pending = undefined
      })
    }

    await this.pending
  }

  private async refresh(reason: string) {
    if (!this.currentRef) {
      return
    }

    const ref = this.currentRef
    const seq = ++this.refreshSeq
    this.incrementalReady = false
    this.deferredDirty = { sessionStatus: false, permissions: false, questions: false }

    const build = await buildSessionSnapshot({
      ref,
      mgr: this.mgr,
      log: (message) => {
        this.log(message)
      },
      isSubmitting: () => this.isSubmitting(),
    })

    if (this.state.disposed || this.refreshSeq !== seq || !sameRef(this.currentRef, ref)) {
      return
    }

    const payload = this.seedDeferredFields(build.snapshot)
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
        await this.postDeferred(deferredPayload, `${reason}:deferred`)
        this.incrementalReady = true
      })
      .catch(() => {
        // swallow deferred failures
      })
  }

  private async post(payload: SessionSnapshot, reason: string) {
    if (!this.view) {
      return
    }

    const webview = this.view.webview
    await postToWebview(webview, { type: "bootstrap", payload: boot(payload) })
    await postToWebview(webview, { type: "snapshot", payload, reason })
  }

  private async postDeferred(payload: Extract<HostMessage, { type: "deferredUpdate" }>["payload"], reason: string) {
    if (!this.view) {
      return
    }

    await postToWebview(this.view.webview, { type: "deferredUpdate", payload, reason })
  }

  private async postSubmitting(value: boolean) {
    if (!this.view) {
      return
    }

    await postToWebview(this.view.webview, { type: "submitting", value })
  }

  private async postEvent(message: Extract<HostMessage, { type: "sessionEvent" }>) {
    if (!this.view) {
      return
    }

    await postToWebview(this.view.webview, message)
  }

  private async handleEvent(workspaceId: string, event: SessionEvent) {
    if (this.state.disposed || !this.ready || !this.currentRef) {
      return
    }

    if (workspaceId !== this.currentRef.workspaceId) {
      return
    }

    this.markDeferredDirty(event)

    if (this.current && needsRefresh(event, this.current)) {
      await this.push(true, `event:${event.type}:refresh`)
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
    if (this.incrementalReady && canPostIncrementalSessionEvent(event)) {
      await this.postEvent({ type: "sessionEvent", event })
      return
    }

    await this.post(this.current, `event:${event.type}:snapshot`)
  }

  private seedDeferredFields(snapshot: SessionSnapshot) {
    if (!this.current || this.current.status !== "ready" || snapshot.status !== "ready") {
      return snapshot
    }

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

  private isSubmitting() {
    return this.state.pendingSubmitCount > 0
  }

  private actionContext() {
    const ref = this.currentRef!
    const view = this.view!
    return {
      ref,
      mgr: this.mgr,
      panel: view as unknown as vscode.WebviewPanel,
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

  private log(message: string) {
    this.out.appendLine(`[session-view] ${message}`)
  }
}

function sameRef(a?: SessionPanelRef, b?: SessionPanelRef) {
  return a?.workspaceId === b?.workspaceId && a?.sessionId === b?.sessionId
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
