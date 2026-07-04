import type { PersonAttributes } from "./attributeClassifier"
import { PERIMETER, type Point } from "./copMapBaseData"
import type { EvidenceClip } from "./copTimelineData"

export type CorrelationBand = "ambiguous" | "confirmed"

export type CorrelationCandidate = {
  readonly clipA: EvidenceClip
  readonly clipB: EvidenceClip
  readonly observedAtMsA: number
  readonly observedAtMsB: number
  readonly score: number
  readonly band: CorrelationBand
}

export type CorrelationEntry = {
  readonly clip: EvidenceClip
  readonly cameraId: string
  readonly observedAtMs: number
  readonly node: Point
}

export const AMBIGUOUS_MIN_SCORE = 55
export const CONFIRMED_MIN_SCORE = 80
export const WALKING_SPEED_MPS = 1.2
export const MIN_TRAVEL_WINDOW_MS = 20_000
export const MAX_TRAVEL_WINDOW_MS = 240_000

// Reuse the map's own scale: band-50 = PERIMETER.rx * 0.86 px = 50m.
export const METERS_PER_PX = 50 / (PERIMETER.rx * 0.86)

// Weights sum to 100 when every attribute matches with full confidence. There
// is no cross-camera "build" signal: a bounding box's height ratio reflects
// how close a person is to that particular camera, not their physical size,
// so it was pure noise when comparing detections from different cameras.
const TOP_COLOR_WEIGHT = 35
const BAG_WEIGHT = 25
const SLEEVE_WEIGHT = 20
const HAT_WEIGHT = 20

export const computeSimilarityScore = (a: PersonAttributes, b: PersonAttributes): number => {
  let score = 0
  if (a.topColor === b.topColor) {
    score += TOP_COLOR_WEIGHT
  }
  // CLIP's zero-shot judgment on a tiny cropped frame can be barely above a
  // coin flip. Weight each matching attribute by how confident both sides
  // actually were, so two shaky guesses matching by luck doesn't score the
  // same as two confident ones.
  if (a.bagCarried === b.bagCarried) {
    score += BAG_WEIGHT * Math.min(a.bagCarriedConfidence, b.bagCarriedConfidence)
  }
  if (a.sleeveLength === b.sleeveLength) {
    score += SLEEVE_WEIGHT * Math.min(a.sleeveLengthConfidence, b.sleeveLengthConfidence)
  }
  if (a.hat === b.hat) {
    score += HAT_WEIGHT * Math.min(a.hatConfidence, b.hatConfidence)
  }
  return Math.round(score)
}

export const bandForScore = (score: number): CorrelationBand | undefined => {
  if (score >= CONFIRMED_MIN_SCORE) {
    return "confirmed"
  }
  if (score >= AMBIGUOUS_MIN_SCORE) {
    return "ambiguous"
  }
  return undefined
}

export const travelTimeWindowMs = (nodeA: Point, nodeB: Point): number => {
  const dx = nodeA.x - nodeB.x
  const dy = nodeA.y - nodeB.y
  const distancePx = Math.sqrt(dx * dx + dy * dy)
  const distanceMeters = distancePx * METERS_PER_PX
  const ms = (distanceMeters / WALKING_SPEED_MPS) * 1000
  return Math.min(MAX_TRAVEL_WINDOW_MS, Math.max(MIN_TRAVEL_WINDOW_MS, ms))
}

export const pairKey = (idA: string, idB: string): string =>
  idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`

export const findCorrelationCandidates = (
  entries: readonly CorrelationEntry[],
  nowMs: number,
  seenPairKeys: ReadonlySet<string>,
): readonly CorrelationCandidate[] => {
  const candidates: CorrelationCandidate[] = []
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const first = entries[i]
      const second = entries[j]
      if (first === undefined || second === undefined) {
        continue
      }
      if (first.cameraId === second.cameraId) {
        continue
      }
      const attrsA = first.clip.attributes
      const attrsB = second.clip.attributes
      if (attrsA === undefined || attrsB === undefined) {
        continue
      }
      if (
        nowMs - first.observedAtMs > MAX_TRAVEL_WINDOW_MS ||
        nowMs - second.observedAtMs > MAX_TRAVEL_WINDOW_MS
      ) {
        continue
      }
      if (seenPairKeys.has(pairKey(first.clip.id, second.clip.id))) {
        continue
      }
      const window = travelTimeWindowMs(first.node, second.node)
      if (Math.abs(first.observedAtMs - second.observedAtMs) > window) {
        continue
      }
      const score = computeSimilarityScore(attrsA, attrsB)
      const band = bandForScore(score)
      if (band === undefined) {
        continue
      }
      const earlier = first.observedAtMs <= second.observedAtMs ? first : second
      const later = earlier === first ? second : first
      candidates.push({
        clipA: earlier.clip,
        clipB: later.clip,
        observedAtMsA: earlier.observedAtMs,
        observedAtMsB: later.observedAtMs,
        score,
        band,
      })
    }
  }
  return candidates
}
