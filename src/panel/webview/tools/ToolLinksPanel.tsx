import React from "react"
import type { ToolDetails, ToolPart } from "./types"

export function ToolLinksPanel({
  ToolStatus,
  active = false,
  defaultToolExpanded,
  extractUrls,
  part,
  toolDetails,
  toolLabel,
  uniqueStrings,
}: {
  ToolStatus: ({ state }: { state?: string }) => React.JSX.Element | null
  active?: boolean
  defaultToolExpanded: (part: ToolPart, active: boolean, hasBody: boolean) => boolean
  extractUrls: (value: string) => string[]
  part: ToolPart
  toolDetails: (part: ToolPart) => ToolDetails
  toolLabel: (tool: string) => string
  uniqueStrings: (values: string[]) => string[]
}) {
  const details = toolDetails(part)
  const links = uniqueStrings(extractUrls(part.state?.output || ""))
  const status = part.state?.status || "pending"
  const [expanded, setExpanded] = React.useState(() => defaultToolExpanded(part, active, links.length > 0))

  React.useEffect(() => {
    if (status === "running" || status === "pending" || status === "error" || active) {
      setExpanded(true)
    }
  }, [active, status])

  return (
    <section className={`oc-part oc-part-tool oc-toolPanel${active ? " is-active" : ""}${status === "completed" ? " is-completed" : ""}`}>
      <button type="button" className="oc-toolTrigger" onClick={() => setExpanded((current: boolean) => !current)}>
        <div className="oc-partHeader">
          <div className="oc-toolHeaderMain">
            <span className="oc-kicker">{toolLabel(part.tool)}</span>
            <span className="oc-toolPanelTitle">{details.title}</span>
          </div>
          <div className="oc-toolHeaderMeta">
            {details.subtitle ? <span className="oc-partMeta">{details.subtitle}</span> : null}
            <ToolStatus state={part.state?.status} />
          </div>
        </div>
      </button>
      {expanded && links.length > 0 ? (
        <div className="oc-linkList">
          {links.map((item) => <a key={item} className="oc-linkItem" href={item}>{item}</a>)}
        </div>
      ) : null}
    </section>
  )
}
