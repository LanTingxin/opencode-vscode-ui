export type TranscriptHistoryMode = "idle" | "render" | "load"

export function resolveTranscriptHistoryMode(input: {
  renderedCount: number
  loadedCount: number
  hasEarlier: boolean
}): TranscriptHistoryMode {
  if (input.renderedCount < input.loadedCount) {
    return "render"
  }

  if (input.hasEarlier) {
    return "load"
  }

  return "idle"
}

export function shouldAutoLoadEarlierMessages(input: {
  scrollTop: number
  threshold: number
  mode: TranscriptHistoryMode
  loading: boolean
  armed: boolean
}) {
  return input.armed
    && !input.loading
    && input.mode !== "idle"
    && input.scrollTop <= input.threshold
}

export function transcriptHistoryScrollThreshold(lineHeight: number) {
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return 48
  }

  return Math.max(48, Math.round(lineHeight * 2))
}
