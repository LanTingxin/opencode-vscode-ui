import React from "react"

export function useComposerResize(composerRef: React.RefObject<HTMLTextAreaElement | null>, draft: string) {
  React.useEffect(() => {
    resizeComposer(composerRef.current)
  }, [composerRef, draft])

  React.useEffect(() => {
    const onResize = () => resizeComposer(composerRef.current)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [composerRef])
}

export function resizeComposer(node: HTMLTextAreaElement | null) {
  if (!node) {
    return
  }

  node.style.height = "auto"
  const maxHeight = Math.max(120, Math.floor(window.innerHeight * 0.5))
  const next = Math.min(node.scrollHeight, maxHeight)
  node.style.height = `${next}px`
  node.style.overflowY = node.scrollHeight > maxHeight ? "auto" : "hidden"
}
