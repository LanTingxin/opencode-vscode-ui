import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { createClientAdapter, type SessionInfo } from "../core/sdk"

describe("sdk adapter", () => {
  test("converts find.files dirs boolean to the official v2 string query", async () => {
    let received: unknown
    const sdk = createClientAdapter({
      find: {
        files: async (input: unknown) => {
          received = input
          return { data: [] }
        },
      },
    } as unknown as Parameters<typeof createClientAdapter>[0])

    await sdk.find.files({
      directory: "/workspace",
      query: "src",
      dirs: true,
    })

    assert.deepEqual(received, {
      directory: "/workspace",
      query: "src",
      dirs: "true",
    })
  })

  test("returns the stream shape expected by the event hub", async () => {
    const stream = {
      async *[Symbol.asyncIterator]() {
      },
    }
    const sdk = createClientAdapter({
      event: {
        subscribe: async () => stream,
      },
    } as unknown as Parameters<typeof createClientAdapter>[0])

    const result = await sdk.event.subscribe({ directory: "/workspace" })
    assert.equal(result.stream, stream)
  })

  test("preserves other sdk namespaces like session methods", async () => {
    const listResult = { data: [] }
    class GetterBackedClient {
      get session() {
        return {
          list: async () => listResult,
        }
      }
    }
    const sdk = createClientAdapter(new GetterBackedClient() as unknown as Parameters<typeof createClientAdapter>[0])

    assert.equal(typeof sdk.session?.list, "function")
    assert.equal(await sdk.session.list({ directory: "/workspace", roots: true }), listResult)
  })

  test("exports local semantic aliases backed by official v2 shapes", () => {
    const session: SessionInfo = {
      id: "session-1",
      slug: "session-1",
      projectID: "project-1",
      directory: "/workspace",
      title: "Session 1",
      version: "1",
      time: {
        created: 1,
        updated: 1,
      },
    }

    assert.equal(session.id, "session-1")
    assert.equal(session.directory, "/workspace")
  })
})
