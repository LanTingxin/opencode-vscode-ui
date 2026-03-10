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
