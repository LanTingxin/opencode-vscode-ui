import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ComposerFooter } from "./composer-footer"

describe("ComposerFooter", () => {
  test("renders a compact context ring before MCP and LSP while hiding footer metric text and formatter badges", () => {
    const html = renderToStaticMarkup(
      <ComposerFooter
        contextStats={{
          tokens: "6,568",
          usage: "68%",
          cost: "$0.5203",
          percent: 68,
        }}
        onOpenContext={() => {}}
        badges={[
          { label: "MCP", tone: "gray", items: [] },
          { label: "LSP", tone: "green", items: [] },
          { label: "FMT", tone: "orange", items: [] },
        ]}
      />,
    )

    const contextIndex = html.indexOf("Open context")
    const mcpIndex = html.indexOf("MCP")
    const lspIndex = html.indexOf("LSP")
    const fmtIndex = html.indexOf("FMT")

    assert.equal(contextIndex > -1, true)
    assert.equal(mcpIndex > -1, true)
    assert.equal(lspIndex > -1, true)
    assert.equal(fmtIndex > -1, false)
    assert.equal(html.includes("oc-contextRow"), false)
    assert.equal(html.includes(">Context<"), false)
    assert.equal(html.includes("oc-contextButtonRingCore"), false)
    assert.equal(contextIndex < mcpIndex, true)
    assert.equal(mcpIndex < lspIndex, true)
  })

  test("renders inline errors without dropping the status badges", () => {
    const html = renderToStaticMarkup(
      <ComposerFooter
        contextStats={{
          tokens: "6,568",
          usage: "68%",
          cost: "$0.5203",
          percent: 68,
        }}
        error="Network unavailable"
        badges={[
          { label: "MCP", tone: "gray", items: [] },
        ]}
      />,
    )

    assert.equal(html.includes("Network unavailable"), true)
    assert.equal(html.includes("MCP"), true)
  })

  test("renders a hover card with token usage and cost details for the context ring", () => {
    const html = renderToStaticMarkup(
      <ComposerFooter
        contextStats={{
          tokens: "6,568",
          usage: "68%",
          cost: "$0.5203",
          percent: 68,
        }}
        onOpenContext={() => {}}
        badges={[
          { label: "MCP", tone: "gray", items: [] },
        ]}
      />,
    )

    assert.equal(html.includes("oc-contextButtonTooltip"), true)
    assert.equal(html.includes("Token"), true)
    assert.equal(html.includes("Usage"), true)
    assert.equal(html.includes("Cost"), true)
    assert.equal(html.includes("6,568"), true)
    assert.equal(html.includes("68%"), true)
    assert.equal(html.includes("$0.5203"), true)
  })

  test("falls back to placeholder details when context stats are missing usage data", () => {
    const html = renderToStaticMarkup(
      <ComposerFooter
        contextStats={{
          tokens: "0",
          usage: "—",
          cost: "$0.0000",
        }}
        onOpenContext={() => {}}
        badges={[
          { label: "MCP", tone: "gray", items: [] },
        ]}
      />,
    )

    assert.equal(html.includes("aria-valuenow=\"0\""), true)
    assert.equal(html.includes(">—<"), true)
  })
})
