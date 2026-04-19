import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { isCompletedSlashCommand, resolveComposerSlashAction } from "./composer-actions"

describe("resolveComposerSlashAction", () => {
  test("routes /new to a local new-session action", () => {
    assert.deepEqual(resolveComposerSlashAction("/new", []), {
      type: "newSession",
    })
    assert.deepEqual(resolveComposerSlashAction("  /new  ", []), {
      type: "newSession",
    })
  })

  test("routes /skills to the local skill-picker action", () => {
    assert.deepEqual(resolveComposerSlashAction("/skills", []), {
      type: "openSkillPicker",
    })
  })

  test("routes /theme to the local theme-picker action", () => {
    assert.deepEqual(resolveComposerSlashAction("/theme", []), {
      type: "openThemePicker",
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

  test("routes skill slash commands through the host command path", () => {
    assert.deepEqual(resolveComposerSlashAction("/using-superpowers", [{
      name: "using-superpowers",
      description: "Load the superpowers workflow",
      hints: [],
      source: "skill",
    }]), {
      type: "command",
      command: "using-superpowers",
      arguments: "",
    })
  })

  test("ignores unknown slash commands", () => {
    assert.equal(resolveComposerSlashAction("/missing", []), undefined)
  })
})

describe("isCompletedSlashCommand", () => {
  test("treats skill commands as completed slash commands", () => {
    assert.equal(isCompletedSlashCommand("/using-superpowers ", [{
      name: "using-superpowers",
      description: "Load the superpowers workflow",
      hints: [],
      source: "skill",
    }]), true)
  })

  test("does not treat local skills action as a completed slash command", () => {
    assert.equal(isCompletedSlashCommand("/skills", [{
      name: "using-superpowers",
      description: "Load the superpowers workflow",
      hints: [],
      source: "skill",
    }]), false)
  })
})
