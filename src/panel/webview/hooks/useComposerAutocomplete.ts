import type { ComposerPathKind } from "../../../bridge/types"
import React from "react"
import { parseComposerFileQuery } from "../lib/composer-file-selection"

export type ComposerAutocompleteTrigger = "slash" | "skill" | "mention"

export type ComposerAutocompleteItem = {
  id: string
  label: string
  detail: string
  value?: string
  keywords?: string[]
  trigger: ComposerAutocompleteTrigger
  kind: "action" | "agent" | "resource" | "selection" | "recent" | "file" | "directory" | "command" | "SKILL"
  match?: {
    label: number[]
    detail: number[]
  }
  mention?: ({
    type: "agent"
    name: string
  } | {
    type: "file"
    path: string
    kind?: ComposerPathKind
    selection?: import("../../../bridge/types").ComposerFileSelection
  } | {
    type: "resource"
    uri: string
    name: string
    clientName: string
    mimeType?: string
  }) & {
    content: string
  }
}

export type ComposerAutocompleteState = {
  trigger: ComposerAutocompleteTrigger
  query: string
  start: number
  end: number
  items: ComposerAutocompleteItem[]
  selectedIndex: number
}

type ComposerAutocompleteMatch = {
  trigger: ComposerAutocompleteTrigger
  query: string
  start: number
  end: number
}

const MAX_SLASH_AUTOCOMPLETE_ITEMS = 50
const MAX_MENTION_AUTOCOMPLETE_ITEMS = 10

export function useComposerAutocomplete(sources: ComposerAutocompleteItem[]) {
  const [state, setState] = React.useState<ComposerAutocompleteState | null>(null)

  // When sources change (e.g. file search results arrive), re-filter the current
  // query so the popup updates without requiring another keystroke.
  React.useEffect(() => {
    setState((current) => {
      if (!current) {
        return current
      }
      const items = filterItems(sources, current.trigger, current.query)
      const selectedIndex = items.length === 0 ? 0 : Math.min(current.selectedIndex, items.length - 1)
      if (selectedIndex === current.selectedIndex && sameItems(items, current.items)) {
        return current
      }
      return { ...current, items, selectedIndex }
    })
  }, [sources])

  const sync = React.useCallback((value: string, start: number | null | undefined, end?: number | null | undefined) => {
    const next = matchAutocomplete(value, start, end)
    if (!next) {
      setState(null)
      return
    }

    setState((current) => {
      const items = filterItems(sources, next.trigger, next.query)
      const selectedIndex = items.length === 0
        ? 0
        : current && current.trigger === next.trigger && current.query === next.query
          ? Math.min(current.selectedIndex, items.length - 1)
          : 0

        return {
          trigger: next.trigger,
          query: next.query,
          start: next.start,
          end: next.end,
          items,
          selectedIndex,
        }
    })
  }, [sources])

  const close = React.useCallback(() => {
    setState(null)
  }, [])

  const move = React.useCallback((delta: number) => {
    setState((current) => {
      if (!current || current.items.length === 0) {
        return current
      }

      const size = current.items.length
      const nextIndex = (current.selectedIndex + delta + size) % size
      return {
        ...current,
        selectedIndex: nextIndex,
      }
    })
  }, [])

  const currentItem = state?.items[state.selectedIndex]

  return {
    state,
    currentItem,
    sync,
    close,
    move,
  }
}

export function matchAutocomplete(value: string, start: number | null | undefined, end?: number | null | undefined): ComposerAutocompleteMatch | null {
  if (typeof start !== "number") {
    return null
  }

  if (typeof end === "number" && end !== start) {
    return null
  }

  const slash = matchSlash(value, start)
  if (slash) {
    return slash
  }

  return matchMention(value, start)
}

function matchSlash(value: string, cursor: number): ComposerAutocompleteMatch | null {
  if (cursor < 1 || value[0] !== "/") {
    return null
  }

  const token = value.slice(0, cursor)
  if (/\s/.test(token)) {
    return null
  }

  const next = value[cursor]
  if (next && !/\s/.test(next)) {
    return null
  }

  return {
    trigger: "slash",
    query: value.slice(1, cursor),
    start: 0,
    end: cursor,
  }
}

function matchMention(value: string, cursor: number): ComposerAutocompleteMatch | null {
  if (cursor < 1) {
    return null
  }

  let index = cursor - 1
  while (index >= 0) {
    const char = value[index]
    if (char === "@") {
      const prev = index === 0 ? "" : value[index - 1]
      if (prev && !/\s/.test(prev)) {
        return null
      }

      const next = value[cursor]
      if (next && !/\s/.test(next)) {
        return null
      }

      return {
        trigger: "mention",
        query: value.slice(index + 1, cursor),
        start: index,
        end: cursor,
      }
    }
    if (/\s/.test(char)) {
      return null
    }
    index -= 1
  }

  return null
}

