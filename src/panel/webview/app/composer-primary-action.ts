import type { ComposerRunningState } from "./composer-running-state"

type ComposerPrimaryActionInput = {
  draft: string
  imageCount: number
  blocked: boolean
  running: boolean
  escPending: boolean
  runningState?: ComposerRunningState
}

type ComposerPrimaryActionState = {
  kind: "submit" | "interrupt"
  disabled: boolean
  icon: "send" | "stop" | "stop-confirm"
  title: string
  ariaLabel: string
}

export function composerPrimaryAction(input: ComposerPrimaryActionInput): ComposerPrimaryActionState {
  if (input.runningState) {
    return {
      kind: "interrupt",
      disabled: false,
      icon: input.runningState.icon,
      title: input.runningState.title,
      ariaLabel: input.runningState.ariaLabel,
    }
  }

  if (input.running) {
    return {
      kind: "interrupt",
      disabled: false,
      icon: input.escPending ? "stop-confirm" : "stop",
      title: input.escPending ? "Press again to interrupt" : "Interrupt running session",
      ariaLabel: input.escPending ? "Interrupt running session now" : "Interrupt running session",
    }
  }

  if (input.blocked) {
    return {
      kind: "submit",
      disabled: true,
      icon: "send",
      title: "Submit unavailable",
      ariaLabel: "Submit prompt",
    }
  }

  const hasContent = !!input.draft.trim() || input.imageCount > 0
  return {
    kind: "submit",
    disabled: !hasContent,
    icon: "send",
    title: "Enter to submit",
    ariaLabel: "Submit prompt",
  }
}
