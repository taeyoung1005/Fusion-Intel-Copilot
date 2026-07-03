import { describe, expect, it } from "vitest"
import type { PersonAttributes } from "./attributeClassifier"
import type { EvidenceClip } from "./copData"
import type { Point } from "./copMapBaseData"
import {
  type CorrelationEntry,
  MAX_TRAVEL_WINDOW_MS,
  MIN_TRAVEL_WINDOW_MS,
  bandForScore,
  computeSimilarityScore,
  findCorrelationCandidates,
  pairKey,
  travelTimeWindowMs,
} from "./personCorrelation"

const attrs = (over: Partial<PersonAttributes> = {}): PersonAttributes => ({
  hat: "no_hat",
  sleeveLength: "short_sleeve",
  bagCarried: "carrying_bag",
  topColor: "red",
  build: "medium",
  attributeConfidence: 0.9,
  ...over,
})

const clip = (id: string, camera: string, attributes: PersonAttributes): EvidenceClip => ({
  id,
  time: "09:41:00",
  camera,
  tone: "watch",
  label: `${camera} 탐지`,
  detail: "CONF 90%",
  source: "vision",
  confidencePct: 90,
  attributes,
})

const entry = (
  id: string,
  cameraId: string,
  observedAtMs: number,
  node: Point,
  attributes: PersonAttributes,
): CorrelationEntry => ({ clip: clip(id, cameraId, attributes), cameraId, observedAtMs, node })

describe("computeSimilarityScore", () => {
  it("returns 100 when every attribute matches", () => {
    expect(computeSimilarityScore(attrs(), attrs())).toBe(100)
  })

  it("subtracts only the top-color weight (30) when top color differs", () => {
    expect(computeSimilarityScore(attrs(), attrs({ topColor: "blue" }))).toBe(70)
  })

  it("subtracts only the hat weight (20) when hat differs", () => {
    expect(computeSimilarityScore(attrs(), attrs({ hat: "wearing_hat" }))).toBe(80)
  })

  it("subtracts hat (20) and build (10) together", () => {
    expect(computeSimilarityScore(attrs(), attrs({ hat: "wearing_hat", build: "large" }))).toBe(70)
  })

  it("subtracts top color (30) and bag (20) together", () => {
    expect(computeSimilarityScore(attrs(), attrs({ topColor: "blue", bagCarried: "no_bag" }))).toBe(
      50,
    )
  })

  it("returns 0 when nothing matches", () => {
    expect(
      computeSimilarityScore(
        attrs(),
        attrs({
          hat: "wearing_hat",
          sleeveLength: "long_sleeve",
          bagCarried: "no_bag",
          topColor: "blue",
          build: "large",
        }),
      ),
    ).toBe(0)
  })
})

describe("bandForScore", () => {
  it("classifies below 55 as no band", () => {
    expect(bandForScore(54)).toBeUndefined()
  })
  it("classifies 55–79 as ambiguous", () => {
    expect(bandForScore(55)).toBe("ambiguous")
    expect(bandForScore(79)).toBe("ambiguous")
  })
  it("classifies 80+ as confirmed", () => {
    expect(bandForScore(80)).toBe("confirmed")
    expect(bandForScore(100)).toBe("confirmed")
  })
})

describe("travelTimeWindowMs", () => {
  it("clamps very close cameras up to the minimum window", () => {
    expect(travelTimeWindowMs({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(MIN_TRAVEL_WINDOW_MS)
  })
  it("clamps very distant cameras down to the maximum window", () => {
    expect(travelTimeWindowMs({ x: 0, y: 0 }, { x: 5000, y: 0 })).toBe(MAX_TRAVEL_WINDOW_MS)
  })
  it("returns a mid-range value between the clamps for a moderate gap", () => {
    const window = travelTimeWindowMs({ x: 0, y: 0 }, { x: 277, y: 0 })
    expect(window).toBeGreaterThan(MIN_TRAVEL_WINDOW_MS)
    expect(window).toBeLessThan(MAX_TRAVEL_WINDOW_MS)
  })
})

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"))
  })
})

describe("findCorrelationCandidates", () => {
  const nodeNear = { x: 100, y: 100 }
  const nodeFar = { x: 160, y: 140 } // ~72px from nodeNear → window clamps to 20s

  it("excludes clips from the same camera", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-A", 2_000, nodeFar, attrs()),
    ]
    expect(findCorrelationCandidates(entries, 3_000, new Set())).toEqual([])
  })

  it("classifies a full match within the window as confirmed, earlier clip first", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-B", 2_000, nodeFar, attrs()),
    ]
    const [candidate] = findCorrelationCandidates(entries, 3_000, new Set())
    expect(candidate?.band).toBe("confirmed")
    expect(candidate?.score).toBe(100)
    expect(candidate?.clipA.id).toBe("c1")
    expect(candidate?.clipB.id).toBe("c2")
  })

  it("classifies a color-only mismatch as ambiguous", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-B", 2_000, nodeFar, attrs({ topColor: "blue" })),
    ]
    const [candidate] = findCorrelationCandidates(entries, 3_000, new Set())
    expect(candidate?.band).toBe("ambiguous")
    expect(candidate?.score).toBe(70)
  })

  it("excludes pairs whose observation gap exceeds the travel window", () => {
    const entries = [
      entry("c1", "CAM-A", 0, nodeNear, attrs()),
      entry("c2", "CAM-B", 30_000, nodeFar, attrs()), // 30s gap > 20s window
    ]
    expect(findCorrelationCandidates(entries, 31_000, new Set())).toEqual([])
  })

  it("excludes pairs below the ambiguous threshold", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry(
        "c2",
        "CAM-B",
        2_000,
        nodeFar,
        attrs({ topColor: "blue", bagCarried: "no_bag", sleeveLength: "long_sleeve" }),
      ), // 100-30-20-20 = 30 < 55
    ]
    expect(findCorrelationCandidates(entries, 3_000, new Set())).toEqual([])
  })

  it("excludes already-seen pairs", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-B", 2_000, nodeFar, attrs()),
    ]
    const seen = new Set([pairKey("c1", "c2")])
    expect(findCorrelationCandidates(entries, 3_000, seen)).toEqual([])
  })

  it("excludes entries older than the maximum travel window relative to now", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-B", 2_000, nodeFar, attrs()),
    ]
    const now = 2_000 + MAX_TRAVEL_WINDOW_MS + 1
    expect(findCorrelationCandidates(entries, now, new Set())).toEqual([])
  })
})
