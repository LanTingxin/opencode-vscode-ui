import * as path from "node:path"
import type { ComposerPathResult } from "../../bridge/types"

export function rankPath(filePath: string, query: string) {
  const file = filePath.toLowerCase()
  const value = query.trim().toLowerCase()
  const base = path.basename(trimDirectorySuffix(file))
  if (!value) {
    return 0
  }
  if (base === value) {
    return 0
  }
  if (file === value) {
    return 1
  }
  if (base.startsWith(value)) {
    return 2
  }
  if (file.startsWith(value)) {
    return 3
  }
  const slash = `/${value}`
  if (file.includes(slash)) {
    return 4
  }
  if (base.includes(value)) {
    return 5
  }
  return 6
}

export function matchesPath(filePath: string, query: string) {
  if (!query.trim()) {
    return true
  }

  return typeof pathScore(filePath, query) === "number"
}

export function pathDepth(value: string) {
  return trimDirectorySuffix(value).split("/").filter(Boolean).length
}

export function trimDirectorySuffix(value: string) {
  return value.replace(/\/+$/, "") || value
}

export function collectDirectoryResults(paths: string[], query: string) {
  const seen = new Set<string>()
  const results: ComposerPathResult[] = []

  for (const item of paths) {
    const parts = trimDirectorySuffix(item).split("/")
    for (let i = 1; i <= parts.length; i += 1) {
      const dir = `${parts.slice(0, i).join("/")}/`
      if (!dir || seen.has(dir) || !matchesPath(dir, query)) {
        continue
      }
      seen.add(dir)
      results.push({ path: dir, kind: "directory", source: "search" })
    }
  }

  return results
}

export function sortPaths(paths: string[], query: string) {
  return paths
    .map((item) => ({
      path: item,
      score: pathScore(item, query),
    }))
    .filter((item): item is { path: string; score: number } => typeof item.score === "number")
    .sort((a, b) => a.score - b.score || pathDepth(a.path) - pathDepth(b.path) || a.path.localeCompare(b.path))
    .map((item) => item.path)
}

function pathScore(filePath: string, query: string) {
  const value = query.trim().toLowerCase()
  if (!value) {
    return 0
  }

  const direct = rankPath(filePath, query)
  if (direct < 6) {
    return direct
  }

  const indexes = fuzzyIndexes(filePath, query)
  if (indexes.length === 0) {
    return undefined
  }

  const normalized = filePath.toLowerCase()
  let score = 70 + Math.max(0, normalized.length - value.length)

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

  if (normalized.startsWith(value)) {
    score -= 24
  } else if (normalized.includes(`/${value}`)) {
    score -= 10
  }

  return score
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
