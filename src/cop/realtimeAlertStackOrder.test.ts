import { describe, expect, it } from "vitest"
import type { EvidenceClip } from "./copData"
import { realtimeAlertStackPlacements } from "./realtimeAlertStackOrder"
import type { RealtimeAlert } from "./realtimeAlerts"

const clip = (id: string, camera: string): EvidenceClip => ({
  id,
  time: "09:10:00",
  camera,
  tone: "watch",
  label: `${camera} person 탐지`,
  detail: "CONF 91%",
  source: "vision",
  confidencePct: 91,
  frameDataUrl: null,
})

const alert = (
  id: string,
  cameraId: string,
  times: Pick<RealtimeAlert, "firstSeenAtMs" | "lastSeenAtMs"> = {},
): RealtimeAlert => ({
  id,
  kind: "detection",
  cameraId,
  clip: clip(id, cameraId),
  autoClose: false,
  autoCloseMs: 10_000,
  ...times,
})

describe("realtimeAlertStackPlacements", () => {
  it("puts the most recently seen alert on top without changing alert ids", () => {
    const placements = realtimeAlertStackPlacements([
      alert("older", "CARLA-01", { firstSeenAtMs: 1_000, lastSeenAtMs: 1_000 }),
      alert("deduped", "CARLA-02", { firstSeenAtMs: 500, lastSeenAtMs: 4_000 }),
      alert("middle", "CARLA-03", { firstSeenAtMs: 2_000, lastSeenAtMs: 2_000 }),
    ])

    expect(placements.map((placement) => placement.alert.id)).toEqual([
      "deduped",
      "middle",
      "older",
    ])
    expect(placements[0]).toMatchObject({
      depth: 0,
      isTop: true,
      stackKey: "detection:deduped",
    })
  })

  it("falls back to newest array position and collapses deep background cards", () => {
    const placements = realtimeAlertStackPlacements([
      alert("first", "CARLA-01"),
      alert("second", "CARLA-02"),
      alert("third", "CARLA-03"),
      alert("fourth", "CARLA-04"),
      alert("fifth", "CARLA-05"),
    ])

    expect(placements.map((placement) => placement.alert.id)).toEqual([
      "fifth",
      "fourth",
      "third",
      "second",
      "first",
    ])
    expect(placements.map((placement) => placement.depth)).toEqual([0, 1, 2, 3, "overflow"])
  })
})
