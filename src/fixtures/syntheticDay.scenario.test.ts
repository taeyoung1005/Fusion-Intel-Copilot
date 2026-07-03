import { describe, expect, it } from "vitest"
import { ScenarioFixtureSchema } from "../domain"
import { syntheticDayScenario } from "./syntheticDay"

describe("C002 restricted-zone scenario fixture", () => {
  it("keeps the restricted-zone loitering contract selectable by scenario filter", () => {
    // Given: the deterministic synthetic day fixture.
    const parsed = ScenarioFixtureSchema.parse(syntheticDayScenario)

    // When: callers inspect the restricted-zone scenario contract.
    const distanceBands = parsed.semanticEvents
      .filter((event) => event.eventType === "distance_band_change")
      .map((event) => event.distanceBand)
    const loiteringEventIds = parsed.semanticEvents
      .filter((event) => event.eventType === "loitering_detected")
      .map((event) => event.eventId)

    // Then: the C002 scenario remains discoverable and ordered for focused Vitest runs.
    expect(parsed.scenarioLabels).toContain("restricted_zone_loitering")
    expect(distanceBands).toEqual(["50m", "30m", "10m"])
    expect(loiteringEventIds).toEqual(["evt-loitering"])
  })
})
