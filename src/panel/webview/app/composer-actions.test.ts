import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { resolveComposerSlashAction } from "./composer-actions"

describe("resolveComposerSlashAction", () => {
  test("routes /new to a local new-session action", () => {
    assert.deepEqual(resolveComposerSlashAction("/new", []), {
      type: "newSession",
    })
    assert.deepEqual(resolveComposerSlashAction("  /new  ", []), {
      type: "newSession",
    })
  })

  test("routes known slash commands through the host command path", () => {
    assert.deepEqual(resolveComposerSlashAction("/compact now", [{
      name: "compact",
      description: "Compact the session",
      hints: [],
      source: "command",
    }]), {
      type: "command",
      command: "compact",
      arguments: "now",
    })
  })

  test("ignores unknown slash commands", () => {
    assert.equal(resolveComposerSlashAction("/missing", []), undefined)
  })
})
