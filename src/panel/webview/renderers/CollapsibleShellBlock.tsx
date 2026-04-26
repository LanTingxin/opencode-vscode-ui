import React from "react"

interface CollapsibleShellBlockProps {
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  action: string
  title: React.ReactNode
  running?: boolean
  body: string
  className?: string
}

export function CollapsibleShellBlock({
  ToolStatus,
  action,
  title,
  running = false,
  body,
  className = "",
}: CollapsibleShellBlockProps) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <section className={["oc-shellBlock", expanded ? "is-expanded" : "is-collapsed", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="oc-shellBlockHeader"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse shell output" : "Expand shell output"}
      >
        <div className="oc-shellBlockHeaderMain">
          <span className="oc-shellBlockAction">{action}</span>
          <span className="oc-shellBlockTitle">{title}</span>
        </div>
        <div className="oc-shellBlockHeaderMeta">
          {running ? <span className="oc-shellBlockSpinner"><ToolStatus state="running" /></span> : null}
          <svg className="oc-shellBlockToggleIcon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </div>
      </button>
      <div className="oc-shellBlockBody" aria-hidden={!expanded}>
        <div className="oc-shellBlockBodyClip">
          <pre className="oc-shellBlockContent">{body || " "}</pre>
        </div>
      </div>
    </section>
  )
}
