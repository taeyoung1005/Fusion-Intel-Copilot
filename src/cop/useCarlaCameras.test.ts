import { describe, expect, it } from "vitest"
import type { CarlaCameraSnapshot } from "./carlaCameraClient"
import { CARLA_CAMERA_POLL_INTERVAL_MS, areCarlaCameraSnapshotsEqual } from "./useCarlaCameras"

const cameraSnapshot = (overrides: Partial<CarlaCameraSnapshot> = {}): CarlaCameraSnapshot => ({
  id: "CARLA-E-02",
  label: "동측 탄약고 외곽 CCTV",
  source: "carla",
  status: "online",
  createdAt: "2026-07-04T09:00:00.000Z",
  lastFrameAt: "2026-07-04T09:42:18.000Z",
  frameCount: 42,
  latestFrameDataUrl: null,
  ...overrides,
})

describe("useCarlaCameras registry polling", () => {
  it("uses the throttled registry interval from the performance profile", () => {
    expect(CARLA_CAMERA_POLL_INTERVAL_MS).toBe(1_000)
  })

  it("keeps the previous snapshot when unused frame payload data churns", () => {
    const previous = [cameraSnapshot({ latestFrameDataUrl: "data:image/jpeg;base64,AAAA" })]
    const next = [cameraSnapshot({ latestFrameDataUrl: "data:image/jpeg;base64,BBBB" })]

    expect(areCarlaCameraSnapshotsEqual(previous, next)).toBe(true)
  })

  it("publishes a new snapshot when the displayed frame changes", () => {
    const previous = [cameraSnapshot({ frameCount: 42 })]
    const next = [cameraSnapshot({ frameCount: 43 })]

    expect(areCarlaCameraSnapshotsEqual(previous, next)).toBe(false)
  })

  it("publishes a new snapshot when only the camera yaw changes", () => {
    const previous = [cameraSnapshot({ yaw: 90 })]
    const next = [cameraSnapshot({ yaw: 271.5 })]

    expect(areCarlaCameraSnapshotsEqual(previous, next)).toBe(false)
  })
})
