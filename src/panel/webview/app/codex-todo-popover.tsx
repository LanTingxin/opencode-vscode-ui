import React from "react"

import type { Todo } from "../../../core/sdk"

type CodexTodoPopoverProps = {
  todos: Todo[]
  collapsed?: boolean
  onToggle?: () => void
}

export function CodexTodoPopover({ todos, collapsed = false, onToggle }: CodexTodoPopoverProps) {
  if (todos.length === 0) {
    return null
  }

  const completed = todos.filter((item) => item.status === "completed").length

  return (
    <section className={`oc-codexTodoPopover${collapsed ? " is-collapsed" : ""}`} aria-label="Tracked tasks">
      <div className="oc-codexTodoHeader">
        <div className="oc-codexTodoHeaderText">
          <span className="oc-codexTodoEyebrow">ACTIVE TASKS</span>
          <span className="oc-codexTodoSummary">共 {todos.length} 个任务，已经完成 {completed} 个</span>
        </div>
        <button
          type="button"
          className={`oc-codexTodoToggle${collapsed ? " is-collapsed" : ""}`}
          aria-label={collapsed ? "Expand task list" : "Collapse task list"}
          aria-expanded={collapsed ? "false" : "true"}
          onClick={onToggle}
        >
          {collapsed ? (
            <svg viewBox="0 0 1024 1024" aria-hidden="true" className="oc-codexTodoToggleIcon">
              <path d="M273.664 213.333333H426.666667V128H128v298.666667h85.333333V273.664l183.168 183.168 60.330667-60.330667L273.664 213.333333zM896 597.333333h-85.333333v153.002667l-183.168-183.168-60.330667 60.330667L750.336 810.666667H597.333333v85.333333h298.666667v-298.666667z" />
            </svg>
          ) : (
            <svg viewBox="0 0 1024 1024" aria-hidden="true" className="oc-codexTodoToggleIcon">
              <path d="M384 170.666667h85.333333v298.666666H170.666667V384h153.002666L140.501333 200.832l60.330667-60.330667L384 323.669333V170.666667z m469.333333 469.333333h-153.002666l183.168 183.168-60.330667 60.330667L640 700.330667V853.333333h-85.333333v-298.666666h298.666666v85.333333z" />
            </svg>
          )}
        </button>
      </div>
      {!collapsed ? (
        <div className="oc-codexTodoList">
          {todos.map((item) => (
            <div key={`${item.status}:${item.content}`} className={`oc-codexTodoItem is-${item.status}`}>
              <span className="oc-codexTodoMarker" aria-hidden="true" />
              <span className={`oc-codexTodoText is-${item.status}`}>{item.content}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
