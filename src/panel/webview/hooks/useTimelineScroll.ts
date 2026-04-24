import React from "react"

export function useTimelineScroll(
  timelineRef: React.RefObject<HTMLDivElement | null>,
  deps: React.DependencyList,
) {
  const stickToBottomRef = React.useRef(true)
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  React.useEffect(() => {
    const node = timelineRef.current
    if (!node) {
      return
    }

    const updateStickiness = () => {
      const next = isNearBottom(node)
      stickToBottomRef.current = next
      setIsAtBottom(next)
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

  const scrollToBottom = React.useCallback(() => {
    const node = timelineRef.current
    if (!node) {
      return
    }

    scrollTimelineToBottom(node)
    stickToBottomRef.current = true
    setIsAtBottom(true)
  }, [timelineRef])

  return { isAtBottom, scrollToBottom }
}

function isNearBottom(node: HTMLElement) {
  const threshold = scrollBottomThreshold(node)
  return isTimelineNearBottom(node, threshold)
}

function scrollBottomThreshold(node: HTMLElement) {
  const lineHeight = Number.parseFloat(window.getComputedStyle(node).lineHeight || "")
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 24
}

export function isTimelineNearBottom(
  node: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  threshold: number,
) {
  const remaining = node.scrollHeight - node.scrollTop - node.clientHeight
  return remaining <= threshold
}

export function scrollTimelineToBottom(node: Pick<HTMLElement, "scrollHeight" | "scrollTop"> & {
  scrollTo?: (options: ScrollToOptions) => void
}) {
  if (typeof node.scrollTo === "function") {
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
    return
  }

  node.scrollTop = node.scrollHeight
}
