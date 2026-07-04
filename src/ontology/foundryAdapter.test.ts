import { afterEach, describe, expect, it, vi } from "vitest"
import {
  FOUNDRY_ADAPTER_REQUIRED_CONFIG_KEYS,
  type FoundryAdapterResult,
  createUnconfiguredFoundryAdapter,
} from "./foundryAdapter"

const expectedConfigKeys = [
  "foundryHost",
  "ontologyRid",
  "clientId",
  "redirectUri",
  "scopes",
] as const

const expectNotConfigured = <T>(result: FoundryAdapterResult<T>): void => {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error("expected the default Foundry adapter to report not_configured")
  }
  expect(result.error.kind).toBe("not_configured")
  expect(result.error.missingConfig).toEqual(expectedConfigKeys)
}

describe("createUnconfiguredFoundryAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("reports not_configured for every default read and write method", async () => {
    // Given: the default adapter has no Foundry configuration.
    const adapter = createUnconfiguredFoundryAdapter()

    // When: each future read/write seam is called.
    const readObject = await adapter.readObject({ objectType: "Incident", objectId: "inc-001" })
    const queryObjects = await adapter.queryObjects({ objectType: "Incident" })
    const writeAction = await adapter.writeAction({
      actionType: "recordAssessment",
      input: { incidentId: "inc-001" },
    })

    // Then: each method returns a typed not_configured result.
    expect(adapter.mode).toBe("unconfigured")
    expectNotConfigured(readObject)
    expectNotConfigured(queryObjects)
    expectNotConfigured(writeAction)
  })

  it("exposes future config keys without serializing credentials or secret-shaped fields", async () => {
    // Given: a default adapter and a fake high-risk value that must never appear.
    const adapter = createUnconfiguredFoundryAdapter()
    const highRiskValue = "sk_test_never_expose"

    // When: the adapter shape and all method results are serialized.
    const payloads = [
      FOUNDRY_ADAPTER_REQUIRED_CONFIG_KEYS,
      adapter,
      await adapter.readObject({ objectType: "Incident", objectId: highRiskValue }),
      await adapter.queryObjects({ objectType: "Incident" }),
      await adapter.writeAction({
        actionType: "submitResponseGate",
        input: { responseGateId: highRiskValue },
      }),
    ]
    const serialized = JSON.stringify(payloads)

    // Then: only non-secret config labels are exposed.
    expect(FOUNDRY_ADAPTER_REQUIRED_CONFIG_KEYS).toEqual(expectedConfigKeys)
    expect(serialized).not.toContain(highRiskValue)
    expect(serialized).not.toMatch(/secret|token|password|credential|api[-_]?key/i)
  })

  it("keeps every default method pure and avoids network-capable globals", async () => {
    // Given: network-capable globals are replaced with counters that fail on invocation.
    const networkCalls: string[] = []
    const recordNetworkCall = (name: string): never => {
      networkCalls.push(name)
      throw new Error(`${name} must not be called by the unconfigured Foundry adapter`)
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(() => recordNetworkCall("fetch")),
    )
    vi.stubGlobal(
      "XMLHttpRequest",
      vi.fn(() => recordNetworkCall("XMLHttpRequest")),
    )
    vi.stubGlobal(
      "WebSocket",
      vi.fn(() => recordNetworkCall("WebSocket")),
    )
    const adapter = createUnconfiguredFoundryAdapter()
    const readRequest = Object.freeze({ objectType: "Incident", objectId: "inc-001" })
    const queryRequest = Object.freeze({ objectType: "Incident" })
    const writeRequest = Object.freeze({
      actionType: "generateCommanderReport",
      input: { incidentIds: ["inc-001"] },
    })

    // When: each method is called twice with the same frozen inputs.
    const firstRun = await Promise.all([
      adapter.readObject(readRequest),
      adapter.queryObjects(queryRequest),
      adapter.writeAction(writeRequest),
    ])
    const secondRun = await Promise.all([
      adapter.readObject(readRequest),
      adapter.queryObjects(queryRequest),
      adapter.writeAction(writeRequest),
    ])

    // Then: results are deterministic and no network-capable global was invoked.
    expect(secondRun).toEqual(firstRun)
    expect(networkCalls).toEqual([])
  })
})
