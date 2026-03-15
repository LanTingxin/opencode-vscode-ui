import React from "react"
import { highlightCode } from "./CodeBlock"

export function DiffBlock({ value, mode = "unified" }: { value: string; mode?: "unified" | "split" }) {
  return <DiffBlockImpl value={value} mode={mode} />
}

export function DiffWindowBody({ value, mode = "unified", filePath }: { value: string; mode?: "unified" | "split"; filePath?: string }) {
  return <DiffBlockImpl value={value} mode={mode} windowed filePath={filePath} />
}

export function diffOutputLineCount(value: string, mode: "unified" | "split") {
  if (mode === "split") {
    return splitDiffRows(value).length
  }
  return parseUnifiedDiffRows(value).length
}

function DiffBlockImpl({ value, mode, windowed = false, filePath }: { value: string; mode: "unified" | "split"; windowed?: boolean; filePath?: string }) {
  if (mode === "split") {
    return <SplitDiffBlock value={value} windowed={windowed} filePath={filePath} />
  }
  const rows = React.useMemo(() => parseUnifiedDiffRows(value), [value])
  const language = React.useMemo(() => codeLanguage(filePath), [filePath])
  return (
    <div className={`oc-diffBlock${windowed ? " is-window" : ""}`}>
      {rows.map((row, index) => (
        <div key={`${index}:${row.oldLine ?? ""}:${row.newLine ?? ""}:${row.marker}:${row.text}`} className={diffRowClass(row.type)}>
          <span className="oc-diffLineNo">{formatDiffLineNumber(row.oldLine)}</span>
          <span className="oc-diffLineNo">{formatDiffLineNumber(row.newLine)}</span>
          <span className="oc-diffLineMarker">{row.marker}</span>
          <DiffCodeText text={row.text} language={language} />
        </div>
      ))}
    </div>
  )
}

