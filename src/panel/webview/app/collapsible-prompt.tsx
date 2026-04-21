import React from "react"

type CollapsiblePromptProps = {
  content: string
  maxLines?: number
}

export function CollapsiblePrompt({ content, maxLines = 3 }: CollapsiblePromptProps) {
  const [expanded, setExpanded] = React.useState(false)
  const [isOverflowing, setIsOverflowing] = React.useState(true)
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const element = contentRef.current
    if (!element) {
      return
    }

    const lineHeight = parseFloat(getComputedStyle(element).lineHeight)
    const maxHeight = lineHeight * maxLines
    const actualHeight = element.scrollHeight

    setIsOverflowing(actualHeight > maxHeight + 1)
  }, [content, maxLines])

  const handleExpand = () => {
    if (!expanded) {
      setExpanded(true)
    }
  }

  const handleCollapse = (event: React.MouseEvent) => {
    event.stopPropagation()
    setExpanded(false)
  }

  return (
    <div className={`oc-collapsiblePrompt${expanded ? " is-expanded" : ""}${isOverflowing ? "" : " no-overflow"}`}>
      <div
        ref={contentRef}
        className="oc-collapsiblePromptContent"
        style={{
          WebkitLineClamp: expanded ? "unset" : maxLines,
        }}
        onClick={handleExpand}
        role={!expanded && isOverflowing ? "button" : undefined}
        tabIndex={!expanded && isOverflowing ? 0 : undefined}
        onKeyDown={!expanded && isOverflowing ? (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleExpand()
          }
        } : undefined}
      >
        {content}
      </div>
      {!expanded && isOverflowing && <div className="oc-collapsiblePromptFade" onClick={handleExpand} />}
      {isOverflowing && (
        <button
          type="button"
          className="oc-collapsiblePromptToggle"
          onClick={expanded ? handleCollapse : handleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? "Show less" : "Show more"}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}
