import type { ComposerFileSelection } from "../../../bridge/types"

export function parseComposerFileQuery(input: string) {
  const index = input.lastIndexOf("#")
  if (index === -1) {
    return { baseQuery: input }
  }

  const baseQuery = input.slice(0, index)
  const value = input.slice(index + 1)
  const match = value.match(/^(\d+)(?:-(\d*))?$/)
  if (!match) {
    return { baseQuery }
  }

  const startLine = Number(match[1])
  if (!Number.isFinite(startLine) || startLine < 1) {
    return { baseQuery }
  }

  const rawEnd = match[2]
  const endLine = rawEnd && startLine < Number(rawEnd) ? Number(rawEnd) : undefined
  return {
    baseQuery,
    selection: {
      startLine,
      endLine,
    },
  }
}

export function formatComposerFileSelection(selection?: ComposerFileSelection) {
  if (!selection) {
    return ""
  }

  return selection.endLine ? `#${selection.startLine}-${selection.endLine}` : `#${selection.startLine}`
}

export function formatComposerFileContent(path: string, selection?: ComposerFileSelection) {
  return `@${path}${formatComposerFileSelection(selection)}`
}

export function formatComposerFileDisplay(path: string, selection?: ComposerFileSelection) {
  return `${path}${formatComposerFileSelection(selection)}`
}

export function describeComposerFileSelection(selection?: ComposerFileSelection) {
  if (!selection) {
    return ""
  }

  return selection.endLine ? `Selected lines ${selection.startLine}-${selection.endLine}` : `Selected line ${selection.startLine}`
}
