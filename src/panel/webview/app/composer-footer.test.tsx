import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ComposerFooter } from "./composer-footer"

describe("ComposerFooter", () => {
  test("renders metrics on the left and status badges on the right in the same footer", () => {
    const html = renderToStaticMarkup(
      <ComposerFooter
        metrics={["6,568 tokens", "$0.5203"]}
        badges={[
          { label: "MCP", tone: "gray", items: [] },
          { label: "LSP", tone: "green", items: [] },
          { label: "FMT", tone: "orange", items: [] },
        ]}
      />,
    )

    const metricsIndex = html.indexOf("6,568 tokens")
    const mcpIndex = html.indexOf("MCP")
    const lspIndex = html.indexOf("LSP")
    const fmtIndex = html.indexOf("FMT")

    assert.equal(metricsIndex > -1, true)
    assert.equal(mcpIndex > -1, true)
    assert.equal(lspIndex > -1, true)
    assert.equal(fmtIndex > -1, true)
    assert.equal(metricsIndex < mcpIndex, true)
    assert.equal(mcpIndex < lspIndex, true)
    assert.equal(lspIndex < fmtIndex, true)
  })

  test("renders inline errors without dropping the status badges", () => {
    const html = renderToStaticMarkup(
      <ComposerFooter
        metrics={["6,568 tokens"]}
        error="Network unavailable"
        badges={[
          { label: "MCP", tone: "gray", items: [] },
        ]}
      />,
    )

    assert.equal(html.includes("Network unavailable"), true)
    assert.equal(html.includes("MCP"), true)
  })

  test("renders a context usage progress bar when a usage percent is available", () => {
    const html = renderToStaticMarkup(
      <ComposerFooter
        metrics={["6,568 tokens", "68%", "$0.5203"]}
        contextPercent={68}
        badges={[
          { label: "MCP", tone: "gray", items: [] },
        ]}
      />,
    )

    assert.equal(html.includes("oc-contextUsage"), true)
    assert.equal(html.includes("role=\"progressbar\""), true)
    assert.equal(html.includes("aria-valuenow=\"68\""), true)
    assert.equal(html.includes("width:68%"), true)
  })

  test("omits the context usage progress bar when no usage percent is available", () => {
    const html = renderToStaticMarkup(
      <ComposerFooter
        metrics={["6,568 tokens", "$0.5203"]}
        badges={[
          { label: "MCP", tone: "gray", items: [] },
        ]}
      />,
    )

    assert.equal(html.includes("oc-contextUsage"), false)
  })

  test("renders a context entrypoint when the footer can open the context panel", () => {
    const Footer = ComposerFooter as unknown as (props: Record<string, unknown>) => React.JSX.Element
    const html = renderToStaticMarkup(
      <Footer
        metrics={["6,568 tokens", "68%", "$0.5203"]}
        contextPercent={68}
        onOpenContext={() => {}}
        badges={[
          { label: "MCP", tone: "gray", items: [] },
        ]}
      />,
    )

    assert.equal(html.includes("Open context"), true)
  })
})
