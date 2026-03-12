import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { AgentInfo, ProviderInfo, SessionMessage } from "../../../core/sdk"
import { composerIdentity, composerSelection, cycleModelVariant, lastUserSelection, pushRecentModel, toggleFavoriteModel } from "./session-meta"

const providers: ProviderInfo[] = [{
  id: "p1",
  name: "Provider 1",
  models: {
    m1: { id: "m1", name: "Model 1", variants: { fast: {}, deep: {} } },
    m2: { id: "m2", name: "Model 2" },
  },
}]

const agents: AgentInfo[] = [
  { name: "build", mode: "primary", model: { providerID: "p1", modelID: "m1" } },
  { name: "plan", mode: "primary", model: { providerID: "p1", modelID: "m2" } },
]

function userMessage(agent: string, modelID: string): SessionMessage {
  return {
    info: {
      id: "msg-1",
      sessionID: "session-1",
      role: "user",
      time: { created: 0 },
      agent,
      model: { providerID: "p1", modelID },
    },
    parts: [],
  }
}

describe("session meta composer state", () => {
  test("composerSelection prefers current override over last user message", () => {
    const selection = composerSelection({
      messages: [userMessage("build", "m1")],
      agents,
      defaultAgent: "build",
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: undefined,
      composerAgentOverride: "plan",
      composerMentionAgentOverride: undefined,
    })

    assert.deepEqual(selection, {
      agent: "plan",
      model: { providerID: "p1", modelID: "m2" },
      variant: undefined,
    })
  })

  test("composerSelection keeps manual agent selection after typing plain text", () => {
    const selection = composerSelection({
      messages: [userMessage("build", "m1")],
      agents,
      defaultAgent: "build",
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: undefined,
      composerAgentOverride: "plan",
      composerMentionAgentOverride: undefined,
    })

    assert.deepEqual(selection, {
      agent: "plan",
      model: { providerID: "p1", modelID: "m2" },
      variant: undefined,
    })
  })

  test("composerSelection falls back to default current agent without override", () => {
    const selection = composerSelection({
      messages: [userMessage("plan", "m2")],
      agents,
      defaultAgent: "build",
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: undefined,
      composerAgentOverride: undefined,
      composerMentionAgentOverride: undefined,
    })

    assert.deepEqual(selection, {
      agent: "build",
      model: { providerID: "p1", modelID: "m1" },
      variant: undefined,
    })
  })

  test("composerIdentity shows current selection before historical message state", () => {
    const identity = composerIdentity({
      messages: [userMessage("build", "m1")],
      agents,
      defaultAgent: "build",
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: undefined,
      agentMode: "build",
      composerAgentOverride: "plan",
      composerMentionAgentOverride: undefined,
    })

    assert.deepEqual(identity, {
      agent: "plan",
      model: "Model 2",
      provider: "Provider 1",
      modelRef: { providerID: "p1", modelID: "m2" },
      variant: "",
    })
  })

  test("composerSelection lets agent mentions override manual selection for current draft", () => {
    const selection = composerSelection({
      messages: [userMessage("build", "m1")],
      agents,
      defaultAgent: "build",
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: undefined,
      composerAgentOverride: "build",
      composerMentionAgentOverride: "plan",
    })

    assert.deepEqual(selection, {
      agent: "plan",
      model: { providerID: "p1", modelID: "m2" },
      variant: undefined,
    })
  })

  test("composerSelection prefers manual model override for the current agent", () => {
    const selection = composerSelection({
      messages: [userMessage("build", "m1")],
      agents,
      defaultAgent: "build",
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: undefined,
      composerAgentOverride: "build",
      composerMentionAgentOverride: undefined,
      composerModelOverrides: {
        build: { providerID: "p1", modelID: "m2" },
      },
      composerModelVariants: {},
    })

    assert.deepEqual(selection, {
      agent: "build",
      model: { providerID: "p1", modelID: "m2" },
      variant: undefined,
    })
  })

  test("composerSelection falls back to configured model when the agent has no model", () => {
    const selection = composerSelection({
      messages: [],
      agents: [{ name: "build", mode: "primary" }],
      defaultAgent: "build",
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: { providerID: "p1", modelID: "m2" },
      composerAgentOverride: undefined,
      composerMentionAgentOverride: undefined,
      composerModelOverrides: {},
      composerModelVariants: {},
    })

    assert.deepEqual(selection, {
      agent: "build",
      model: { providerID: "p1", modelID: "m2" },
      variant: undefined,
    })
  })

  test("composerSelection returns stored variant for the selected model", () => {
    const selection = composerSelection({
      messages: [],
      agents,
      defaultAgent: "build",
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: undefined,
      composerAgentOverride: undefined,
      composerMentionAgentOverride: undefined,
      composerModelOverrides: {},
      composerModelVariants: {
        "p1/m1": "fast",
      },
    })

    assert.deepEqual(selection, {
      agent: "build",
      model: { providerID: "p1", modelID: "m1" },
      variant: "fast",
    })
  })

  test("lastUserSelection returns the latest valid user model and variant", () => {
    const selection = lastUserSelection([
      userMessage("build", "m1"),
      {
        info: {
          id: "msg-2",
          sessionID: "session-1",
          role: "user",
          time: { created: 1 },
          agent: "plan",
          model: { providerID: "p1", modelID: "m2" },
          variant: "deep",
        },
        parts: [],
      },
    ], providers)

    assert.deepEqual(selection, {
      messageID: "msg-2",
      agent: "plan",
      model: { providerID: "p1", modelID: "m2" },
      variant: "deep",
    })
  })

  test("composerSelection falls back to the most recent valid model before provider default", () => {
    const selection = composerSelection({
      messages: [],
      agents: [],
      defaultAgent: undefined,
      providers,
      providerDefault: { p1: "m1" },
      configuredModel: undefined,
      composerAgentOverride: undefined,
      composerMentionAgentOverride: undefined,
      composerRecentModels: [{ providerID: "p1", modelID: "m2" }],
      composerModelOverrides: {},
      composerModelVariants: {},
    })

    assert.deepEqual(selection, {
      agent: undefined,
      model: { providerID: "p1", modelID: "m2" },
      variant: undefined,
    })
  })

  test("pushRecentModel keeps a deduped MRU list capped at 10", () => {
    const recents = Array.from({ length: 10 }, (_item, index) => ({ providerID: "p1", modelID: `m${index}` }))
    const next = pushRecentModel(recents, { providerID: "p1", modelID: "m5" })
    assert.equal(next[0].modelID, "m5")
    assert.equal(next.length, 10)
  })

  test("toggleFavoriteModel adds and removes a model", () => {
    const added = toggleFavoriteModel([], { providerID: "p1", modelID: "m1" })
    assert.deepEqual(added, [{ providerID: "p1", modelID: "m1" }])
    const removed = toggleFavoriteModel(added, { providerID: "p1", modelID: "m1" })
    assert.deepEqual(removed, [])
  })

  test("cycleModelVariant follows upstream undefined to next to undefined semantics", () => {
    assert.equal(cycleModelVariant(providers, { providerID: "p1", modelID: "m1" }, undefined), "fast")
    assert.equal(cycleModelVariant(providers, { providerID: "p1", modelID: "m1" }, "fast"), "deep")
    assert.equal(cycleModelVariant(providers, { providerID: "p1", modelID: "m1" }, "deep"), undefined)
  })
})
