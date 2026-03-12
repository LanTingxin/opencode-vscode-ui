import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { SessionInfo } from "../../core/sdk"
import { nav, relatedSessionMap, subtreeSessionIds } from "./navigation"

function session(id: string, options?: Partial<SessionInfo>): SessionInfo {
  return {
    id,
    directory: "/workspace",
    title: id,
    time: {
      created: 0,
      updated: 0,
      archived: options?.time?.archived,
    },
    ...options,
  }
}

describe("navigation", () => {
  test("ignores archived child sessions in subtree session ids and child map", () => {
    const root = session("root")
    const activeChild = session("child-active", { parentID: "root" })
    const archivedChild = session("child-archived", { parentID: "root", time: { created: 0, updated: 0, archived: 1 } })

    const related = subtreeSessionIds(root.id, [root, activeChild, archivedChild])

    assert.deepEqual(related, ["root", "child-active"])
    assert.deepEqual(Object.keys(relatedSessionMap([root, activeChild, archivedChild], root.id, related)), ["child-active"])
  })

  test("walks visible descendants breadth first", () => {
    const root = session("root")
    const childA = session("child-a", { parentID: "root" })
    const childB = session("child-b", { parentID: "root" })
    const grandchild = session("grandchild", { parentID: "child-a" })

    assert.deepEqual(subtreeSessionIds(root.id, [root, childB, grandchild, childA]), [
      "root",
      "child-a",
      "child-b",
      "grandchild",
    ])
  })

  test("does not expose archived child sessions through firstChild navigation", () => {
    const root = session("root")
    const archivedChild = session("child-archived", { parentID: "root", time: { created: 0, updated: 0, archived: 1 } })
    const activeChild = session("child-active", { parentID: "root" })

    assert.deepEqual(nav(root, [root, archivedChild, activeChild]).firstChild, {
      id: "child-active",
      title: "child-active",
    })
  })
})
