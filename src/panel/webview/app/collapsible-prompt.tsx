import React from "react"

type CollapsiblePromptProps = {
  content: string
  maxLines?: number
}

export function CollapsiblePrompt({ content, maxLines = 3 }: CollapsiblePromptProps) {
  const [expanded, setExpanded] = React.useState(false)
  const [isOverflowing, setIsOverflowing] = React.useState(true)
  const [contentHeight, setContentHeight] = React.useState(0)
  const [collapsedHeight, setCollapsedHeight] = React.useState(0)
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const element = contentRef.current
    if (!element) {
      return
    }

    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight)
      const nextCollapsedHeight = Math.ceil(lineHeight * maxLines)
      const nextContentHeight = Math.ceil(element.scrollHeight)

      setCollapsedHeight((current) => current === nextCollapsedHeight ? current : nextCollapsedHeight)
      setContentHeight((current) => current === nextContentHeight ? current : nextContentHeight)
      setIsOverflowing(nextContentHeight > nextCollapsedHeight + 1)
    }

    measure()
    const Observer = window.ResizeObserver
    if (!Observer) {
      return
    }
    const observer = new Observer(() => measure())
    observer.observe(element)
    return () => observer.disconnect()
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

  const style = {
    "--oc-collapsiblePrompt-collapsed-height": collapsedHeight ? `${collapsedHeight}px` : `${maxLines * 1.65}em`,
    "--oc-collapsiblePrompt-expanded-height": contentHeight ? `${contentHeight}px` : "none",
  } as React.CSSProperties

  return (
    <div className={`oc-collapsiblePrompt${expanded ? " is-expanded" : ""}${isOverflowing ? "" : " no-overflow"}`}>
      <div
        ref={contentRef}
        className="oc-collapsiblePromptContent"
        style={style}
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
