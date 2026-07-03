import { describe, expect, it } from "vitest"
import { CENTER, SATELLITE } from "./copData"
import { pointsToSvg, projectToSvg } from "./osmFeatures"

describe("projectToSvg", () => {
  it("maps the basemap center coordinate to the SVG center", () => {
    const point = projectToSvg(SATELLITE.lat, SATELLITE.lon)
    expect(point.x).toBeCloseTo(CENTER.x, 1)
    expect(point.y).toBeCloseTo(CENTER.y, 1)
  })

  it("moves east/south as lon/lat change (Web-Mercator orientation)", () => {
    const east = projectToSvg(SATELLITE.lat, SATELLITE.lon + 0.001)
    const south = projectToSvg(SATELLITE.lat - 0.001, SATELLITE.lon)
    expect(east.x).toBeGreaterThan(CENTER.x)
    expect(south.y).toBeGreaterThan(CENTER.y)
  })
})

describe("pointsToSvg", () => {
  it("serializes points to an SVG points string", () => {
    expect(
      pointsToSvg([
        { x: 1, y: 2 },
        { x: 3.5, y: 4 },
      ]),
    ).toBe("1,2 3.5,4")
  })
})
