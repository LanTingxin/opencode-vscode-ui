import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { createInitialState, persistableAppState, type PersistedAppState } from "./state"

const initialRef = {
  workspaceId: "vscode-remote://ssh-remote+box/workspace",
  dir: "/workspace",
  sessionId: "session-1",
} as const

function persisted(overrides: Partial<PersistedAppState> = {}): PersistedAppState {
  return {
    workspaceId: initialRef.workspaceId,
    dir: initialRef.dir,
    sessionId: initialRef.sessionId,
    composerAgentOverride: "plan",
    composerModelOverrides: {
      build: { providerID: "provider-a", modelID: "model-a" },
    },
    composerRecentModels: [{ providerID: "provider-a", modelID: "model-a" }],
    composerFavoriteModels: [{ providerID: "provider-f", modelID: "model-f" }],
    composerModelVariants: { "provider-a:model-a": "fast" },
    ...overrides,
  }
}

describe("panel webview persisted state", () => {
  test("reuses session-scoped composer state when workspace id and session id match", () => {
    const state = createInitialState(initialRef, persisted())

    assert.equal(state.composerAgentOverride, "plan")
    assert.deepEqual(state.composerModelOverrides, {
      build: { providerID: "provider-a", modelID: "model-a" },
    })
    assert.deepEqual(state.composerRecentModels, [{ providerID: "provider-a", modelID: "model-a" }])
    assert.deepEqual(state.composerFavoriteModels, [{ providerID: "provider-f", modelID: "model-f" }])
    assert.deepEqual(state.composerModelVariants, { "provider-a:model-a": "fast" })
  })

  test("reuses session-scoped state for legacy persisted entries without workspace id", () => {
    const legacy = persisted()
    delete (legacy as Partial<PersistedAppState>).workspaceId

    const state = createInitialState(initialRef, legacy as PersistedAppState)

    assert.equal(state.composerAgentOverride, "plan")
    assert.deepEqual(state.composerRecentModels, [{ providerID: "provider-a", modelID: "model-a" }])
  })

  test("does not reuse session-scoped state when workspace id changes but dir stays the same", () => {
    const state = createInitialState(initialRef, persisted({
      workspaceId: "vscode-remote://ssh-remote+other/workspace",
    }))

    assert.equal(state.composerAgentOverride, undefined)
    assert.deepEqual(state.composerModelOverrides, {})
    assert.deepEqual(state.composerRecentModels, [])
    assert.deepEqual(state.composerModelVariants, {})
    assert.deepEqual(state.composerFavoriteModels, [{ providerID: "provider-f", modelID: "model-f" }])
  })

  test("does not reuse session-scoped state when session id changes", () => {
    const state = createInitialState(initialRef, persisted({ sessionId: "session-2" }))

    assert.equal(state.composerAgentOverride, undefined)
    assert.deepEqual(state.composerModelOverrides, {})
    assert.deepEqual(state.composerRecentModels, [])
  })

  test("persistableAppState writes workspace identity and normalizes model data", () => {
    const state = createInitialState(initialRef)
    state.composerAgentOverride = "plan"
    state.composerModelOverrides = {
      build: { providerID: " provider-a ", modelID: " model-a " },
      invalid: { providerID: "", modelID: "model-b" } as never,
    }
    state.composerRecentModels = [
      { providerID: " provider-a ", modelID: " model-a " },
      { providerID: "", modelID: "model-b" } as never,
    ]
    state.composerFavoriteModels = [
      { providerID: " provider-f ", modelID: " model-f " },
      { providerID: "", modelID: "model-b" } as never,
    ]
    state.composerModelVariants = {
      "provider-a:model-a": " fast ",
      broken: "   ",
    }

    assert.deepEqual(persistableAppState(state), {
      workspaceId: initialRef.workspaceId,
      dir: initialRef.dir,
      sessionId: initialRef.sessionId,
      composerAgentOverride: "plan",
      composerModelOverrides: {
        build: { providerID: "provider-a", modelID: "model-a" },
      },
      composerRecentModels: [{ providerID: "provider-a", modelID: "model-a" }],
      composerFavoriteModels: [{ providerID: "provider-f", modelID: "model-f" }],
      composerModelVariants: { "provider-a:model-a": "fast" },
    })
  })
})
