import { describe, expect, it } from "vitest"
import type { EvidenceClip } from "./copData"
import {
  isCarlaVisionClip,
  mergeRealtimeDetectionAlert,
  shouldOpenNewAlert,
} from "./realtimeAlerts"

const clip = (id: string, over: Partial<EvidenceClip> = {}): EvidenceClip => ({
  id,
  time: "09:00:00",
  camera: "CARLA-N-01",
  tone: "watch",
  label: "person 탐지",
  detail: "CONF 90%",
  source: "vision",
  confidencePct: 90,
  frameDataUrl: null,
  ...over,
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

describe("mergeRealtimeDetectionAlert", () => {
  it("merges duplicate camera-class alerts inside the dedupe window", () => {
    const first = mergeRealtimeDetectionAlert(
      [],
      clip("ev-carla-vision-CARLA-N-01-1", {
        cooldownKey: "CARLA-N-01:person",
        detectionClass: "person",
        promotedAtMs: 1_000,
        trackId: "track-person-001",
      }),
      { nowMs: 1_000, dedupeWindowMs: 4_000 },
    )

    expect(first.kind).toBe("opened")
    const merged = mergeRealtimeDetectionAlert(
      first.alerts,
      clip("ev-carla-vision-CARLA-N-01-2", {
        cooldownKey: "CARLA-N-01:person",
        detectionClass: "person",
        promotedAtMs: 3_000,
        trackId: "track-person-002",
      }),
      { nowMs: 3_000, dedupeWindowMs: 4_000 },
    )

    expect(merged).toMatchObject({
      kind: "merged",
      alertId: "ev-carla-vision-CARLA-N-01-1",
      alerts: [
        {
          id: "ev-carla-vision-CARLA-N-01-1",
          duplicateCount: 2,
          dedupeKey: "CARLA-N-01:person",
          firstSeenAtMs: 1_000,
          lastSeenAtMs: 3_000,
          mergedClipIds: ["ev-carla-vision-CARLA-N-01-1", "ev-carla-vision-CARLA-N-01-2"],
          clip: expect.objectContaining({
            id: "ev-carla-vision-CARLA-N-01-2",
            trackId: "track-person-002",
          }),
        },
      ],
    })
  })

  it("opens a new alert after the dedupe window expires", () => {
    const first = mergeRealtimeDetectionAlert(
      [],
      clip("ev-carla-vision-CARLA-N-01-1", {
        cooldownKey: "CARLA-N-01:person",
        detectionClass: "person",
      }),
      { nowMs: 1_000, dedupeWindowMs: 4_000 },
    )

    const second = mergeRealtimeDetectionAlert(
      first.alerts,
      clip("ev-carla-vision-CARLA-N-01-2", {
        cooldownKey: "CARLA-N-01:person",
        detectionClass: "person",
      }),
      { nowMs: 5_001, dedupeWindowMs: 4_000 },
    )

    expect(second.kind).toBe("opened")
    expect(second.alerts).toHaveLength(2)
  })
})
