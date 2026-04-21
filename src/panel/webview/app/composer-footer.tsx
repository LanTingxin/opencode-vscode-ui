import React from "react"

import type { StatusItem, StatusTone } from "../lib/session-meta"

export type ComposerFooterBadge = {
  label: string
  tone: StatusTone
  items: StatusItem[]
}

export function ComposerFooter({
  metrics,
  contextPercent,
  contextOpen = false,
  badges,
  error,
  onOpenContext,
  pendingActions,
  onActionStart,
  onBadgeAction,
}: {
  metrics: string[]
  contextPercent?: number
  contextOpen?: boolean
  badges: ComposerFooterBadge[]
  error?: string
  onOpenContext?: () => void
  pendingActions?: Record<string, boolean>
  onActionStart?: (name: string) => void
  onBadgeAction?: (item: StatusItem) => void
}) {
  return (
    <div className="oc-composerActions">
      <div className="oc-composerActionsMain">
        {error ? <div className="oc-errorText oc-composerErrorText">{error}</div> : null}
        <div className="oc-contextRow">
          {metrics.map((item, index) => (
            <React.Fragment key={item}>
              {index > 0 ? <span aria-hidden="true">·</span> : null}
              <span>{item}</span>
              {index === 0 && typeof contextPercent === "number" ? (
                <>
                  <span aria-hidden="true">·</span>
                  <ContextUsageBar percent={contextPercent} />
                </>
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="oc-composerContextWrap">
        {onOpenContext ? (
          <button
            type="button"
            className={`oc-contextButton${contextOpen ? " is-open" : ""}`}
            onClick={onOpenContext}
            aria-label={`${contextOpen ? "Close" : "Open"} context`}
            title={`${contextOpen ? "Close" : "Open"} context`}
          >
            <ContextButtonRing percent={contextPercent} />
            <span className="oc-contextButtonLabel">Context</span>
          </button>
        ) : null}
        <div className="oc-actionRow oc-composerBadgeRow">
          {badges.map((badge) => (
            <StatusBadge
              key={badge.label}
              label={badge.label}
              tone={badge.tone}
              items={badge.items}
              pendingActions={pendingActions}
              onActionStart={onActionStart}
              onBadgeAction={onBadgeAction}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ContextButtonRing({ percent }: { percent?: number }) {
  const normalized = Number.isFinite(percent) ? Math.max(0, Math.round(percent ?? 0)) : 0
  const clamped = Math.min(normalized, 100)
  const toneClass = normalized >= 100 ? " is-critical" : normalized >= 80 ? " is-warning" : ""

  return (
    <span
      className={`oc-contextButtonRing${toneClass}`}
      aria-hidden="true"
      style={{ "--oc-context-button-percent": `${clamped}%` } as React.CSSProperties}
    >
      <span className="oc-contextButtonRingCore" />
    </span>
  )
}

function ContextUsageBar({ percent }: { percent: number }) {
  const normalized = Number.isFinite(percent) ? Math.max(0, Math.round(percent)) : 0
  const clamped = Math.min(normalized, 100)
  const toneClass = normalized >= 100 ? " is-critical" : normalized >= 80 ? " is-warning" : ""

  return (
    <span
      className={`oc-contextUsage${toneClass}`}
      role="progressbar"
      aria-label="Context usage"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={`${normalized}% used`}
      title={`Context usage ${normalized}%`}
    >
      <span className="oc-contextUsageFill" style={{ width: `${clamped}%` }} />
    </span>
  )
}

function StatusBadge(props: {
  label: string
  tone: StatusTone
  items: StatusItem[]
  pendingActions?: Record<string, boolean>
  onActionStart?: (name: string) => void
  onBadgeAction?: (item: StatusItem) => void
}) {
  const { label, tone, items, pendingActions, onActionStart, onBadgeAction } = props
  return (
    <div className="oc-statusBadgeWrap">
      <div className="oc-statusBadge">
        <span className={`oc-statusLight is-${tone}`} />
        <span>{label}</span>
      </div>
      {items.length > 0 ? (
        <div className="oc-statusPopover">
          {items.map((item) => (
            <div key={`${label}-${item.name}`} className="oc-statusPopoverItem">
              <span className={`oc-statusLight is-${item.tone}`} />
              <span className="oc-statusPopoverName">{item.name}</span>
              <span className="oc-statusPopoverValue" title={item.value}>{item.value}</span>
              {item.action ? <StatusPopoverAction item={item} pending={!!pendingActions?.[item.name]} onActionStart={onActionStart} onBadgeAction={onBadgeAction} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StatusPopoverAction({
  item,
  pending,
  onActionStart,
  onBadgeAction,
}: {
  item: StatusItem
  pending: boolean
  onActionStart?: (name: string) => void
  onBadgeAction?: (item: StatusItem) => void
}) {
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!item.action || pending) {
      return
    }
    onActionStart?.(item.name)
    onBadgeAction?.(item)
  }

  return (
    <button type="button" disabled={pending} className={`oc-statusPopoverAction${item.action === "disconnect" || item.action === "removeAuth" ? " is-disconnect" : ""}${item.action === "connect" || item.action === "authenticate" ? " is-connect" : ""}${pending ? " is-pending" : ""}`} onClick={onClick} title={item.actionLabel} aria-label={item.actionLabel}>
      {item.action === "disconnect" ? <DisconnectIcon /> : null}
      {item.action === "removeAuth" ? <DisconnectIcon /> : null}
      {item.action === "connect" ? <ConnectIcon /> : null}
      {item.action === "authenticate" ? <ConnectIcon /> : null}
      {item.action === "reconnect" ? <ReconnectIcon /> : null}
    </button>
  )
}

function ConnectIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 22L6 18" className="oc-statusActionPath" />
      <rect x="5" y="13" width="7" height="5" rx="1" transform="rotate(-45 8.5 15.5)" className="oc-statusActionPath" />
      <path d="M8 14L10 12" className="oc-statusActionPath" />
      <path d="M10 16L12 14" className="oc-statusActionPath" />
      <rect x="12" y="6" width="7" height="5" rx="1" transform="rotate(-45 15.5 8.5)" className="oc-statusActionPath" />
      <path d="M18 6L22 2" className="oc-statusActionPath" />
    </svg>
  )
}

function DisconnectIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 22L6 18" className="oc-statusActionPath" />
      <rect x="5" y="13" width="7" height="5" rx="1" transform="rotate(-45 8.5 15.5)" className="oc-statusActionPath" />
      <path d="M8 14L10 12" className="oc-statusActionPath" />
      <path d="M10 16L12 14" className="oc-statusActionPath" />
      <rect x="12" y="6" width="7" height="5" rx="1" transform="rotate(-45 15.5 8.5)" className="oc-statusActionPath" />
      <path d="M18 6L22 2" className="oc-statusActionPath" />
      <path d="M4 4L20 20" className="oc-statusActionPath" />
    </svg>
  )
}

function ReconnectIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M12.5 6.5A4.5 4.5 0 0 0 5.25 4" className="oc-statusActionPath" />
      <path d="M4.75 2.75v2.5h2.5" className="oc-statusActionPath" />
      <path d="M3.5 9.5A4.5 4.5 0 0 0 10.75 12" className="oc-statusActionPath" />
      <path d="M11.25 13.25v-2.5h-2.5" className="oc-statusActionPath" />
    </svg>
  )
}
