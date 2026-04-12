import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { classifyCapabilityError, createEmptyCapabilities } from "../core/capabilities"

describe("capabilities", () => {
  test("starts with unknown feature support", () => {
    const snapshot = createEmptyCapabilities()
    assert.equal(snapshot.sessionSearch, "unknown")
    assert.equal(snapshot.sessionChildren, "unknown")
  })

  test("treats not implemented style errors as unsupported", () => {
    assert.equal(classifyCapabilityError(new Error("404 not found")), "unsupported")
  })

  test("treats transient failures as unknown", () => {
    assert.equal(classifyCapabilityError(new Error("socket hang up")), "unknown")
  })
})