export function filterItems(items: ComposerAutocompleteItem[], trigger: ComposerAutocompleteTrigger, query: string) {
  const source = items.filter((item) => item.trigger === trigger)
  const normalized = query.trim().toLowerCase()

  if (trigger === "slash" || trigger === "skill") {
    if (!normalized) {
      return source
        .map((item) => ({ ...item, match: undefined }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }

    return rankItems(source, normalized, matchRankSlash, MAX_SLASH_AUTOCOMPLETE_ITEMS)
  }

  if (!normalized) {
    return source.map((item) => ({ ...item, match: undefined }))
  }

  return rankItems(source, normalized, matchRankMention, MAX_MENTION_AUTOCOMPLETE_ITEMS)
}

function sameItems(next: ComposerAutocompleteItem[], current: ComposerAutocompleteItem[]) {
  if (next.length !== current.length) {
    return false
  }

  for (let i = 0; i < next.length; i += 1) {
    const a = next[i]
    const b = current[i]
    if (!a || !b) {
      return false
    }
    if (a.id !== b.id || a.label !== b.label || a.detail !== b.detail || a.kind !== b.kind || a.trigger !== b.trigger) {
      return false
    }
  }

  return true
}

function matchRankSlash(item: ComposerAutocompleteItem, query: string) {
  const base = fuzzyScore(item.label, query, 0)
  const desc = fuzzyScore(item.detail, query, 40)
  const scores = [base, desc, ...(item.keywords ?? []).map((k) => fuzzyScore(k, query, 70))]
    .filter((v): v is number => typeof v === "number")
  if (scores.length === 0) return undefined
  const best = Math.min(...scores)
  // Mirror upstream fuzzysort scoreFn: if label starts with the query, boost the rank (halve the score)
  return item.label.startsWith(query) ? best / 2 : best
}

function matchRankMention(item: ComposerAutocompleteItem, query: string) {
  const normalized = mentionQuery(item, query)
  if (!normalized) {
    return 0
  }

  const fields = [
    fuzzyScore(primaryValue(item, query), normalized, 0),
    fuzzyScore(item.detail, normalized, 40),
    ...(item.keywords ?? []).map((value) => fuzzyScore(value, normalized, 70)),
  ].filter((value): value is number => typeof value === "number")

  if (fields.length === 0) {
    return undefined
  }

  const best = Math.min(...fields)
  const visible = prefixValue(item)
  return primaryValue(item, query).startsWith(visible + normalized) ? best / 2 : best
}

function rankItems(
  items: ComposerAutocompleteItem[],
  query: string,
  ranker: (item: ComposerAutocompleteItem, query: string) => number | undefined,
  limit: number,
) {
  return items
    .map((item, index) => ({
      item,
      index,
      rank: ranker(item, query),
    }))
    .filter((item): item is { item: ComposerAutocompleteItem; index: number; rank: number } => item.rank !== undefined)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((item) => withMatch(item.item, query))
}

function withMatch(item: ComposerAutocompleteItem, query: string): ComposerAutocompleteItem {
  const normalized = mentionQuery(item, query)
  return {
    ...item,
    match: {
      label: fuzzyIndexes(item.label, normalized),
      detail: fuzzyIndexes(item.detail, normalized),
    },
  }
}

function mentionQuery(item: ComposerAutocompleteItem, query: string) {
  return item.mention?.type === "file"
    ? parseComposerFileQuery(query).baseQuery.trim().toLowerCase()
    : query
}

function prefixValue(item: ComposerAutocompleteItem) {
  return item.mention?.type === "agent" ? "@" : ""
}

function primaryValue(item: ComposerAutocompleteItem, query: string) {
  if (item.mention?.type === "file") {
    return mentionValue(item, query)
  }

  return (item.value ?? item.label).trimEnd().toLowerCase()
}

function mentionValue(item: ComposerAutocompleteItem, query: string) {
  const mention = item.mention
  if (!mention || mention.type !== "file") {
    return (item.value ?? item.label).trimEnd().toLowerCase()
  }

  const next = mentionForQueryValue(mention.path, mention.kind, query)
  return next.trimEnd().toLowerCase()
}

function mentionForQueryValue(path: string, kind: ComposerPathKind | undefined, query: string) {
  if (kind === "directory") {
    return path
  }

  const parsed = parseComposerFileQuery(query)
  if (!parsed.selection) {
    return path
  }

  return `${path}#${parsed.selection.startLine}${parsed.selection.endLine ? `-${parsed.selection.endLine}` : ""}`
}

function fuzzyIndexes(value: string, query: string) {
  const source = value.toLowerCase()
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return []
  }

  const indexes: number[] = []
  let cursor = 0
  for (const char of needle) {
    const next = source.indexOf(char, cursor)
    if (next === -1) {
      return []
    }
    indexes.push(next)
    cursor = next + 1
  }

  return indexes
}

function fuzzyScore(value: string, query: string, offset: number) {
  const indexes = fuzzyIndexes(value, query)
  if (indexes.length === 0) {
    return undefined
  }

  const normalized = value.toLowerCase()
  const needle = query.trim().toLowerCase()
  let score = offset + Math.max(0, normalized.length - needle.length)

  for (let i = 0; i < indexes.length; i += 1) {
    const index = indexes[i]
    if (i === 0) {
      score += index * 3
    } else {
      const gap = index - indexes[i - 1] - 1
      score += gap * 5
      if (gap === 0) {
        score -= 8
      }
    }

    const prev = index === 0 ? "" : normalized[index - 1]
    if (!prev || prev === "/" || prev === "-" || prev === "_" || prev === ".") {
      score -= 3
    }
  }

  if (normalized === needle) {
    score -= 40
  } else if (normalized.startsWith(needle)) {
    score -= 24
  } else if (normalized.includes(`/${needle}`)) {
    score -= 10
  }

  return score
}
