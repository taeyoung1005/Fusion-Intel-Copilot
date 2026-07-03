import { describe, expect, it } from "vitest"
import type { EvidenceClip } from "./copData"
import { isCarlaVisionClip, shouldOpenNewAlert } from "./realtimeAlerts"

const clip = (id: string): EvidenceClip => ({
  id,
  time: "09:00:00",
  camera: "CARLA-N-01",
  tone: "watch",
  label: "person 탐지",
  detail: "CONF 90%",
  source: "vision",
  confidencePct: 90,
  frameDataUrl: null,
})

describe("isCarlaVisionClip", () => {
  it("recognizes CARLA-sourced detection clip ids", () => {
    expect(isCarlaVisionClip(clip("ev-carla-vision-CARLA-N-01-3"))).toBe(true)
  })

  it("rejects webcam test-panel detection clip ids", () => {
    expect(isCarlaVisionClip(clip("ev-vision-3"))).toBe(false)
  })
})

describe("shouldOpenNewAlert", () => {
  it("opens when there is no prior alert for the camera", () => {
    expect(shouldOpenNewAlert(undefined, 1_000)).toBe(true)
  })

  it("suppresses re-alert within the gap window", () => {
    expect(shouldOpenNewAlert(1_000, 5_000, 8_000)).toBe(false)
  })

  it("re-opens once the gap window has passed", () => {
    expect(shouldOpenNewAlert(1_000, 9_001, 8_000)).toBe(true)
  })

  it("uses the default gap when none is given", () => {
    expect(shouldOpenNewAlert(1_000, 1_000 + 8_000)).toBe(true)
    expect(shouldOpenNewAlert(1_000, 1_000 + 7_999)).toBe(false)
  })
})
