import { describe, expect, it } from "vitest"
import { projectRoadviewPoint } from "./facilityMapRoadviewProjection"

describe("facility roadview projection", () => {
  it("pulls far map points toward the roadview vanishing point", () => {
    const close = projectRoadviewPoint({ x: 760, y: 490 })
    const far = projectRoadviewPoint({ x: 760, y: 190 })

    expect(close).not.toBeNull()
    expect(far).not.toBeNull()
    expect(close?.leftPercent).toBeGreaterThan(far?.leftPercent ?? 0)
    expect(close?.scale).toBeGreaterThan(far?.scale ?? 0)
  })

  it("keeps central depot points near the horizon lane", () => {
    const depot = projectRoadviewPoint({ x: 562, y: 307 })

    expect(depot).toEqual({
      leftPercent: 53.2,
      bottomPercent: 52.4,
      scale: 0.81,
      depthPercent: 67.3,
    })
  })
})
