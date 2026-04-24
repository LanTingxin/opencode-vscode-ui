import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ImagePreviewOverlay } from "./image-preview"

describe("ImagePreviewOverlay", () => {
  test("marks previewed images for the VS Code context menu without persistent action buttons", () => {
    const html = renderToStaticMarkup(
      <ImagePreviewOverlay
        image={{ src: "data:image/png;base64,abc123", name: "screen.png" }}
        onClose={() => {}}
      />,
    )

    assert.equal(html.includes("&quot;webviewSection&quot;:&quot;imagePreview&quot;"), true)
    assert.equal(html.includes("&quot;preventDefaultContextMenuItems&quot;:true"), true)
    assert.equal(html.includes('aria-label="Copy image screen.png"'), false)
    assert.equal(html.includes('aria-label="Save image screen.png"'), false)
    assert.equal(html.includes('src="data:image/png;base64,abc123"'), true)
  })
})
