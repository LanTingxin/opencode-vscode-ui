import React from "react"

import type { ComposerRunningState } from "./composer-running-state"

export function ComposerRunningStrip({ status }: { status: ComposerRunningState }) {
  return (
    <div className={`oc-composerStatus is-${status.tone}`} role="status" aria-live="polite">
      <span className="oc-composerStatusDot" aria-hidden="true" />
      <span className="oc-composerStatusLabel">{status.label}</span>
      <span className="oc-composerStatusHint">{status.hint}</span>
    </div>
  )
}
