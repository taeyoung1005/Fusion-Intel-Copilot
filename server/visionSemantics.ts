import type { VisionPipelineRequest } from "./visionPipeline"

type VisionFrame = VisionPipelineRequest["frames"][number]
type VisionObject = VisionFrame["objects"][number]

export type SemanticAction =
  | "approaching_camera"
  | "walking_or_running"
  | "standing_or_slow"
  | "object_motion"

export type SemanticDirection =
  | "moving_left"
  | "moving_right"
  | "moving_up"
  | "moving_down"
  | "stationary"

export type SemanticDistanceTrend = "approaching" | "receding" | "stable" | "unknown"

export type VisionSemanticEvent = {
  readonly id: string
  readonly subjectLabel: string
  readonly action: SemanticAction
  readonly direction: SemanticDirection
  readonly distanceTrend: SemanticDistanceTrend
  readonly durationMs: number
  readonly frameIds: readonly string[]
  readonly confidence: number
  readonly summary: string
}

type Observation = {
  readonly frameId: string
  readonly timestampMs: number
  readonly label: string
  readonly confidence: number
  readonly distanceMeters: number | null
  readonly centerX: number
  readonly centerY: number
  readonly scale: "normalized" | "pixel"
}

type TrackCandidate = {
  readonly key: string
  readonly observations: readonly Observation[]
}

const distanceOf = (object: VisionObject): number | null =>
  object.distanceMeters ?? object.distanceM ?? null

const scaleOf = (object: VisionObject): Observation["scale"] =>
  object.bbox.x <= 2 && object.bbox.y <= 2 && object.bbox.width <= 2 && object.bbox.height <= 2
    ? "normalized"
    : "pixel"

const centerOf = (object: VisionObject): Pick<Observation, "centerX" | "centerY" | "scale"> => ({
  centerX: object.bbox.x + object.bbox.width / 2,
  centerY: object.bbox.y + object.bbox.height / 2,
  scale: scaleOf(object),
})

const groupKey = (object: VisionObject, objectIndex: number): string =>
  object.objectId ?? `${object.label}-${String(objectIndex + 1).padStart(2, "0")}`

const observationsByTrack = (frames: readonly VisionFrame[]): readonly TrackCandidate[] => {
  const grouped = new Map<string, Observation[]>()
  for (const frame of frames) {
    frame.objects.forEach((object, objectIndex) => {
      const center = centerOf(object)
      const observation: Observation = {
        frameId: frame.frameId,
        timestampMs: frame.timestampMs,
        label: object.label,
        confidence: object.confidence,
        distanceMeters: distanceOf(object),
        centerX: center.centerX,
        centerY: center.centerY,
        scale: center.scale,
      }
      const key = groupKey(object, objectIndex)
      grouped.set(key, [...(grouped.get(key) ?? []), observation])
    })
  }
  return [...grouped.entries()].map(([key, observations]) => ({ key, observations }))
}

const movementThreshold = (scale: Observation["scale"]): number =>
  scale === "normalized" ? 0.03 : 8

const directionOf = (track: TrackCandidate): SemanticDirection => {
  const first = track.observations[0]
  const last = track.observations.at(-1)
  if (first === undefined || last === undefined) {
    return "stationary"
  }
  const threshold = movementThreshold(first.scale)
  const deltaX = last.centerX - first.centerX
  const deltaY = last.centerY - first.centerY
  if (Math.abs(deltaX) >= Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
    return deltaX > 0 ? "moving_right" : "moving_left"
  }
  if (Math.abs(deltaY) > threshold) {
    return deltaY > 0 ? "moving_down" : "moving_up"
  }
  return "stationary"
}

const distanceTrendOf = (track: TrackCandidate): SemanticDistanceTrend => {
  const distances = track.observations
    .map((observation) => observation.distanceMeters)
    .filter((distance): distance is number => distance !== null)
  const first = distances[0]
  const last = distances.at(-1)
  if (first === undefined || last === undefined || distances.length < 2) {
    return "unknown"
  }
  if (last < first - 3) {
    return "approaching"
  }
  if (last > first + 3) {
    return "receding"
  }
  return "stable"
}

const actionOf = (track: TrackCandidate): SemanticAction => {
  const first = track.observations[0]
  const last = track.observations.at(-1)
  if (first === undefined || last === undefined) {
    return "object_motion"
  }
  const durationMs = Math.max(1, last.timestampMs - first.timestampMs)
  const distanceDelta = (first.distanceMeters ?? 0) - (last.distanceMeters ?? 0)
  if (distanceDelta >= 6 && durationMs <= 1_000) {
    return "approaching_camera"
  }
  if (directionOf(track) !== "stationary") {
    return track.observations.some((observation) => observation.label.includes("person"))
      ? "walking_or_running"
      : "object_motion"
  }
  return "standing_or_slow"
}

const summaryOf = (event: Omit<VisionSemanticEvent, "summary">): string =>
  `${event.subjectLabel} ${event.direction}, ${event.distanceTrend}, ${event.action} 후보를 ${event.frameIds.length}개 프레임에서 추출했습니다.`

export const buildSemanticEvents = (
  frames: readonly VisionFrame[],
): readonly VisionSemanticEvent[] =>
  observationsByTrack(frames)
    .filter((track) => track.observations.length >= 2)
    .flatMap((track, index) => {
      const first = track.observations[0]
      const last = track.observations.at(-1)
      if (first === undefined || last === undefined) {
        return []
      }
      const event = {
        id: `sem-${String(index + 1).padStart(3, "0")}`,
        subjectLabel: first.label,
        action: actionOf(track),
        direction: directionOf(track),
        distanceTrend: distanceTrendOf(track),
        durationMs: last.timestampMs - first.timestampMs,
        frameIds: track.observations.map((observation) => observation.frameId),
        confidence: Number(
          (
            track.observations.reduce((sum, observation) => sum + observation.confidence, 0) /
            track.observations.length
          ).toFixed(3),
        ),
      } satisfies Omit<VisionSemanticEvent, "summary">
      return [{ ...event, summary: summaryOf(event) }]
    })
