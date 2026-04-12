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
