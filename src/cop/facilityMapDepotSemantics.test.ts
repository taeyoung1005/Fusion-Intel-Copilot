import { describe, expect, it } from "vitest"
import { DEPOT_BUNKERS, type MapEvent } from "./copData"
import { depotThreatSummaries } from "./facilityMapDepotSemantics"

describe("depot threat summaries", () => {
  it("marks each bunker with nearest event state and tone", () => {
    const events: readonly MapEvent[] = [
      { id: "near-e", time: "09:45:55", tone: "alert", point: { x: 520, y: 320 } },
      { id: "far-w", time: "09:41:33", tone: "watch", point: { x: 220, y: 180 } },
    ]

    const summaries = depotThreatSummaries(DEPOT_BUNKERS, events)

    expect(summaries[0]).toMatchObject({
      bunkerId: "AMMO-C",
      nearestEventId: "near-e",
      tone: "alert",
      statusLabel: "ALERT",
    })
    expect(summaries[0]).not.toHaveProperty("distanceMeters")
  })

  it("shows clear status when no event is near the depot", () => {
    const summaries = depotThreatSummaries(DEPOT_BUNKERS, [])

    expect(summaries.every((summary) => summary.statusLabel === "CLEAR")).toBe(true)
  })
})
