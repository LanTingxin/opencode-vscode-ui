import * as path from "node:path"
import { fileURLToPath } from "node:url"
import * as vscode from "vscode"
import type { ComposerPathResult } from "../../bridge/types"
import { postToWebview } from "../../bridge/host"
import { collectDirectoryResults, matchesPath, sortPaths, trimDirectorySuffix } from "./file-search"

const FILE_SEARCH_LIMIT = 24
const FILE_SEARCH_POOL = 2000
const DIRECTORY_SEARCH_LIMIT = 400
const FILE_SEARCH_EXCLUDE = "{**/.git/**,**/node_modules/**,**/dist/**,**/.memory/**,**/opencode/**}"
const EXCLUDED_PATH_PARTS = new Set([".git", "node_modules", "dist", ".memory", "opencode"])

export async function openFile(workspaceDir: string, filePath: string, line?: number) {
  const target = await resolveFileUri(workspaceDir, filePath)
  if (!target) {
    return
  }

  const document = await vscode.workspace.openTextDocument(target)
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: vscode.ViewColumn.Active,
  })

  if (!line || line < 1) {
    return
  }

  const targetLine = Math.min(Math.max(line - 1, 0), Math.max(document.lineCount - 1, 0))
  const position = new vscode.Position(targetLine, 0)
  editor.selection = new vscode.Selection(position, position)
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
}

export async function resolveFileUri(workspaceDir: string, filePath: string) {
  const resolved = await resolvePromptPath(workspaceDir, filePath)
  if (!resolved || resolved.kind === "directory") {
    return undefined
  }

  return resolved.uri
}

export async function resolvePromptPath(workspaceDir: string, filePath: string) {
  const value = filePath.trim()
  if (!value) {
    return undefined
  }

  const target = toFileUri(trimDirectorySuffix(value), workspaceDir)
  if (!target) {
    return undefined
  }

  try {
    const stat = await vscode.workspace.fs.stat(target)
    return {
      uri: target,
      kind: (stat.type & vscode.FileType.Directory) !== 0 ? "directory" as const : "file" as const,
    }
  } catch {
    return undefined
  }
}

export async function resolveFileRefs(webview: vscode.Webview, workspaceDir: string, refs: Array<{ key: string; filePath: string }>) {
  const resolved = await Promise.all(refs.map(async (item) => ({
    key: item.key,
    exists: !!await resolveFileUri(workspaceDir, item.filePath),
  })))

  await postToWebview(webview, {
    type: "fileRefsResolved",
    refs: resolved,
  })
}

export async function searchFiles(webview: vscode.Webview, workspaceDir: string, requestID: string, query: string) {
  const value = query.trim()
  const selection = selectedFileResults(workspaceDir, value)
  const recent = recentFileResults(workspaceDir, value)
  const search = value ? await searchWorkspacePaths(workspaceDir, value) : []
  const results = dedupeResults([...selection, ...recent, ...search]).slice(0, FILE_SEARCH_LIMIT)

  await postToWebview(webview, {
    type: "fileSearchResults",
    requestID,
    query,
    results,
  })
}

function selectedFileResults(workspaceDir: string, query: string): ComposerPathResult[] {
  const editor = vscode.window.activeTextEditor
  const filePath = toWorkspacePath(workspaceDir, editor?.document.uri)
  if (!editor || !filePath || editor.selection.isEmpty) {
    return []
  }

  if (query && !matchesPath(filePath, query)) {
    return []
  }

  const startLine = Math.min(editor.selection.start.line, editor.selection.end.line) + 1
  const endLine = Math.max(editor.selection.start.line, editor.selection.end.line) + 1
  return [{
    path: filePath,
    kind: "file",
    source: "selection",
    selection: startLine === endLine ? { startLine } : { startLine, endLine },
  }]
}

