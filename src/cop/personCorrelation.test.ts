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
  hatConfidence: 1,
  sleeveLength: "short_sleeve",
  sleeveLengthConfidence: 1,
  bagCarried: "carrying_bag",
  bagCarriedConfidence: 1,
  topColor: "red",
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
  it("returns 100 when every attribute matches with full confidence", () => {
    expect(computeSimilarityScore(attrs(), attrs())).toBe(100)
  })

  it("subtracts only the top-color weight (35) when top color differs", () => {
    expect(computeSimilarityScore(attrs(), attrs({ topColor: "blue" }))).toBe(65)
  })

  it("subtracts only the hat weight (20) when hat differs", () => {
    expect(computeSimilarityScore(attrs(), attrs({ hat: "wearing_hat" }))).toBe(80)
  })

  it("subtracts top color (35) and bag (25) together", () => {
    expect(computeSimilarityScore(attrs(), attrs({ topColor: "blue", bagCarried: "no_bag" }))).toBe(
      40,
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
        }),
      ),
    ).toBe(0)
  })

  it("scales a matching attribute's contribution by the weaker side's confidence", () => {
    // hat matches on both sides, but one side was only 50% sure -> 20 * 0.5 = 10.
    expect(computeSimilarityScore(attrs(), attrs({ hatConfidence: 0.5 }))).toBe(90)
  })

  it("uses the minimum of the two confidences when both sides are uncertain", () => {
    // bag weight 25 * min(0.4, 0.9) = 10, plus the other three at full weight (35+20+20).
    expect(
      computeSimilarityScore(
        attrs({ bagCarriedConfidence: 0.4 }),
        attrs({ bagCarriedConfidence: 0.9 }),
      ),
    ).toBe(85)
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
    expect(candidate?.score).toBe(65)
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
      ), // 100-35-25-20 = 20 < 55
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
