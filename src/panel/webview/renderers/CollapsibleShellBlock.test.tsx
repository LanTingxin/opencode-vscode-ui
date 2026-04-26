import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { CollapsibleShellBlock } from "./CollapsibleShellBlock"

describe("CollapsibleShellBlock", () => {
  test("keeps collapsed output mounted for CSS collapse animation", () => {
    const html = renderToStaticMarkup(
      <CollapsibleShellBlock
        ToolStatus={() => null}
        action="shell"
        title="npm test"
        body="test output"
      />,
    )

    assert.equal(html.includes('aria-expanded="false"'), true)
    assert.equal(html.includes('class="oc-shellBlockBody" aria-hidden="true"'), true)
    assert.equal(html.includes('class="oc-shellBlockBodyClip"'), true)
    assert.equal(html.includes("test output"), true)
  })
})