async function searchWorkspacePaths(workspaceDir: string, value: string): Promise<ComposerPathResult[]> {
  const base = vscode.Uri.file(workspaceDir)
  const pattern = new vscode.RelativePattern(base, "**/*")
  const files = await vscode.workspace.findFiles(pattern, FILE_SEARCH_EXCLUDE, FILE_SEARCH_POOL)
  const filePaths = files
    .map((uri) => path.relative(workspaceDir, uri.fsPath).replace(/\\/g, "/"))
    .filter((item) => item && !item.startsWith(".."))
  const directories = collectDirectoryResults(await listWorkspaceDirectories(workspaceDir), value)
  const paths = sortPaths(filePaths, value)
  const rankedDirectories = sortPaths(directories.map((item) => item.path), value)

  const results: ComposerPathResult[] = paths.map((item) => ({
    path: item,
    kind: "file",
    source: "search",
  }))

  results.push(...rankedDirectories.map((item) => ({
    path: item,
    kind: "directory" as const,
    source: "search" as const,
  })))
  return results
}

function recentFileResults(workspaceDir: string, query: string): ComposerPathResult[] {
  const candidates = [
    vscode.window.activeTextEditor?.document.uri,
    ...vscode.window.visibleTextEditors.map((editor) => editor.document.uri),
    ...vscode.workspace.textDocuments.map((document) => document.uri),
  ]

  const seen = new Set<string>()
  const paths: string[] = []
  for (const uri of candidates) {
    const relative = toWorkspacePath(workspaceDir, uri)
    if (!relative || seen.has(relative)) {
      continue
    }
    seen.add(relative)
    paths.push(relative)
  }

  const value = query.trim().toLowerCase()
  const matched = paths.filter((item) => !value || matchesPath(item, value))
  const ranked = value ? sortPaths(matched, query) : matched

  return ranked.map((item) => ({ path: item, kind: "file" as const, source: "recent" as const }))
}

export function toFileUri(filePath: string, workspaceDir: string) {
  if (filePath.startsWith("file://")) {
    try {
      return vscode.Uri.file(fileURLToPath(filePath))
    } catch {
      return undefined
    }
  }

  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(path.normalize(filePath))
  }

  return vscode.Uri.file(path.join(workspaceDir, filePath))
}

function dedupeResults(items: ComposerPathResult[]) {
  const seen = new Set<string>()
  const results: ComposerPathResult[] = []
  for (const item of items) {
    const key = `${item.kind}:${item.path}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    results.push(item)
  }
  return results
}

function toWorkspacePath(workspaceDir: string, uri: vscode.Uri | undefined) {
  if (!uri || uri.scheme !== "file") {
    return undefined
  }

  const relative = path.relative(workspaceDir, uri.fsPath).replace(/\\/g, "/")
  if (!relative || relative.startsWith("..")) {
    return undefined
  }

  const parts = relative.split("/")
  if (parts.some((part) => EXCLUDED_PATH_PARTS.has(part))) {
    return undefined
  }

  return relative
}

async function listWorkspaceDirectories(workspaceDir: string) {
  const results: string[] = []
  const queue = [vscode.Uri.file(workspaceDir)]

  while (queue.length > 0 && results.length < DIRECTORY_SEARCH_LIMIT) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    let entries: [string, vscode.FileType][]
    try {
      entries = await vscode.workspace.fs.readDirectory(current)
    } catch {
      continue
    }

    for (const [name, type] of entries) {
      if ((type & vscode.FileType.Directory) === 0 || EXCLUDED_PATH_PARTS.has(name)) {
        continue
      }

      const next = vscode.Uri.joinPath(current, name)
      const relative = path.relative(workspaceDir, next.fsPath).replace(/\\/g, "/")
      if (!relative || relative.startsWith("..")) {
        continue
      }

      results.push(`${relative}/`)
      if (results.length >= DIRECTORY_SEARCH_LIMIT) {
        break
      }
      queue.push(next)
    }
  }

  return results
}
