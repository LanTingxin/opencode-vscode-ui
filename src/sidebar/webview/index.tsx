import React from "react"
import { createRoot } from "react-dom/client"
import type { SidebarHostMessage, SidebarViewMode, SidebarViewState, SidebarWebviewMessage, TaskFilter } from "../view-types"
import type { SessionPanelRef } from "../../bridge/types"
import type { Todo } from "../../core/sdk"
import "./styles.css"

declare global {
  interface Window {
    __OPENCODE_SIDEBAR_MODE__?: SidebarViewMode
  }
}

type VsCodeApi = {
  postMessage(message: SidebarWebviewMessage): void
}

type GlobalWithVsCodeApi = typeof globalThis & {
  acquireVsCodeApi?: () => VsCodeApi
}

const vscodeGlobal = globalThis as GlobalWithVsCodeApi

const vscode: VsCodeApi = typeof vscodeGlobal.acquireVsCodeApi === "function"
  ? vscodeGlobal.acquireVsCodeApi()
  : { postMessage() {} }
const mode = typeof window !== "undefined" && window.__OPENCODE_SIDEBAR_MODE__ === "diff" ? "diff" : "todo"

const initialState: SidebarViewState = {
  status: "idle",
  mode,
  todos: [],
  diff: [],
}

function App() {
  const [state, setState] = React.useState<SidebarViewState>(initialState)

  React.useEffect(() => {
    const handler = (event: MessageEvent<SidebarHostMessage>) => {
      if (event.data?.type === "state") {
        setState(event.data.payload)
      }
    }

    window.addEventListener("message", handler)
    vscode.postMessage({ type: "ready" })
    return () => window.removeEventListener("message", handler)
  }, [])

  return (
    <div className="sv-shell">
      {state.status === "idle" ? <Empty title="No active session" text={mode === "todo" ? "Focus an OpenCode session tab to view todos" : "Focus an OpenCode session tab to view changed files"} /> : null}
      {state.status === "loading" ? <Empty title={mode === "todo" ? "Loading todos..." : "Loading modified files..."} text="From focused session" /> : null}
      {state.status === "error" ? <Empty title="Unavailable" text={state.error || "Failed to load view"} /> : null}
      {state.status === "ready" && mode === "todo" ? <TodoList state={state} /> : null}
      {state.status === "ready" && mode === "diff" ? <DiffList state={state} /> : null}
    </div>
  )
}

function TodoList({ state }: { state: SidebarViewState }) {
  const [filter, setFilter] = React.useState<TaskFilter>("all")
  const view = buildTaskPanelView({
    todos: state.todos,
    filter,
  })

  if (state.todos.length === 0) {
    return <Empty title="No todos yet" text="Tasks from the focused session will appear here" />
  }

  return (
    <section className="sv-group">
      <div className="sv-taskSummary">
        <div className="sv-taskSummaryCounts">
          <span>{view.summary.total} total</span>
          <span>{view.summary.open} open</span>
          <span>{view.summary.inProgress} in progress</span>
          <span>{view.summary.completed} completed</span>
        </div>
        <div className="sv-taskFilters" role="tablist" aria-label="Task filter">
          {(["all", "open", "completed"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`sv-taskFilter${filter === item ? " is-active" : ""}`}
              onClick={() => setFilter(item)}
            >
              {taskFilterLabel(item)}
            </button>
          ))}
        </div>
      </div>
      {view.sections.length === 0 ? <Empty title="No matching tasks" text="Try a different filter" /> : null}
      {view.sections.map((section) => (
        <div key={section.id} className="sv-taskSection">
          <div className="sv-taskSectionTitle">{section.label}</div>
          <div className="sv-list">
            {section.items.map((item, index) => (
              <button
                key={`${section.id}-${item.content}-${index}`}
                type="button"
                className={`sv-todo sv-todo-${item.status}${state.sessionRef ? " is-clickable" : ""}`}
                onClick={() => {
                  const message = buildTaskOpenMessage(state.sessionRef)
                  if (message) {
                    vscode.postMessage(message)
                  }
                }}
                disabled={!state.sessionRef}
              >
                <span className="sv-todoPrefix">{todoPrefix(item.status)}</span>
                <span className="sv-todoBody">
                  <span className="sv-todoText">{item.content || "Untitled task"}</span>
                  {state.sessionTitle ? <span className="sv-todoMeta">{state.sessionTitle}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function DiffList({ state }: { state: SidebarViewState }) {
  if (state.diff.length === 0) {
    return <Empty title="No modified files" text="Files changed by the focused session will appear here" />
  }

  return (
    <section className="sv-group">
      <div className="sv-list">
        {state.diff.map((item) => (
          <button key={item.file} type="button" className="sv-diff" onClick={() => vscode.postMessage({ type: "openFile", filePath: item.file })}>
            <span className="sv-add">{item.additions ? `+${item.additions}` : ""}</span>
            <span className="sv-sep">/</span>
            <span className="sv-del">{item.deletions ? `-${item.deletions}` : ""}</span>
            <span className="sv-diffPath" title={item.file}>{item.file}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="sv-empty">
      <div className="sv-emptyTitle">{title}</div>
      <div className="sv-emptyText">{text}</div>
    </div>
  )
}

function todoPrefix(status: string) {
  if (status === "in_progress") {
    return "[•]"
  }
  if (status === "completed") {
    return "[✓]"
  }
  return "[ ]"
}

export function buildTaskPanelView(input: {
  todos: Todo[]
  filter?: TaskFilter
}) {
  const filter = input.filter ?? "all"
  const filtered = input.todos.filter((item) => {
    if (filter === "open") {
      return item.status !== "completed"
    }

    if (filter === "completed") {
      return item.status === "completed"
    }

    return true
  })

  const grouped = new Map<string, Todo[]>()
  for (const item of filtered) {
    const key = normalizedTaskStatus(item.status)
    const list = grouped.get(key) ?? []
    list.push(item)
    grouped.set(key, list)
  }

  const sections = taskStatusOrder
    .filter((status) => grouped.has(status))
    .map((status) => ({
      id: status,
      label: taskStatusLabel(status),
      items: grouped.get(status) ?? [],
    }))

  return {
    summary: {
      total: input.todos.length,
      open: input.todos.filter((item) => normalizedTaskStatus(item.status) !== "completed").length,
      completed: input.todos.filter((item) => normalizedTaskStatus(item.status) === "completed").length,
      inProgress: input.todos.filter((item) => normalizedTaskStatus(item.status) === "in_progress").length,
    },
    sections,
  }
}

export function buildTaskOpenMessage(ref?: SessionPanelRef): SidebarWebviewMessage | undefined {
  if (!ref) {
    return undefined
  }

  return {
    type: "openSession",
    workspaceId: ref.workspaceId,
    dir: ref.dir,
    sessionId: ref.sessionId,
  }
}

const taskStatusOrder = ["in_progress", "pending", "completed"] as const

function taskStatusLabel(status: string) {
  if (status === "in_progress") {
    return "In Progress"
  }

  if (status === "completed") {
    return "Completed"
  }

  return "Open"
}

function taskFilterLabel(filter: TaskFilter) {
  if (filter === "open") {
    return "Open"
  }

  if (filter === "completed") {
    return "Completed"
  }

  return "All"
}

function normalizedTaskStatus(status: string) {
  if (status === "in_progress" || status === "completed") {
    return status
  }

  return "pending"
}

if (typeof document !== "undefined") {
  const root = document.getElementById("root")
  if (root) {
    createRoot(root).render(<App />)
  }
}
