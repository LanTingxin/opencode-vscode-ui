import React from "react"

import type { Todo } from "../../../core/sdk"

type CodexTodoPopoverProps = {
  todos: Todo[]
  collapsed?: boolean
  onToggle?: () => void
}

export function CodexTodoPopover({ todos, collapsed = false, onToggle }: CodexTodoPopoverProps) {
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const scrollingRef = React.useRef(false)
  const scrollTimerRef = React.useRef<number | null>(null)
  const completed = todos.filter((item) => item.status === "completed").length
  const active = todos.find((item) => item.status === "in_progress")
    ?? todos.find((item) => item.status === "pending")
    ?? [...todos].reverse().find((item) => item.status === "completed")
    ?? todos[0]

  React.useEffect(() => {
    if (collapsed || scrollingRef.current) {
      return
    }

    const list = listRef.current
    const activeItem = list?.querySelector("[data-in-progress]")
    if (!list || !(activeItem instanceof HTMLElement)) {
      return
    }

    const topFade = 16
    const bottomFade = 44
    const container = list.getBoundingClientRect()
    const rect = activeItem.getBoundingClientRect()
    const top = rect.top - container.top + list.scrollTop
    const bottom = rect.bottom - container.top + list.scrollTop
    const viewTop = list.scrollTop + topFade
    const viewBottom = list.scrollTop + list.clientHeight - bottomFade

    if (top < viewTop) {
      list.scrollTop = Math.max(0, top - topFade)
    } else if (bottom > viewBottom) {
      list.scrollTop = bottom - (list.clientHeight - bottomFade)
    }
  }, [collapsed, todos])

  React.useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        window.clearTimeout(scrollTimerRef.current)
      }
    }
  }, [])

  if (todos.length === 0) {
    return null
  }

  return (
    <section className={`oc-codexTodoPopover${collapsed ? " is-collapsed" : ""}`} aria-label="Tracked tasks">
      <div className="oc-codexTodoHeader">
        <div className="oc-codexTodoHeaderText">
          <span className="oc-codexTodoEyebrow">ACTIVE TASKS</span>
          <span className="oc-codexTodoSummary">共 {todos.length} 个任务，已经完成 {completed} 个</span>
          {collapsed && active?.content ? <span className="oc-codexTodoPreview">{active.content}</span> : null}
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
        <div
          className="oc-codexTodoList"
          ref={listRef}
          onScroll={() => {
            scrollingRef.current = true
            if (scrollTimerRef.current) {
              window.clearTimeout(scrollTimerRef.current)
            }
            scrollTimerRef.current = window.setTimeout(() => {
              scrollingRef.current = false
            }, 250)
          }}
        >
          {todos.map((item) => (
            <div
              key={`${item.status}:${item.content}`}
              className={`oc-codexTodoItem is-${item.status}`}
              data-in-progress={item.status === "in_progress" ? "" : undefined}
            >
              <span className="oc-codexTodoMarker" aria-hidden="true" />
              <span className={`oc-codexTodoText is-${item.status}`}>{item.content}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
