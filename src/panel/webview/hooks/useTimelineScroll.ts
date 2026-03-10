import React from "react"

export function useTimelineScroll(
  timelineRef: React.RefObject<HTMLDivElement | null>,
  deps: React.DependencyList,
) {
  const stickToBottomRef = React.useRef(true)

  React.useEffect(() => {
    const node = timelineRef.current
    if (!node) {
      return
    }

    const updateStickiness = () => {
      stickToBottomRef.current = isNearBottom(node)
    }

    updateStickiness()
    node.addEventListener("scroll", updateStickiness)
    return () => node.removeEventListener("scroll", updateStickiness)
  }, [timelineRef])

  React.useLayoutEffect(() => {
    const node = timelineRef.current
    if (!node || !stickToBottomRef.current) {
      return
    }

    node.scrollTop = node.scrollHeight
  }, deps)
}

function isNearBottom(node: HTMLElement) {
  const threshold = scrollBottomThreshold(node)
  const remaining = node.scrollHeight - node.scrollTop - node.clientHeight
  return remaining <= threshold
}

function scrollBottomThreshold(node: HTMLElement) {
  const lineHeight = Number.parseFloat(window.getComputedStyle(node).lineHeight || "")
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 24
}
