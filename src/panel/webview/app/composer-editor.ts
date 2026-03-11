import type { ComposerAutocompleteItem } from "../hooks/useComposerAutocomplete"
import type { ComposerEditorPart, ComposerMention } from "./state"

export function emptyComposerParts(): ComposerEditorPart[] {
  return [{ type: "text", content: "", start: 0, end: 0 }]
}

export function normalizeComposerParts(parts: ComposerEditorPart[]) {
  const merged: ComposerEditorPart[] = []

  for (const part of parts) {
    if (part.type === "text") {
      const prev = merged[merged.length - 1]
      if (prev?.type === "text") {
        prev.content += part.content
        continue
      }
      merged.push({ ...part })
      continue
    }
    merged.push({ ...part })
  }

  if (merged.length === 0) {
    return emptyComposerParts()
  }

  let cursor = 0
  return merged.map((part) => {
    const next = part.type === "text"
      ? { ...part, start: cursor, end: cursor + part.content.length }
      : { ...part, start: cursor, end: cursor + part.content.length }
    cursor = next.end
    return next
  })
}

export function composerText(parts: ComposerEditorPart[]) {
  return normalizeComposerParts(parts).map((part) => part.content).join("")
}

export function composerMentions(parts: ComposerEditorPart[]): ComposerMention[] {
  return normalizeComposerParts(parts)
    .flatMap((part): ComposerMention[] => part.type === "agent"
      ? [{ type: "agent", name: part.name, content: part.content, start: part.start, end: part.end }]
      : part.type === "file"
        ? [{ type: "file", path: part.path, kind: part.kind, content: part.content, start: part.start, end: part.end }]
        : [])
}

export function composerPartsEqual(a: ComposerEditorPart[], b: ComposerEditorPart[]) {
  const left = normalizeComposerParts(a)
  const right = normalizeComposerParts(b)
  if (left.length !== right.length) {
    return false
  }

  return left.every((part, index) => {
    const other = right[index]
    if (!other || part.type !== other.type || part.content !== other.content || part.start !== other.start || part.end !== other.end) {
      return false
    }
    if (part.type === "agent" && other.type === "agent") {
      return part.name === other.name
    }
    if (part.type === "file" && other.type === "file") {
      return part.path === other.path && part.kind === other.kind
    }
    return part.type === "text" && other.type === "text"
  })
}

export function replaceRangeWithMention(parts: ComposerEditorPart[], start: number, end: number, mention: NonNullable<ComposerAutocompleteItem["mention"]>) {
  const next = replaceRange(parts, start, end, mention.type === "agent"
    ? [{ type: "agent", name: mention.name, content: mention.content, start: 0, end: 0 }, { type: "text", content: " ", start: 0, end: 0 }]
    : [{ type: "file", path: mention.path, kind: mention.kind, content: mention.content, start: 0, end: 0 }, { type: "text", content: " ", start: 0, end: 0 }])

  return {
    parts: next,
    cursor: start + mention.content.length + 1,
  }
}

export function replaceRangeWithText(parts: ComposerEditorPart[], start: number, end: number, content: string) {
  const next = ensureTextPart(replaceRange(parts, start, end, [{ type: "text", content, start: 0, end: 0 }]))
  return {
    parts: next,
    cursor: start + content.length,
  }
}

export function deleteStructuredRange(parts: ComposerEditorPart[], start: number, end: number, key: "Backspace" | "Delete") {
  const full = normalizeComposerParts(parts)
  const text = composerText(full)
  if (start !== end) {
    const range = expandRangeToAtomicParts(full, start, end)
    return {
      parts: ensureTextPart(replaceRange(full, range.start, range.end, [])),
      cursor: range.start,
    }
  }

  if (key === "Backspace") {
    for (let i = full.length - 1; i >= 0; i -= 1) {
      const prev = full[i]
      if (!prev || prev.end !== start) {
        continue
      }
      if (prev.type === "text") {
        return null
      }
      const next = replaceRange(full, prev.start, trimTrailingSpace(text, prev.end), [])
      return { parts: ensureTextPart(next), cursor: prev.start }
    }
    return null
  }

  const next = full.find((part) => part.start === start)
  if (next && next.type !== "text") {
    const after = replaceRange(full, next.start, trimTrailingSpace(text, next.end), [])
    return { parts: ensureTextPart(after), cursor: next.start }
  }
  return null
}

export function expandRangeToAtomicParts(parts: ComposerEditorPart[], start: number, end: number) {
  const text = composerText(parts)
  let rangeStart = start
  let rangeEnd = end

  for (const part of parts) {
    if (part.type === "text") {
      continue
    }
    if (part.start < end && part.end > start) {
      rangeStart = Math.min(rangeStart, part.start)
      rangeEnd = Math.max(rangeEnd, trimTrailingSpace(text, part.end))
    }
  }

  return { start: rangeStart, end: rangeEnd }
}

export function ensureTextPart(parts: ComposerEditorPart[]) {
  const next = normalizeComposerParts(parts)
  return next.length === 0 ? emptyComposerParts() : next
}

function replaceRange(parts: ComposerEditorPart[], start: number, end: number, insert: ComposerEditorPart[]) {
  const next: ComposerEditorPart[] = []

  for (const part of normalizeComposerParts(parts)) {
    if (part.end <= start || part.start >= end) {
      next.push(part)
      continue
    }

    if (part.type === "text") {
      const left = part.content.slice(0, Math.max(0, start - part.start))
      const right = part.content.slice(Math.max(0, end - part.start))
      if (left) {
        next.push({ type: "text", content: left, start: 0, end: 0 })
      }
      if (insert.length > 0) {
        next.push(...insert)
        insert = []
      }
      if (right) {
        next.push({ type: "text", content: right, start: 0, end: 0 })
      }
      continue
    }
  }

  if (insert.length > 0) {
    const before: ComposerEditorPart[] = []
    const after: ComposerEditorPart[] = []
    for (const part of normalizeComposerParts(parts)) {
      if (part.end <= start) {
        before.push(part)
        continue
      }
      if (part.start >= end) {
        after.push(part)
      }
    }
    return normalizeComposerParts([...before, ...insert, ...after])
  }

  return normalizeComposerParts(next)
}

function trimTrailingSpace(text: string, end: number) {
  return text[end] === " " ? end + 1 : end
}
