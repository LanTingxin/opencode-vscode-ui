import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { MarkdownBlock } from "./MarkdownBlock"

describe("MarkdownBlock file links", () => {
  test("keeps file references inside the webview instead of opening a browser tab", () => {
    const html = renderToStaticMarkup(
      <MarkdownBlock
        fileRefStatus={new Map()}
        onOpenFile={() => {}}
        onResolveFileRefs={() => {}}
        content="[AGENTS.md](AGENTS.md) [OpenCode](https://example.com)"
      />,
    )

    assert.doesNotMatch(html, /href="AGENTS\.md"[^>]*target="_blank"/)
    assert.match(html, /href="https:\/\/example\.com"[^>]*target="_blank"/)
  })

  test("does not treat auto-linkified bare markdown filenames as external browser links", () => {
    const html = renderToStaticMarkup(
      <MarkdownBlock
        fileRefStatus={new Map()}
        onOpenFile={() => {}}
        onResolveFileRefs={() => {}}
        content="README.md"
      />,
    )

    assert.doesNotMatch(html, /href="http:\/\/README\.md"[^>]*target="_blank"/)
  })

  test("renders thematic breaks as real horizontal rules", () => {
    const html = renderToStaticMarkup(
      <MarkdownBlock
        fileRefStatus={new Map()}
        onOpenFile={() => {}}
        onResolveFileRefs={() => {}}
        content={"before\n\n---\n\nafter"}
      />,
    )

    assert.match(html, /<hr>/)
    assert.doesNotMatch(html, /<p>---<\/p>/)
  })

  test("renders markdown task lists as disabled checkboxes", () => {
    const html = renderToStaticMarkup(
      <MarkdownBlock
        fileRefStatus={new Map()}
        onOpenFile={() => {}}
        onResolveFileRefs={() => {}}
        content={"- [x] done\n- [ ] pending"}
      />,
    )

    assert.match(html, /class="oc-taskList"/)
    assert.match(html, /class="oc-taskListCheckbox" type="checkbox" checked disabled/)
    assert.match(html, /class="oc-taskListCheckbox" type="checkbox" disabled/)
    assert.doesNotMatch(html, /\[x\] done/)
    assert.doesNotMatch(html, /\[ \] pending/)
  })

  test("does not render trailing blank lines in fenced code blocks", () => {
    const html = renderToStaticMarkup(
      <MarkdownBlock
        fileRefStatus={new Map()}
        onOpenFile={() => {}}
        onResolveFileRefs={() => {}}
        content={"```text\nfirst\n\nsecond\n\n```"}
      />,
    )

    const renderedLines = html.match(/class="oc-codeWindowLine"/g) ?? []
    assert.equal(renderedLines.length, 3)
  })
})
