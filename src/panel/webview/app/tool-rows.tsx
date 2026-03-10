import React from "react"
import type { MessagePart, SessionInfo, SessionMessage } from "../../../core/sdk"

export function ToolRow({
  ToolStatus,
  active = false,
  isMcpTool,
  part,
  renderToolRowExtra,
  renderToolRowSubtitle,
  renderToolRowTitle,
  summary,
  extras,
  childSessionID,
  onNavigate,
  toolLabel,
}: {
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  isMcpTool: (tool: string) => boolean
  part: Extract<MessagePart, { type: "tool" }>
  renderToolRowExtra: (part: Extract<MessagePart, { type: "tool" }>, item: string) => React.ReactNode
  renderToolRowSubtitle: (part: Extract<MessagePart, { type: "tool" }>) => React.ReactNode
  renderToolRowTitle: (part: Extract<MessagePart, { type: "tool" }>) => React.ReactNode
  summary: string
  extras: string[]
  childSessionID: string
  onNavigate: (sessionID: string) => void
  toolLabel: (tool: string) => string
}) {
  const isMcp = isMcpTool(part.tool)
  const failed = part.state?.status === "error"
  return (
    <section className={`oc-toolRowWrap oc-toolRowWrap-${part.tool}${isMcp ? " oc-toolRowWrap-mcp" : ""}${active ? " is-active" : ""}${part.state?.status === "completed" ? " is-completed" : ""}`}>
      <div className={`oc-toolRow${isMcp ? " oc-toolRow-mcp" : ""}`}>
        <div className={`oc-toolRowMain${isMcp ? " oc-toolRowMain-mcp" : ""}${failed ? " is-error" : ""}`}>
          <span className="oc-kicker">{toolLabel(part.tool)}</span>
          <span className={`oc-toolRowTitle${isMcp ? " oc-toolRowTitle-mcp" : ""}`}>{renderToolRowTitle(part)}</span>
          {part.tool === "task" ? <span className="oc-pill oc-pill-file">Subagent</span> : null}
        </div>
        <div className={`oc-toolRowMeta${isMcp ? " oc-toolRowMeta-mcp" : ""}`}>
          {renderToolRowSubtitle(part)}
          {summary ? <span className="oc-toolRowSummary">{summary}</span> : null}
          {childSessionID ? <button type="button" className="oc-inlineLinkBtn" onClick={() => onNavigate(childSessionID)}>Open child</button> : null}
          <ToolStatus state={part.state?.status} />
        </div>
      </div>
      {extras.length > 0 ? (
        <div className="oc-toolRowExtras">
          {extras.map((item) => <div key={item} className="oc-toolRowExtra">↳ {renderToolRowExtra(part, item)}</div>)}
        </div>
      ) : null}
    </section>
  )
}

export function TaskToolRow({
  AgentBadge,
  ToolStatus,
  active = false,
  part,
  child,
  sessions,
  childSessionID,
  agentName,
  title,
  body,
  onNavigate,
}: {
  AgentBadge: ({ name }: { name: string }) => React.JSX.Element
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  part: Extract<MessagePart, { type: "tool" }>
  child: Record<string, SessionMessage[]>
  sessions: Record<string, SessionInfo>
  childSessionID: string
  agentName: string
  title: string
  body: string
  onNavigate: (sessionID: string) => void
}) {
  void child
  void sessions
  const clickable = !!childSessionID
  const failed = part.state?.status === "error"

  const content = (
    <>
      <div className="oc-taskRow">
        <div className="oc-taskLine oc-taskLinePrimary">
          <AgentBadge name={agentName} />
          <span className="oc-taskColon">:</span>
          <span className={`oc-taskSessionTitle${failed ? " is-error" : ""}`}>{title}</span>
          <ToolStatus state={part.state?.status} />
        </div>
        {body ? <div className={`oc-taskLine oc-taskLineSecondary${failed ? " is-error" : ""}`}><span className="oc-taskBranch">└</span><span className={`oc-taskBody${failed ? " is-error" : ""}`}>{body}</span></div> : null}
      </div>
    </>
  )

  if (clickable) {
    return (
      <button
        type="button"
        className={`oc-toolRowWrap oc-toolRowBtn oc-toolRowBtn-task${active ? " is-active" : ""}${part.state?.status === "completed" ? " is-completed" : ""}`}
        onClick={() => onNavigate(childSessionID)}
      >
        {content}
      </button>
    )
  }

  return <section className={`oc-toolRowWrap oc-toolRowWrap-task${active ? " is-active" : ""}${part.state?.status === "completed" ? " is-completed" : ""}`}>{content}</section>
}

export function ToolStatus({ state }: { state?: string }) {
  if (state !== "running" && state !== "pending") {
    return null
  }
  return (
    <span className="oc-toolSpinner" aria-label={state}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="oc-toolSpinnerTrack" />
        <path d="M 8 2 A 6 6 0 0 1 14 8" className="oc-toolSpinnerHead" />
      </svg>
    </span>
  )
}
