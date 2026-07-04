import { describe, expect, it } from "vitest"
import {
  DEFAULT_FACILITY_VIEWPORT,
  FACILITY_VIEWPORT_ZOOM,
  facilityViewBox,
  minimapViewportIndicator,
  panFacilityViewport,
  pointerMapPoint,
  rotateFacilityViewport,
  zoomFacilityViewport,
} from "./facilityMapViewport"

describe("facility map viewport transforms", () => {
  it("zooms around an operator focus point while keeping the view inside the facility", () => {
    const zoomed = zoomFacilityViewport(DEFAULT_FACILITY_VIEWPORT, 1.5, { x: 750, y: 420 })

    expect(zoomed.zoom).toBe(1.5)
    expect(facilityViewBox(zoomed)).toBe("250 140 666.67 400")
  })

  it("zooms from captured wheel values when React clears the event target", () => {
    const capturedBounds = {
      left: 100,
      top: 40,
      width: 500,
      height: 300,
    }
    const replayedWheel = {
      currentTarget: null,
      clientX: 350,
      clientY: 190,
      deltaY: -1,
    }

    const focusPoint = pointerMapPoint(
      capturedBounds,
      replayedWheel.clientX,
      replayedWheel.clientY,
      DEFAULT_FACILITY_VIEWPORT,
    )
    const zoomed = zoomFacilityViewport(
      DEFAULT_FACILITY_VIEWPORT,
      DEFAULT_FACILITY_VIEWPORT.zoom + FACILITY_VIEWPORT_ZOOM.step,
      focusPoint,
    )

    expect(replayedWheel.currentTarget).toBeNull()
    expect(focusPoint).toEqual({ x: 500, y: 300 })
    expect(facilityViewBox(zoomed)).toBe("83.33 50 833.33 500")
  })

  it("pans the SVG viewBox and clamps at facility bounds", () => {
    const zoomed = zoomFacilityViewport(DEFAULT_FACILITY_VIEWPORT, 2, { x: 500, y: 300 })
    const panned = panFacilityViewport(zoomed, { x: 600, y: -500 })

    expect(facilityViewBox(panned)).toBe("500 0 500 300")
  })

  it("reports the visible viewport as a minimap rectangle percentage", () => {
    const zoomed = zoomFacilityViewport(DEFAULT_FACILITY_VIEWPORT, 2, { x: 500, y: 300 })
    const indicator = minimapViewportIndicator(zoomed)

    expect(indicator).toEqual({
      leftPercent: 25,
      topPercent: 25,
      widthPercent: 50,
      heightPercent: 50,
      coveragePercent: 25,
    })
  })

  it("keeps rotation in a restrained operational range", () => {
    const rotated = rotateFacilityViewport(DEFAULT_FACILITY_VIEWPORT, 75)

    expect(rotated.rotation).toBe(45)
  })
})
