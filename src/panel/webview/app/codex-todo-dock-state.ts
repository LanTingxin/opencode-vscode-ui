import type { PanelTheme } from "../../../core/settings"

export type CodexTodoDockState = {
  visible: boolean
  closing: boolean
  opening: boolean
}

export type CodexTodoDockInput = {
  hasTodos: boolean
  complete: boolean
  theme: PanelTheme
}

export const HIDDEN_CODEX_TODO_DOCK_STATE: CodexTodoDockState = { visible: false, closing: false, opening: false }

export function nextCodexTodoDockState(current: CodexTodoDockState, input: CodexTodoDockInput): CodexTodoDockState {
  if (input.theme !== "codex" || !input.hasTodos) {
    return sameCodexTodoDockState(current, HIDDEN_CODEX_TODO_DOCK_STATE) ? current : HIDDEN_CODEX_TODO_DOCK_STATE
  }

  if (!input.complete) {
    const hidden = !current.visible || current.closing
    const next = { visible: true, closing: false, opening: hidden }
    return sameCodexTodoDockState(current, next) ? current : next
  }

  if (current.closing) {
    return current
  }

  if (!current.visible) {
    return current
  }

  const next = { visible: true, closing: true, opening: false }
  return sameCodexTodoDockState(current, next) ? current : next
}

export function sameCodexTodoDockState(left: CodexTodoDockState, right: CodexTodoDockState) {
  return left.visible === right.visible && left.closing === right.closing && left.opening === right.opening
}
