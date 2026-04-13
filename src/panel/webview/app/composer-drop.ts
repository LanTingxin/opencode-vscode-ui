type DropData = Pick<DataTransfer, "getData" | "files" | "types">

export function shouldHandleComposerFileDrop(input: {
  shiftKey: boolean
  filePaths: string[]
}) {
  return input.shiftKey && input.filePaths.length > 0
}

export function collectDroppedFilePaths(data: DropData | null, workspaceDir: string) {
  if (!data) {
    return []
  }

  const seen = new Set<string>()
  const out: string[] = []
  const add = (value: string) => {
    const next = normalizeDroppedFilePath(value, workspaceDir)
    if (!next || seen.has(next)) {
      return
    }

    seen.add(next)
    out.push(next)
  }

  addTextBlock(data.getData("text/uri-list"), add)
  addTextBlock(data.getData("text/plain"), add)

  for (const type of Array.from(data.types ?? [])) {
    if (type === "text/plain" || type === "text/uri-list") {
      continue
    }

    addStructuredBlock(data.getData(type), add)
  }

  for (const file of Array.from(data.files ?? [])) {
    const value = (file as File & { path?: string }).path
    if (value) {
      add(value)
    }
  }

  return out
}

function addTextBlock(value: string, add: (value: string) => void) {
  if (!value.trim()) {
    return
  }

  for (const line of value.split(/\r?\n/)) {
    const next = line.trim()
    if (!next || next.startsWith("#")) {
      continue
    }
    add(next)
  }
}

function addStructuredBlock(value: string, add: (value: string) => void) {
  if (!value.trim()) {
    return
  }

  try {
    const parsed = JSON.parse(value) as unknown
    for (const candidate of extractStructuredPaths(parsed)) {
      add(candidate)
    }
  } catch {
    addTextBlock(value, add)
  }
}

function extractStructuredPaths(value: unknown): string[] {
  if (typeof value === "string") {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractStructuredPaths(item))
  }

  if (!value || typeof value !== "object") {
    return []
  }

  const record = value as Record<string, unknown>
  const preferred = [
    "resource",
    "resources",
    "uri",
    "uris",
    "path",
    "paths",
    "fsPath",
    "fsPaths",
  ]

  const picked = preferred.flatMap((key) => extractStructuredPaths(record[key]))
  if (picked.length > 0) {
    return picked
  }

  return Object.values(record).flatMap((item) => extractStructuredPaths(item))
}

function normalizeDroppedFilePath(value: string, workspaceDir: string) {
  const path = value.startsWith("file:") ? fileUrlPath(value) : value
  if (!path) {
    return undefined
  }

  if (!workspaceDir) {
    return path
  }

  return path === workspaceDir
    ? path.split(/[\\/]/).pop() || path
    : path.startsWith(`${workspaceDir}/`)
      ? path.slice(workspaceDir.length + 1)
      : path
}

function fileUrlPath(value: string) {
  try {
    return decodeURIComponent(new URL(value).pathname)
  } catch {
    return undefined
  }
}