function SplitDiffBlock({ value, windowed = false, filePath }: { value: string; windowed?: boolean; filePath?: string }) {
  const rows = React.useMemo(() => splitDiffRows(value), [value])
  const language = React.useMemo(() => codeLanguage(filePath), [filePath])
  return (
    <div className={`oc-splitDiff${windowed ? " is-window" : ""}`}>
      <div className="oc-splitDiffBody">
        {rows.map((row, index) => (
          <React.Fragment key={`${index}:${row.left}:${row.right}`}>
            <div className={splitDiffClass(row.leftType)}>
              <span className="oc-diffLineNo">{formatDiffLineNumber(row.leftLine)}</span>
              <span className="oc-diffLineMarker">{row.leftMarker}</span>
              <DiffCodeText text={row.left} language={language} />
            </div>
            <div className={splitDiffClass(row.rightType)}>
              <span className="oc-diffLineNo">{formatDiffLineNumber(row.rightLine)}</span>
              <span className="oc-diffLineMarker">{row.rightMarker}</span>
              <DiffCodeText text={row.right} language={language} />
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function DiffCodeText({ text, language }: { text: string; language: string }) {
  const html = React.useMemo(() => highlightCode(text || " ", language), [language, text])
  return <span className="oc-diffLineText hljs" dangerouslySetInnerHTML={{ __html: html }} />
}

function splitDiffRows(value: string) {
  const rows: Array<{ left: string; right: string; leftType: string; rightType: string; leftLine?: number; rightLine?: number; leftMarker: string; rightMarker: string }> = []
  const hunks = parseDiffHunks(value)
  for (const hunk of hunks) {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    for (let index = 0; index < hunk.lines.length; index += 1) {
      const line = hunk.lines[index] || ""
      if (line.startsWith("\\ No newline at end of file")) {
        rows.push({ left: line, right: line, leftType: "ctx", rightType: "ctx", leftMarker: "", rightMarker: "" })
        continue
      }
      if (line.startsWith("-")) {
        const next = hunk.lines[index + 1] || ""
        if (next.startsWith("+")) {
          rows.push({ left: line.slice(1), right: next.slice(1), leftType: "del", rightType: "add", leftLine: oldLine, rightLine: newLine, leftMarker: "-", rightMarker: "+" })
          oldLine += 1
          newLine += 1
          index += 1
          continue
        }
        rows.push({ left: line.slice(1), right: "", leftType: "del", rightType: "empty", leftLine: oldLine, leftMarker: "-", rightMarker: "" })
        oldLine += 1
        continue
      }
      if (line.startsWith("+")) {
        rows.push({ left: "", right: line.slice(1), leftType: "empty", rightType: "add", rightLine: newLine, leftMarker: "", rightMarker: "+" })
        newLine += 1
        continue
      }
      const text = line.startsWith(" ") ? line.slice(1) : line
      rows.push({ left: text, right: text, leftType: "ctx", rightType: "ctx", leftLine: oldLine, rightLine: newLine, leftMarker: " ", rightMarker: " " })
      oldLine += 1
      newLine += 1
    }
  }
  return rows
}

function parseUnifiedDiffRows(value: string) {
  const rows: Array<{ type: string; text: string; oldLine?: number; newLine?: number; marker: string }> = []
  const hunks = parseDiffHunks(value)
  for (const hunk of hunks) {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    for (const line of hunk.lines) {
      if (line.startsWith("\\ No newline at end of file")) {
        rows.push({ type: "ctx", text: line, marker: "" })
        continue
      }
      if (line.startsWith("-")) {
        rows.push({ type: "del", text: line.slice(1), oldLine, marker: "-" })
        oldLine += 1
        continue
      }
      if (line.startsWith("+")) {
        rows.push({ type: "add", text: line.slice(1), newLine, marker: "+" })
        newLine += 1
        continue
      }
      const text = line.startsWith(" ") ? line.slice(1) : line
      rows.push({ type: "ctx", text, oldLine, newLine, marker: " " })
      oldLine += 1
      newLine += 1
    }
  }
  return rows
}

function parseDiffHunks(value: string) {
  const lines = value.split("\n")
  const hunks: Array<{ oldStart: number; newStart: number; lines: string[] }> = []
  let current: { oldStart: number; newStart: number; lines: string[] } | null = null
  for (const rawLine of lines) {
    const line = rawLine || ""
    if (line.startsWith("@@")) {
      const header = parseHunkHeader(line)
      current = { oldStart: header.oldStart, newStart: header.newStart, lines: [] }
      hunks.push(current)
      continue
    }
    if (!current) {
      continue
    }
    current.lines.push(line)
  }
  return hunks
}

function parseHunkHeader(line: string) {
  const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line)
  return {
    oldStart: match ? Number.parseInt(match[1] || "0", 10) : 0,
    newStart: match ? Number.parseInt(match[3] || "0", 10) : 0,
  }
}

function formatDiffLineNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : ""
}

function splitDiffClass(type: string) {
  if (type === "add") return "oc-splitDiffLine is-add"
  if (type === "del") return "oc-splitDiffLine is-del"
  if (type === "empty") return "oc-splitDiffLine is-empty"
  return "oc-splitDiffLine"
}

function diffRowClass(type: string) {
  if (type === "add") return "oc-diffLine is-add"
  if (type === "del") return "oc-diffLine is-del"
  return "oc-diffLine"
}

function codeLanguage(filePath?: string) {
  const value = typeof filePath === "string" ? filePath : ""
  const normalized = value.toLowerCase()
  if (normalized.endsWith(".ts")) return "typescript"
  if (normalized.endsWith(".tsx")) return "tsx"
  if (normalized.endsWith(".js")) return "javascript"
  if (normalized.endsWith(".jsx")) return "jsx"
  if (normalized.endsWith(".json")) return "json"
  if (normalized.endsWith(".css")) return "css"
  if (normalized.endsWith(".html")) return "html"
  if (normalized.endsWith(".md")) return "markdown"
  if (normalized.endsWith(".sh")) return "bash"
  if (normalized.endsWith(".yml") || normalized.endsWith(".yaml")) return "yaml"
  return ""
}
