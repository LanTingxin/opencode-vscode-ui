import * as vscode from "vscode"
import type { SessionPanelRef } from "../bridge/types"

export function sessionPanelHtml(webview: vscode.Webview, ref?: SessionPanelRef) {
  const nonce = nonceText()
  const initialState = JSON.stringify(ref ?? null)

  return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <title>OpenCode Session</title>
    <style>
      :root {
        color-scheme: light dark;
        --border: var(--vscode-panel-border);
        --bg: var(--vscode-editor-background);
        --bg-soft: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-editorWidget-background) 10%);
        --bg-strong: color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-editorWidget-background) 16%);
        --muted: var(--vscode-descriptionForeground);
        --accent: var(--vscode-button-background);
        --accent-text: var(--vscode-button-foreground);
        --input-bg: var(--vscode-input-background);
        --input-fg: var(--vscode-input-foreground);
        --user-bg: color-mix(in srgb, var(--vscode-button-background) 18%, var(--vscode-editor-background) 82%);
        --assistant-bg: color-mix(in srgb, var(--vscode-editorWidget-background) 45%, var(--vscode-editor-background) 55%);
        --warning: var(--vscode-editorWarning-foreground);
        --error: var(--vscode-errorForeground);
      }

      * { box-sizing: border-box; }
      body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--bg); }
      button, textarea { font: inherit; }
      .app { height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
      .top { padding: 20px 24px 14px; border-bottom: 1px solid var(--border); background: var(--bg-soft); display: grid; gap: 14px; }
      .top-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .title-wrap { display: grid; gap: 8px; min-width: 0; }
      .title { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 600; }
      .summary { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
      .status { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); white-space: nowrap; font-size: 12px; }
      .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
      .meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .meta-card, .dock, .composer-box { min-width: 0; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); display: grid; gap: 8px; }
      .meta-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
      .meta-value { min-width: 0; font-size: 13px; line-height: 1.5; word-break: break-word; }
      .timeline { min-height: 0; overflow: auto; padding: 20px 24px 24px; }
      .timeline-body, .composer-body { max-width: 920px; margin: 0 auto; display: grid; gap: 14px; }
      .empty { min-height: 100%; display: grid; place-items: center; padding: 48px 12px; }
      .empty-card { width: min(100%, 540px); padding: 24px; border: 1px dashed var(--border); border-radius: 14px; background: var(--bg-soft); text-align: center; display: grid; gap: 10px; }
      .empty-title { margin: 0; font-size: 18px; }
      .empty-text, .dock-text, .help, .error, .part-meta, .part-empty, .time { margin: 0; color: var(--muted); line-height: 1.6; }
      .message { display: flex; }
      .message.user { justify-content: flex-end; }
      .message.assistant { justify-content: flex-start; }
      .bubble { width: min(100%, 780px); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; display: grid; gap: 10px; box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04); }
      .message.user .bubble { background: var(--user-bg); }
      .message.assistant .bubble { background: var(--assistant-bg); }
      .bubble-head, .part-head, .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .role, .part-kind, .dock-title { font-weight: 600; }
      .part { display: grid; gap: 8px; padding: 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--border) 85%, transparent 15%); background: color-mix(in srgb, var(--bg) 82%, transparent 18%); }
      .part-body { white-space: pre-wrap; word-break: break-word; line-height: 1.6; font-size: 13px; }
      .part-body.tool { font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
      .part-list, .dock-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
      .composer { border-top: 1px solid var(--border); background: var(--bg-soft); padding: 18px 24px 22px; }
      .composer-input, .answer-box { width: 100%; resize: vertical; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--input-bg); color: var(--input-fg); line-height: 1.6; }
      .composer-input { min-height: 112px; }
      .answer-box { min-height: 72px; }
      .actions, .opt-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .btn, .opt { appearance: none; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-strong); color: inherit; padding: 8px 12px; cursor: pointer; }
      .opt { border-radius: 999px; background: var(--bg); padding: 6px 10px; }
      .btn.primary, .opt.active { border-color: transparent; background: var(--accent); color: var(--accent-text); }
      .pill { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--border); font-size: 11px; color: var(--muted); }
      .btn:disabled, .composer-input:disabled, .answer-box:disabled { cursor: not-allowed; opacity: 0.6; }
      .error { color: var(--error); }
      @media (max-width: 720px) {
        .top, .timeline, .composer { padding-left: 16px; padding-right: 16px; }
        .meta { grid-template-columns: 1fr; }
        .top-main, .row { flex-direction: column; align-items: stretch; }
        .actions { justify-content: flex-end; }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <header class="top">
        <div class="top-main">
          <div class="title-wrap">
            <h1 id="title" class="title">OpenCode Session</h1>
            <p id="summary" class="summary">Waiting for host bootstrap.</p>
          </div>
          <div id="status" class="status"><span id="status-dot" class="status-dot"></span><span id="status-text">Connecting…</span></div>
        </div>
        <div class="meta">
          <div class="meta-card"><div class="meta-label">Workspace</div><div id="workspace" class="meta-value">-</div></div>
          <div class="meta-card"><div class="meta-label">Session ID</div><div id="session-id" class="meta-value">-</div></div>
          <div class="meta-card"><div class="meta-label">Directory</div><div id="directory" class="meta-value">-</div></div>
        </div>
      </header>
      <main class="timeline"><div id="timeline" class="timeline-body"></div></main>
      <footer class="composer"><div id="composer-body" class="composer-body"></div></footer>
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi()
      const initialState = ${initialState}
      const state = {
        bootstrap: {
          status: "loading",
          workspaceName: initialState?.dir ? initialState.dir.split(/[\\/]/).pop() || initialState.dir : "-",
          sessionRef: initialState || { dir: "-", sessionId: "-" },
          session: undefined,
          message: "Waiting for workspace server and session metadata.",
        },
        snapshot: {
          messages: [],
          sessionStatus: undefined,
          submitting: false,
          todos: [],
          permissions: [],
          questions: [],
        },
        form: {
          selected: {},
          custom: {},
        },
        draft: "",
        error: "",
      }

      const titleEl = document.getElementById("title")
      const summaryEl = document.getElementById("summary")
      const statusEl = document.getElementById("status")
      const statusDotEl = document.getElementById("status-dot")
      const statusTextEl = document.getElementById("status-text")
      const workspaceEl = document.getElementById("workspace")
      const sessionIdEl = document.getElementById("session-id")
      const directoryEl = document.getElementById("directory")
      const timelineEl = document.getElementById("timeline")
      const composerBodyEl = document.getElementById("composer-body")

      if (initialState) vscode.setState(initialState)

      const esc = (value) => String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;")

      const fmtTime = (value) => {
        if (typeof value !== "number") return ""
        try { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } catch { return "" }
      }

      const blocked = () => state.snapshot.permissions.length > 0 || state.snapshot.questions.length > 0
      const firstPermission = () => state.snapshot.permissions[0]
      const firstQuestion = () => state.snapshot.questions[0]

      function statusInfo() {
        const boot = state.bootstrap
        const snap = state.snapshot
        if (boot.status === "error") return { text: "Connection error", color: "var(--error)" }
        if (boot.status !== "ready") return { text: "Connecting", color: "var(--muted)" }
        if (snap.permissions.length > 0) return { text: "Permission needed", color: "var(--warning)" }
        if (snap.questions.length > 0) return { text: "Question needed", color: "var(--warning)" }
        if (snap.submitting) return { text: "Sending", color: "var(--accent)" }
        if (snap.sessionStatus?.type === "busy") return { text: "Responding", color: "var(--accent)" }
        if (snap.sessionStatus?.type === "retry") return { text: "Retrying", color: "var(--warning)" }
        return { text: "Ready", color: "var(--accent)" }
      }

      function partTitle(part) {
        if (part.type === "text") return part.synthetic ? "Context" : "Text"
        if (part.type === "reasoning") return "Reasoning"
        if (part.type === "tool") return part.tool || "Tool"
        if (part.type === "file") return part.filename || "Attachment"
        if (part.type === "step-start") return "Step started"
        if (part.type === "step-finish") return "Step finished"
        if (part.type === "snapshot") return "Snapshot"
        if (part.type === "patch") return "Patch"
        if (part.type === "agent") return "Agent"
        if (part.type === "retry") return "Retry"
        if (part.type === "compaction") return "Compaction"
        if (part.type === "subtask") return "Subtask"
        return part.type || "Part"
      }

      function partMeta(part) {
        if (part.type === "tool") return esc(part.state?.status || "pending")
        if (part.type === "file") return esc(part.mime || "file")
        return ""
      }

      function partBody(part) {
        if (part.type === "text") return '<div class="part-body">' + esc(part.text || "") + '</div>'
        if (part.type === "reasoning") return '<div class="part-body">' + esc(part.text || "") + '</div>'
        if (part.type === "tool") {
          const lines = []
          if (part.state?.title) lines.push(part.state.title)
          if (part.state?.output) lines.push(part.state.output)
          if (part.state?.error) lines.push(part.state.error)
          if (lines.length === 0) lines.push(JSON.stringify(part.state?.metadata || {}, null, 2))
          return '<div class="part-body tool">' + esc(lines.join("\\n\\n")) + '</div>'
        }
        if (part.type === "file") {
          const items = []
          if (part.filename) items.push('<li>' + esc(part.filename) + '</li>')
          if (part.url) items.push('<li>' + esc(part.url) + '</li>')
          return '<ul class="part-list">' + items.join("") + '</ul>'
        }
        if (part.type === "subtask") return '<div class="part-body">' + esc(part.description || part.prompt || "") + '</div>'
        if (part.type === "patch") {
          const files = Array.isArray(part.files) ? part.files : []
          return files.length ? '<ul class="part-list">' + files.map((file) => '<li>' + esc(file) + '</li>').join("") + '</ul>' : '<div class="part-empty">Patch created.</div>'
        }
        if (part.type === "agent") return '<div class="part-body">' + esc(part.name || "Agent task") + '</div>'
        if (part.type === "snapshot") return '<div class="part-body">' + esc(part.snapshot || "Workspace snapshot updated.") + '</div>'
        if (part.type === "retry") return '<div class="part-body">' + esc(part.error?.message || part.error || "Retry requested.") + '</div>'
        if (part.type === "compaction") return '<div class="part-body">' + esc(part.auto ? "Automatic compaction completed." : "Compaction completed.") + '</div>'
        return '<div class="part-empty">' + esc(partTitle(part)) + '</div>'
      }

      function renderParts(parts) {
        if (!Array.isArray(parts) || parts.length === 0) return '<div class="part part-empty">No message parts yet.</div>'
        return parts.map((part) => [
          '<section class="part">',
          '<div class="part-head"><span class="part-kind">' + esc(partTitle(part)) + '</span><span class="part-meta">' + partMeta(part) + '</span></div>',
          partBody(part),
          '</section>',
        ].join("")).join("")
      }

      function renderTimeline() {
        const boot = state.bootstrap
        const messages = Array.isArray(state.snapshot.messages) ? state.snapshot.messages : []
        if (boot.status === "error") {
          timelineEl.innerHTML = '<div class="empty"><div class="empty-card"><h2 class="empty-title">Session unavailable</h2><p class="empty-text">' + esc(boot.message || "The workspace runtime is not ready.") + '</p></div></div>'
          return
        }
        if (boot.status !== "ready" && messages.length === 0) {
          timelineEl.innerHTML = '<div class="empty"><div class="empty-card"><h2 class="empty-title">Connecting to workspace</h2><p class="empty-text">' + esc(boot.message || "Waiting for workspace runtime.") + '</p></div></div>'
          return
        }
        if (messages.length === 0) {
          timelineEl.innerHTML = '<div class="empty"><div class="empty-card"><h2 class="empty-title">Start this session</h2><p class="empty-text">Send a message below. When the session asks for confirmation or answers, the bottom panel will switch into a blocked state.</p></div></div>'
          return
        }
        timelineEl.innerHTML = messages.map((entry) => {
          const role = entry.info?.role || "assistant"
          const time = fmtTime(entry.info?.time?.created)
          const label = role === "user" ? "You" : entry.info?.agent || "OpenCode"
          return [
            '<article class="message ' + esc(role) + '">',
            '<div class="bubble">',
            '<div class="bubble-head"><span class="role">' + esc(label) + '</span><span class="time">' + esc(time) + '</span></div>',
            renderParts(entry.parts),
            '</div>',
            '</article>',
          ].join("")
        }).join("")
      }

      function renderTodo() {
        if (blocked() || !state.snapshot.todos.length) return ''
        return [
          '<section class="dock">',
          '<div class="dock-title">Todo</div>',
          '<div class="dock-list">',
          state.snapshot.todos.map((item) => '<div><div>' + esc(item.content || '') + '</div><div class="actions"><span class="pill">' + esc(item.status || 'pending') + '</span><span class="pill">' + esc(item.priority || 'medium') + '</span></div></div>').join(''),
          '</div>',
          '</section>',
        ].join('')
      }

      function renderPermission() {
        const req = firstPermission()
        if (!req) return ''
        return [
          '<section class="dock">',
          '<div class="dock-title">Permission required</div>',
          '<p class="dock-text">OpenCode is waiting for approval before it continues.</p>',
          '<div><strong>' + esc(req.permission || 'permission') + '</strong></div>',
          '<div class="actions">' + (req.patterns || []).map((item) => '<span class="pill">' + esc(item) + '</span>').join('') + '</div>',
          '<div class="actions">',
          '<button class="btn" data-permission-reply="reject" data-request-id="' + esc(req.id) + '">Reject</button>',
          '<button class="btn" data-permission-reply="once" data-request-id="' + esc(req.id) + '">Allow once</button>',
          '<button class="btn primary" data-permission-reply="always" data-request-id="' + esc(req.id) + '">Always allow</button>',
          '</div>',
          '</section>',
        ].join('')
      }

      function renderQuestion() {
        const req = firstQuestion()
        if (!req) return ''
        return [
          '<section class="dock">',
          '<div class="dock-title">Question pending</div>',
          '<p class="dock-text">OpenCode needs your answer before it can continue.</p>',
          (req.questions || []).map((item, index) => {
            const key = req.id + ':' + index
            const selected = state.form.selected[key] || []
            const custom = state.form.custom[key] || ''
            return [
              '<div class="dock">',
              '<div><strong>' + esc(item.header || 'Question') + '</strong></div>',
              '<p class="dock-text">' + esc(item.question || '') + '</p>',
              '<div class="opt-row">',
              (item.options || []).map((opt) => '<button class="opt ' + (selected.includes(opt.label) ? 'active' : '') + '" data-question-option="1" data-request-id="' + esc(req.id) + '" data-index="' + index + '" data-label="' + esc(opt.label) + '" data-multiple="' + (item.multiple ? '1' : '0') + '">' + esc(opt.label) + '</button>').join(''),
              '</div>',
              item.custom === false ? '' : '<textarea class="answer-box" data-question-custom="1" data-request-id="' + esc(req.id) + '" data-index="' + index + '" placeholder="Optional custom answer">' + esc(custom) + '</textarea>',
              '</div>',
            ].join('')
          }).join(''),
          '<div class="actions">',
          '<button class="btn" data-question-reject="1" data-request-id="' + esc(req.id) + '">Reject</button>',
          '<button class="btn primary" data-question-submit="1" data-request-id="' + esc(req.id) + '">Submit answers</button>',
          '</div>',
          '</section>',
        ].join('')
      }

      function renderComposer() {
        return [
          renderPermission(),
          renderQuestion(),
          renderTodo(),
          '<section class="composer-box">',
          '<textarea id="composer" class="composer-input" placeholder="Ask OpenCode to inspect, explain, or change this workspace.">' + esc(state.draft) + '</textarea>',
          '<div class="row">',
          '<div id="composer-help" class="help"></div>',
          '<div class="actions"><button id="refresh" class="btn" type="button">Refresh</button><button id="send" class="btn primary" type="button">Send</button></div>',
          '</div>',
          '<div id="error" class="help error"></div>',
          '</section>',
        ].join('')
      }

      function collectAnswers(req) {
        return req.questions.map((item, index) => {
          const key = req.id + ':' + index
          const base = state.form.selected[key] || []
          const custom = (state.form.custom[key] || '').trim()
          return custom ? [...base, custom] : base
        })
      }

      function render() {
        const boot = state.bootstrap
        const snap = state.snapshot
        const info = statusInfo()
        const title = boot.session?.title || (boot.sessionRef?.sessionId ? boot.sessionRef.sessionId.slice(0, 8) : 'session')
        titleEl.textContent = 'OpenCode: ' + title
        summaryEl.textContent = boot.message || 'Session ready.'
        workspaceEl.textContent = boot.workspaceName || '-'
        sessionIdEl.textContent = boot.sessionRef?.sessionId || '-'
        directoryEl.textContent = boot.sessionRef?.dir || '-'
        statusTextEl.textContent = info.text
        statusDotEl.style.background = info.color
        statusEl.setAttribute('aria-label', info.text)
        renderTimeline()
        composerBodyEl.innerHTML = renderComposer()

        const input = document.getElementById('composer')
        const help = document.getElementById('composer-help')
        const refresh = document.getElementById('refresh')
        const send = document.getElementById('send')
        const err = document.getElementById('error')
        const busy = boot.status !== 'ready' || snap.submitting || snap.sessionStatus?.type === 'busy' || snap.sessionStatus?.type === 'retry'
        input.disabled = boot.status !== 'ready' || snap.submitting || blocked()
        refresh.disabled = boot.status !== 'ready'
        send.disabled = boot.status !== 'ready' || snap.submitting || blocked() || !state.draft.trim()
        help.textContent = blocked()
          ? 'Answer the pending request below before sending another message.'
          : busy
            ? 'Waiting for the current response to settle. Ctrl/Cmd+Enter sends when ready.'
            : 'Enter for newline. Ctrl/Cmd+Enter to send.'
        err.textContent = state.error || ''
        bind()
      }

      function submit() {
        const text = state.draft.trim()
        if (!text || blocked()) return
        state.error = ''
        state.draft = ''
        vscode.postMessage({ type: 'submit', text })
        render()
      }

      function bind() {
        const input = document.getElementById('composer')
        const refresh = document.getElementById('refresh')
        const send = document.getElementById('send')
        input.oninput = (event) => {
          state.draft = event.currentTarget.value
          render()
        }
        input.onkeydown = (event) => {
          if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
          event.preventDefault()
          submit()
        }
        refresh.onclick = () => {
          state.error = ''
          vscode.postMessage({ type: 'refresh' })
        }
        send.onclick = () => submit()

        document.querySelectorAll('[data-permission-reply]').forEach((el) => {
          el.onclick = () => {
            state.error = ''
            vscode.postMessage({
              type: 'permissionReply',
              requestID: el.getAttribute('data-request-id'),
              reply: el.getAttribute('data-permission-reply'),
            })
          }
        })

        document.querySelectorAll('[data-question-option]').forEach((el) => {
          el.onclick = () => {
            const key = el.getAttribute('data-request-id') + ':' + el.getAttribute('data-index')
            const value = el.getAttribute('data-label') || ''
            const multiple = el.getAttribute('data-multiple') === '1'
            const cur = state.form.selected[key] || []
            state.form.selected[key] = multiple
              ? (cur.includes(value) ? cur.filter((item) => item !== value) : [...cur, value])
              : [value]
            render()
          }
        })

        document.querySelectorAll('[data-question-custom]').forEach((el) => {
          el.oninput = (event) => {
            const key = el.getAttribute('data-request-id') + ':' + el.getAttribute('data-index')
            state.form.custom[key] = event.currentTarget.value
          }
        })

        document.querySelectorAll('[data-question-submit]').forEach((el) => {
          el.onclick = () => {
            const req = firstQuestion()
            if (!req) return
            state.error = ''
            vscode.postMessage({
              type: 'questionReply',
              requestID: el.getAttribute('data-request-id'),
              answers: collectAnswers(req),
            })
          }
        })

        document.querySelectorAll('[data-question-reject]').forEach((el) => {
          el.onclick = () => {
            state.error = ''
            vscode.postMessage({
              type: 'questionReject',
              requestID: el.getAttribute('data-request-id'),
            })
          }
        })
      }

      window.addEventListener('message', (event) => {
        const message = event.data
        if (message?.type === 'bootstrap') {
          state.bootstrap = message.payload
          state.error = ''
          render()
          return
        }
        if (message?.type === 'snapshot') {
          state.bootstrap = {
            status: message.payload.status,
            workspaceName: message.payload.workspaceName,
            sessionRef: message.payload.sessionRef,
            session: message.payload.session,
            message: message.payload.message,
          }
          state.snapshot = {
            messages: Array.isArray(message.payload.messages) ? message.payload.messages : [],
            sessionStatus: message.payload.sessionStatus,
            submitting: !!message.payload.submitting,
            todos: Array.isArray(message.payload.todos) ? message.payload.todos : [],
            permissions: Array.isArray(message.payload.permissions) ? message.payload.permissions : [],
            questions: Array.isArray(message.payload.questions) ? message.payload.questions : [],
          }
          state.error = ''
          render()
          return
        }
        if (message?.type === 'error') {
          state.error = message.message || 'Unknown error'
          render()
        }
      })

      render()
      vscode.postMessage({ type: 'ready' })
    </script>
  </body>
</html>`
}

function nonceText() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""

  for (let i = 0; i < 32; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }

  return result
}
