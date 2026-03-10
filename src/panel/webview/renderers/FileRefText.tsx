import React from "react"

type FileRef = {
  key: string
  filePath: string
  line?: number
}

export function FileRefText({ fileRefStatus, onOpenFile, onResolveFileRefs, value, display, tone = "default" }: { fileRefStatus: Map<string, boolean>; onOpenFile: (filePath: string, line?: number) => void; onResolveFileRefs: (refs: Array<{ key: string; filePath: string }>) => void; value: string; display?: string; tone?: "default" | "muted" }) {
  const fileRef = React.useMemo(() => parseFileReference(value), [value])
  const [exists, setExists] = React.useState(() => fileRef ? fileRefStatus.get(fileRef.key) === true : false)

  React.useEffect(() => {
    if (!fileRef) {
      setExists(false)
      return
    }
    setExists(fileRefStatus.get(fileRef.key) === true)
    if (!fileRefStatus.has(fileRef.key)) {
      onResolveFileRefs([{ key: fileRef.key, filePath: fileRef.filePath }])
    }
    const sync = () => {
      setExists(fileRefStatus.get(fileRef.key) === true)
    }
    window.addEventListener("oc-file-refs-updated", sync)
    return () => window.removeEventListener("oc-file-refs-updated", sync)
  }, [fileRef, fileRefStatus, onResolveFileRefs])

  if (!fileRef) {
    return <>{display || value}</>
  }

  return <span className={["oc-fileRefText", exists ? "is-openable" : "", tone === "muted" ? "is-muted" : ""].filter(Boolean).join(" ")} onClick={(event) => {
    if (!exists || (!event.metaKey && !event.ctrlKey)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onOpenFile(fileRef.filePath, fileRef.line)
  }}>{display || value}</span>
}

export function parseFileReference(value: string) {
  const input = value.trim()
  if (!input || isExternalTarget(input)) {
    return undefined
  }
  const lineMatch = input.match(/:(\d+)$/)
  const filePath = lineMatch ? input.slice(0, -lineMatch[0].length) : input
  const normalized = normalizeFileReference(filePath)
  if (!normalized || !looksLikeFilePath(normalized)) {
    return undefined
  }
  return { key: fileRefKey(normalized), filePath: normalized, line: lineMatch ? Number.parseInt(lineMatch[1] || "", 10) : undefined } satisfies FileRef
}

export function syncMarkdownFileRefs(root: HTMLElement, fileRefStatus: Map<string, boolean>, onResolveFileRefs: (refs: Array<{ key: string; filePath: string }>) => void) {
  const refs = new Map<string, string>()
  for (const link of Array.from(root.querySelectorAll("a"))) {
    const fileRef = parseFileReference(link.getAttribute("href") || "")
    if (!fileRef) {
      link.removeAttribute("data-file-ref")
      continue
    }
    link.setAttribute("data-file-ref", fileRef.key)
    refs.set(fileRef.key, fileRef.filePath)
  }
  for (const inlineCode of Array.from(root.querySelectorAll(".oc-inlineCode"))) {
    if (!(inlineCode instanceof HTMLElement)) {
      continue
    }
    const fileRef = parseFileReference(inlineCode.textContent || "")
    if (!fileRef) {
      inlineCode.removeAttribute("data-file-ref")
      inlineCode.classList.remove("oc-inlineCode-file")
      continue
    }
    inlineCode.setAttribute("data-file-ref", fileRef.key)
    inlineCode.classList.toggle("oc-inlineCode-file", !!fileRefStatus.get(fileRef.key))
    refs.set(fileRef.key, fileRef.filePath)
  }
  const unresolved = [...refs.entries()].filter(([key]) => !fileRefStatus.has(key)).map(([key, filePath]) => ({ key, filePath }))
  if (unresolved.length > 0) {
    onResolveFileRefs(unresolved)
  }
}

function fileRefKey(value: string) {
  return value.startsWith("file://") ? value : value.replace(/\\/g, "/")
}

function normalizeFileReference(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed.startsWith("file://")) {
    return trimmed
  }
  return trimmed.replace(/^['"]+|['"]+$/g, "")
}

function looksLikeFilePath(value: string) {
  return value.startsWith("file://") || /^[A-Za-z]:[\\/]/.test(value) || /^\.{1,2}[\\/]/.test(value) || value.startsWith("/") || value.includes("/") || value.includes("\\") || /^[^\s\\/]+\.[^\s\\/]+$/.test(value)
}

function isExternalTarget(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("file://")
}
