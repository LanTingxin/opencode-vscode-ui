import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { CapabilityStore, classifyCapabilityError, createEmptyCapabilities, probeRuntimeCapabilities } from "../core/capabilities"

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

  test("reuses cached capability snapshots until refresh", async () => {
    let calls = 0
    const manager = new CapabilityStore({
      probe: async () => {
        calls += 1
        return { ...createEmptyCapabilities(), sessionSearch: "supported" }
      },
    })

    const first = await manager.getOrProbe("ws-1")
    const second = await manager.getOrProbe("ws-1")

    assert.equal(first.sessionSearch, "supported")
    assert.equal(second.sessionSearch, "supported")
    assert.equal(calls, 1)
  })

  test("re-probes after clearing a cached workspace snapshot", async () => {
    let calls = 0
    const manager = new CapabilityStore({
      probe: async () => {
        calls += 1
        return { ...createEmptyCapabilities(), sessionSearch: "supported" }
      },
    })

    await manager.getOrProbe("ws-1")
    manager.clear("ws-1")
    await manager.getOrProbe("ws-1")

    assert.equal(calls, 2)
  })

  test("marks revert capability unsupported when the sdk surface is missing", async () => {
    const capabilities = await probeRuntimeCapabilities({
      dir: "/workspace",
      sessions: new Map(),
      sdk: {
        session: {
          list: async () => ({ data: [] }),
        },
        experimental: {
          resource: {
            list: async () => ({ data: {} }),
          },
        },
      } as any,
    })

    assert.equal(capabilities.sessionRevert, "unsupported")
  })
})
