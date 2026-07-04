import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createDetrEventPromotionGate,
  detectFrameObjectsWithDetr,
  normalizeDetrDetections,
} from "./detrVisionDetector"
import { DETR_SERVER_URL } from "./serverDetectionClient"

const source = "data:image/jpeg;base64,frame"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("normalizeDetrDetections", () => {
  it("converts DETR box output into pipeline frame objects", () => {
    const objects = normalizeDetrDetections(
      [
        {
          label: "person",
          score: 0.91,
          box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 },
        },
      ],
      { frameWidth: 640, frameHeight: 360 },
    )

    expect(objects).toEqual([
      {
        objectId: "detr-person-001",
        label: "person",
        confidence: 0.91,
        distanceMeters: 16,
        bbox: { x: 300, y: 92, width: 66, height: 166 },
      },
    ])
  })
})

describe("createDetrEventPromotionGate", () => {
  it("suppresses a repeated track after the first promoted event", () => {
    const gate = createDetrEventPromotionGate()
    const first = gate.shouldPromote({
      cameraId: "CARLA-N-01",
      detectionClass: "person",
      trackId: "track-person-001",
      nowMs: 10_000,
    })

    expect(first).toMatchObject({
      shouldPromote: true,
      metadata: {
        cameraId: "CARLA-N-01",
        cooldownKey: "CARLA-N-01:person",
        detectionClass: "person",
        promotedAtMs: 10_000,
        trackId: "track-person-001",
      },
    })
    if (!first.shouldPromote) {
      throw new Error("first track observation should promote")
    }
    gate.recordPromotion(first.metadata)

    const duplicate = gate.shouldPromote({
      cameraId: "CARLA-N-01",
      detectionClass: "person",
      trackId: "track-person-001",
      nowMs: 12_000,
    })

    expect(duplicate).toMatchObject({
      shouldPromote: false,
      reason: "track_already_promoted",
      metadata: {
        cooldownKey: "CARLA-N-01:person",
        trackId: "track-person-001",
      },
    })
  })

  it("suppresses a new track for the same camera and class until cooldown expires", () => {
    const gate = createDetrEventPromotionGate({ cameraClassCooldownMs: 5_000 })
    const first = gate.shouldPromote({
      cameraId: "CARLA-N-01",
      detectionClass: "person",
      trackId: "track-person-001",
      nowMs: 10_000,
    })
    if (!first.shouldPromote) {
      throw new Error("first track observation should promote")
    }
    gate.recordPromotion(first.metadata)

    expect(
      gate.shouldPromote({
        cameraId: "CARLA-N-01",
        detectionClass: "person",
        trackId: "track-person-002",
        nowMs: 14_999,
      }),
    ).toMatchObject({
      shouldPromote: false,
      reason: "camera_class_cooldown",
      remainingCooldownMs: 1,
    })

    expect(
      gate.shouldPromote({
        cameraId: "CARLA-N-01",
        detectionClass: "person",
        trackId: "track-person-002",
        nowMs: 15_000,
      }),
    ).toMatchObject({
      shouldPromote: true,
      metadata: {
        cooldownKey: "CARLA-N-01:person",
        trackId: "track-person-002",
      },
    })
  })
})

describe("detectFrameObjectsWithDetr", () => {
  it("posts the frame to the DETR server and returns normalized objects", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json([
        {
          label: "person",
          score: 0.9174,
          box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 },
        },
      ]),
    )
    vi.stubGlobal("fetch", fetch)

    const result = await detectFrameObjectsWithDetr({
      source,
      frameWidth: 640,
      frameHeight: 360,
    })

    expect(fetch).toHaveBeenCalledWith(`${DETR_SERVER_URL}/detect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, frameWidth: 640, frameHeight: 360 }),
    })
    expect(result).toEqual({
      objects: [
        {
          objectId: "detr-person-001",
          label: "person",
          confidence: 0.917,
          distanceMeters: 16,
          bbox: { x: 300, y: 92, width: 66, height: 166 },
        },
      ],
      serverConnection: "connected",
      source: "server",
    })
  })

  it("skips detection and reports a disconnected server when server parsing fails", async () => {
    // No test-detector seam here: detectFrameObjectsWithServerDetr consumes that
    // seam *before* ever touching fetch, so injecting it would short-circuit the
    // real request this test is exercising (see the seam-priority test below).
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ detections: [] }),
    )
    vi.stubGlobal("fetch", fetch)

    const result = await detectFrameObjectsWithDetr({
      source,
      frameWidth: 640,
      frameHeight: 360,
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(result).toEqual({
      objects: [],
      serverConnection: "disconnected",
      source: "skipped",
    })
  })

  it("consumes the injected test-detector seam instead of calling fetch", async () => {
    // serverDetectionClient checks window.__D4D_TEST_DETR_DETECTOR__ first and,
    // when present, treats its response as the server's own — fetch is never
    // reached and the result is reported as a connected server detection.
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ detections: [] }),
    )
    const hookDetector = vi.fn(async (_source: string) => [
      {
        label: "vehicle",
        score: 0.72,
        box: { xmin: 20, ymin: 30, xmax: 220, ymax: 170 },
      },
    ])
    vi.stubGlobal("fetch", fetch)
    vi.stubGlobal("window", { __D4D_TEST_DETR_DETECTOR__: hookDetector })

    const result = await detectFrameObjectsWithDetr({
      source,
      frameWidth: 640,
      frameHeight: 360,
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(hookDetector).toHaveBeenCalledWith(source)
    expect(result).toEqual({
      objects: [
        {
          objectId: "detr-vehicle-001",
          label: "vehicle",
          confidence: 0.72,
          distanceMeters: 19,
          bbox: { x: 20, y: 30, width: 200, height: 140 },
        },
      ],
      serverConnection: "connected",
      source: "server",
    })
  })
})
