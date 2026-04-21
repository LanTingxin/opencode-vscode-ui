import type { SessionStatus } from "../../../core/sdk"

export type ComposerRunningState = {
  label: string
  hint: string
  tone: "running" | "retry" | "armed"
  icon: "stop" | "stop-confirm"
  title: string
  ariaLabel: string
}

export function composerRunningState(status: SessionStatus | undefined, escPending: boolean): ComposerRunningState | undefined {
  if (status?.type !== "busy" && status?.type !== "retry") {
    return undefined
  }

  const label = status.type === "retry" ? "Retrying" : "Thinking"
  if (escPending) {
    return {
      label,
      hint: "Press Esc again to interrupt",
      tone: "armed",
      icon: "stop-confirm",
      title: "Press again to interrupt",
      ariaLabel: "Interrupt running session now",
    }
  }

  return {
    label,
    hint: "Esc to interrupt",
    tone: status.type === "retry" ? "retry" : "running",
    icon: "stop",
    title: "Interrupt running session",
    ariaLabel: "Interrupt running session",
  }
}
