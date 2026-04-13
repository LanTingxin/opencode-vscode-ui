import { formatComposerFileContent } from "../lib/composer-file-selection"
import type { ComposerPromptPart } from "../../../bridge/types"
import { composerMentions, composerText, ensureTextPart } from "./composer-editor"
import type { ComposerEditorPart } from "./state"

export function promptPartsToComposerParts(parts: ComposerPromptPart[]): ComposerEditorPart[] {
  const next: ComposerEditorPart[] = []

  for (const part of parts) {
    if (part.type === "text") {
      next.push({ type: "text", content: part.text, start: 0, end: 0 })
      continue
    }

    if (part.type === "file") {
      next.push({
        type: "file",
        path: part.path,
        kind: part.kind ?? "file",
        selection: part.selection,
        content: part.source.value || formatComposerFileContent(part.path, part.selection),
        start: 0,
        end: 0,
      })
      next.push({ type: "text", content: " ", start: 0, end: 0 })
      continue
    }

    if (part.type === "resource") {
      next.push({
        type: "resource",
        uri: part.uri,
        name: part.name,
        clientName: part.clientName,
        mimeType: part.mimeType,
        content: part.source.value,
        start: 0,
        end: 0,
      })
      next.push({ type: "text", content: " ", start: 0, end: 0 })
      continue
    }

    if (part.type === "image") {
      continue
    }

    next.push({
      type: "agent",
      name: part.name,
      content: part.source?.value ?? `@${part.name}`,
      start: 0,
      end: 0,
    })
    next.push({ type: "text", content: " ", start: 0, end: 0 })
  }

  return ensureTextPart(next)
}

export function mergeRestoredComposerParts(current: ComposerEditorPart[], restored: ComposerPromptPart[]) {
  if (!hasStructuredParts(restored)) {
    return promptPartsToComposerParts(restored)
  }

  let next = ensureTextPart(current)
  const seen = new Set(composerMentions(next).map(mentionKey))

  for (const part of promptPartsToComposerParts(restored)) {
    if (part.type === "text") {
      continue
    }

    const key = editorPartKey(part)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    next = appendPart(next, part)
  }

  return ensureTextPart(next)
}

function hasStructuredParts(parts: ComposerPromptPart[]) {
  return parts.some((part) => part.type !== "text" && part.type !== "image")
}

function appendPart(parts: ComposerEditorPart[], part: Exclude<ComposerEditorPart, { type: "text" }>) {
  const next = ensureTextPart(parts).map((item) => ({ ...item }))
  const last = next[next.length - 1]

  if (!last || last.type !== "text") {
    next.push({ type: "text", content: " ", start: 0, end: 0 })
  } else if (last.content.length > 0 && !/\s$/.test(last.content)) {
    next[next.length - 1] = { ...last, content: `${last.content} ` }
  }

  next.push({ ...part, start: 0, end: 0 })
  next.push({ type: "text", content: " ", start: 0, end: 0 })
  return ensureTextPart(next)
}

function mentionKey(part: ReturnType<typeof composerMentions>[number]) {
  if (part.type === "agent") {
    return `agent:${part.name}`
  }

  if (part.type === "resource") {
    return `resource:${part.clientName}:${part.uri}`
  }

  return `file:${part.path}:${part.kind ?? "file"}:${part.selection?.startLine ?? ""}:${part.selection?.endLine ?? ""}`
}

function editorPartKey(part: Exclude<ComposerEditorPart, { type: "text" }>) {
  if (part.type === "agent") {
    return `agent:${part.name}`
  }

  if (part.type === "resource") {
    return `resource:${part.clientName}:${part.uri}`
  }

  return `file:${part.path}:${part.kind ?? "file"}:${part.selection?.startLine ?? ""}:${part.selection?.endLine ?? ""}`
}

export function restoredComposerCursor(parts: ComposerEditorPart[]) {
  return composerText(parts).length
}
