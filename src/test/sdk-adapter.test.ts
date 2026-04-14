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

  test("preserves official namespaces outside the local compatibility shims", async () => {
    const currentResult = { data: { id: "project-1" } }
    class GetterBackedClient {
      get project() {
        return {
          current: async () => currentResult,
        }
      }
    }

    const sdk = createClientAdapter(new GetterBackedClient() as unknown as Parameters<typeof createClientAdapter>[0])

    assert.equal(typeof sdk.project?.current, "function")
    assert.equal(await sdk.project.current({ directory: "/workspace" }), currentResult)
  })

  test("adapts getter-only find and event namespaces without mutating the official client", async () => {
    let receivedFind: unknown
    const stream = {
      async *[Symbol.asyncIterator]() {
      },
    }

    class GetterOnlyClient {
      get find() {
        return {
          files: async (input: unknown) => {
            receivedFind = input
            return { data: [] }
          },
        }
      }

      get event() {
        return {
          subscribe: async () => stream,
        }
      }
    }

    const sdk = createClientAdapter(new GetterOnlyClient() as unknown as Parameters<typeof createClientAdapter>[0])

    await sdk.find.files({
      directory: "/workspace",
      query: "src",
      dirs: false,
    })
    const result = await sdk.event.subscribe({ directory: "/workspace" })

    assert.deepEqual(receivedFind, {
      directory: "/workspace",
      query: "src",
      dirs: "false",
    })
    assert.equal(result.stream, stream)
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
