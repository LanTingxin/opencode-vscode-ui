import React from "react"

import type { StatusItem, StatusTone } from "../lib/session-meta"

export type ComposerFooterBadge = {
  label: string
  tone: StatusTone
  items: StatusItem[]
}

export type ComposerFooterContextStats = {
  tokens: string
  usage: string
  cost: string
  percent?: number
}

export function ComposerFooter({
  contextStats,
  contextOpen = false,
  badges,
  error,
  onOpenContext,
  pendingActions,
  onActionStart,
  onBadgeAction,
}: {
  contextStats: ComposerFooterContextStats
  contextOpen?: boolean
  badges: ComposerFooterBadge[]
  error?: string
  onOpenContext?: () => void
  pendingActions?: Record<string, boolean>
  onActionStart?: (name: string) => void
  onBadgeAction?: (item: StatusItem) => void
}) {
  const visibleBadges = badges.filter((badge) => badge.label === "MCP" || badge.label === "LSP")

  return (
    <div className="oc-composerActions">
      <div className="oc-composerActionsMain">
        {error ? <div className="oc-errorText oc-composerErrorText">{error}</div> : <span />}
      </div>
      <div className="oc-composerContextWrap">
        {onOpenContext ? (
          <div className="oc-contextButtonWrap">
            <button
              type="button"
              className={`oc-contextButton${contextOpen ? " is-open" : ""}`}
              onClick={onOpenContext}
              aria-label={`${contextOpen ? "Close" : "Open"} context`}
              title={`${contextOpen ? "Close" : "Open"} context`}
            >
              <ContextButtonRing percent={contextStats.percent} />
            </button>
            <div className="oc-contextButtonTooltip" role="tooltip">
              <ContextButtonTooltipRow value={contextStats.tokens} label="Token" />
              <ContextButtonTooltipRow value={contextStats.usage} label="Usage" />
              <ContextButtonTooltipRow value={contextStats.cost} label="Cost" />
            </div>
          </div>
        ) : null}
        <div className="oc-actionRow oc-composerBadgeRow">
          {visibleBadges.map((badge) => (
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

function ContextButtonTooltipRow({ value, label }: { value: string; label: string }) {
  return (
    <div className="oc-contextButtonTooltipRow">
      <span className="oc-contextButtonTooltipValue">{value}</span>
      <span className="oc-contextButtonTooltipLabel">{label}</span>
    </div>
  )
}

export function ContextButtonRing({
  percent,
  decorative = false,
}: {
  percent?: number
  decorative?: boolean
}) {
  const normalized = Number.isFinite(percent) ? Math.max(0, Math.round(percent ?? 0)) : 0
  const clamped = Math.min(normalized, 100)
  const toneClass = normalized >= 100 ? " is-critical" : normalized >= 80 ? " is-warning" : ""
  const accessibilityProps = decorative
    ? { "aria-hidden": true }
    : {
      role: "progressbar",
      "aria-label": "Context usage",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": clamped,
      "aria-valuetext": `${normalized}% used`,
    }

  return (
    <span
      className={`oc-contextButtonRing${toneClass}`}
      {...accessibilityProps}
      style={{ "--oc-context-button-percent": `${clamped}%` } as React.CSSProperties}
    />
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
