import type { WorkspaceRuntime } from "./server"

export type CapabilityState = "unknown" | "supported" | "unsupported"

export type RuntimeCapabilities = {
  sessionSearch: CapabilityState
  sessionChildren: CapabilityState
  sessionRevert: CapabilityState
  experimentalResources: CapabilityState
}

export function createEmptyCapabilities(): RuntimeCapabilities {
  return {
    sessionSearch: "unknown",
    sessionChildren: "unknown",
    sessionRevert: "unknown",
    experimentalResources: "unknown",
  }
}

export function classifyCapabilityError(err: unknown): CapabilityState {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()

  if (message.includes("404") || message.includes("501") || message.includes("not implemented")) {
    return "unsupported"
  }

  return "unknown"
}

export class CapabilityStore {
  private readonly cache = new Map<string, RuntimeCapabilities>()
  private readonly inflight = new Map<string, Promise<RuntimeCapabilities>>()

  constructor(
    private readonly deps: {
      probe: (workspaceId: string) => Promise<RuntimeCapabilities>
    },
  ) {}

  snapshot(workspaceId: string) {
    return this.cache.get(workspaceId) ?? createEmptyCapabilities()
  }

  async getOrProbe(workspaceId: string) {
    const cached = this.cache.get(workspaceId)
    if (cached) {
      return cached
    }

    const pending = this.inflight.get(workspaceId)
    if (pending) {
      return await pending
    }

    const next = this.deps.probe(workspaceId).then((result) => {
      this.cache.set(workspaceId, result)
      this.inflight.delete(workspaceId)
      return result
    }, (error) => {
      this.inflight.delete(workspaceId)
      throw error
    })

    this.inflight.set(workspaceId, next)
    return await next
  }

  clear(workspaceId: string) {
    this.cache.delete(workspaceId)
    this.inflight.delete(workspaceId)
  }

  dispose() {
    this.cache.clear()
    this.inflight.clear()
  }
}

export async function probeRuntimeCapabilities(rt: Pick<WorkspaceRuntime, "dir" | "sdk" | "sessions">): Promise<RuntimeCapabilities> {
  const next = createEmptyCapabilities()
  const sdk = rt.sdk

  if (!sdk) {
    return next
  }

  next.sessionRevert = hasSdkMethod(readSdkMember(sdk, "session"), "revert") && hasSdkMethod(readSdkMember(sdk, "session"), "unrevert")
    ? "unknown"
    : "unsupported"

  next.sessionSearch = await probeCapability(async () => {
    await sdk.session.list({
      directory: rt.dir,
      search: "__opencode_ui_probe__",
      limit: 1,
    })
  })

  next.experimentalResources = await probeCapability(async () => {
    await sdk.experimental.resource.list({
      directory: rt.dir,
    })
  })

  const sessionID = rt.sessions.keys().next().value
  if (sessionID) {
    next.sessionChildren = await probeCapability(async () => {
      await sdk.session.children({
        sessionID,
        directory: rt.dir,
      })
    })
  }

  return next
}

async function probeCapability(run: () => Promise<unknown>): Promise<CapabilityState> {
  try {
    await run()
    return "supported"
  } catch (error) {
    return classifyCapabilityError(error)
  }
}

function readSdkMember(target: object, key: string) {
  const value = Reflect.get(target, key)
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined
}

function hasSdkMethod(target: Record<string, unknown> | undefined, key: string) {
  return !!target && typeof Reflect.get(target, key) === "function"
}
