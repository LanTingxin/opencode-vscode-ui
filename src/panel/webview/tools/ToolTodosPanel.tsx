import React from "react"
import type { ToolDetails, ToolPart } from "./types"

type TodoItem = {
  content: string
  status: string
}

export function ToolTodosPanel({
  ToolStatus,
  active = false,
  part,
  todoMarker,
  toolDetails,
  toolTodos,
}: {
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  part: ToolPart
  todoMarker: (status: string) => string
  toolDetails: (part: ToolPart) => ToolDetails
  toolTodos: (part: ToolPart) => TodoItem[]
}) {
  const [expanded, setExpanded] = React.useState(false)
  const details = toolDetails(part)
  const todos = toolTodos(part)
  const status = part.state?.status || "pending"
  const collapsible = todos.length > 0
  const collapsed = collapsible && !expanded
  const summary = todoSummary(todos)
  const headerContent = (
    <>
      <span className="oc-toolHeaderMain">
        <span className="oc-kicker">to-dos</span>
        <span className="oc-toolPanelTitle">{details.title}</span>
        {summary ? <span className="oc-toolTodoSummary">{summary}</span> : null}
      </span>
      <span className="oc-toolHeaderMeta">
        {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
        <ToolStatus state={part.state?.status} />
        {collapsible ? (
          <span className="oc-toolTodoToggle" aria-hidden="true">
            <svg className="oc-toolTodoToggleIcon" viewBox="0 0 16 16">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        ) : null}
      </span>
    </>
  )

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel oc-toolPanel-todos${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}${collapsed ? " is-collapsed" : ""}`}>
      {collapsible ? (
        <button type="button" className="oc-partHeader oc-toolTodoHeader" aria-expanded={expanded} aria-label={expanded ? "Collapse todo list" : "Expand todo list"} onClick={() => setExpanded((current) => !current)}>
          {headerContent}
        </button>
      ) : (
        <div className="oc-partHeader oc-toolTodoHeader">
          {headerContent}
        </div>
      )}
      {todos.length > 0 ? (
        <div className="oc-toolTodoList" aria-hidden={collapsed}>
          <div className="oc-toolTodoListClip">
            <div className="oc-toolTodoListInner">
              {todos.map((item) => <div key={`${item.status}:${item.content}`} className={`oc-toolTodoItem is-${item.status}`}>{todoMarker(item.status)} {item.content}</div>)}
            </div>
          </div>
        </div>
      ) : status === "running" || status === "pending" ? <div className="oc-partEmpty">Updating todos...</div> : null}
    </section>
  )
}

function todoSummary(todos: TodoItem[]) {
  const active = todos.find((item) => item.status === "in_progress")
  if (active) {
    return `In progress: ${active.content}`
  }

  const done = todos.filter((item) => item.status === "completed" || item.status === "cancelled").length
  const open = todos.length - done
  if (open > 0 || done > 0) {
    return `${open} open, ${done} done`
  }
  return ""
}
