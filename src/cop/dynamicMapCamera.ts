import { CENTER, MAP_VIEW, type MapCamera, type Point } from "./copData"

type DynamicCameraSource = "carla"

export type DynamicCameraRecord = {
  readonly id: string
  readonly label: string
  readonly source: DynamicCameraSource
  readonly camera: MapCamera
  readonly frameCount?: number
  readonly lastFrameAt?: string | null
  readonly latestFrameDataUrl?: string | null
}

type DynamicCameraInput = {
  readonly id: string
  readonly label: string
  readonly source: DynamicCameraSource
  readonly angle: number
  readonly radiusX: number
  readonly radiusY: number
  readonly frameCount?: number
  readonly lastFrameAt?: string | null
  readonly latestFrameDataUrl?: string | null
}

const CONE_LENGTH = 132
const CONE_HALF_ANGLE = 16

export const carlaCameraInput = (
  id: string,
  label: string,
  index: number,
  frameCount: number,
  lastFrameAt: string | null,
  latestFrameDataUrl: string | null,
): DynamicCameraInput => ({
  id,
  label,
  source: "carla",
  angle: -18 - index * 18,
  radiusX: 388,
  radiusY: 238,
  frameCount,
  lastFrameAt,
  latestFrameDataUrl,
})

export const buildDynamicCameraRecord = (input: DynamicCameraInput): DynamicCameraRecord => {
  const node = pointOnEllipse(input.angle, input.radiusX, input.radiusY)
  return {
    id: input.id,
    label: input.label,
    source: input.source,
    ...(input.frameCount !== undefined ? { frameCount: input.frameCount } : {}),
    ...(input.lastFrameAt !== undefined ? { lastFrameAt: input.lastFrameAt } : {}),
    ...(input.latestFrameDataUrl !== undefined
      ? { latestFrameDataUrl: input.latestFrameDataUrl }
      : {}),
    camera: {
      id: input.id,
      direction: directionForAngle(input.angle),
      confidence: liveStreamConfidence(input.frameCount ?? 0),
      tone: "watch",
      node,
      conePoints: buildCone(node),
      labelAnchor: labelAnchorFor(node),
    },
  }
}

const pointOnEllipse = (degrees: number, radiusX: number, radiusY: number): Point => {
  const radians = toRadians(degrees)
  return {
    x: clamp(CENTER.x + radiusX * Math.cos(radians), 18, MAP_VIEW.width - 18),
    y: clamp(CENTER.y + radiusY * Math.sin(radians), 18, MAP_VIEW.height - 18),
  }
}

const buildCone = (node: Point): string => {
  const inward = Math.atan2(CENTER.y - node.y, CENTER.x - node.x)
  const half = toRadians(CONE_HALF_ANGLE)
  const left = {
    x: node.x + CONE_LENGTH * Math.cos(inward - half),
    y: node.y + CONE_LENGTH * Math.sin(inward - half),
  }
  const right = {
    x: node.x + CONE_LENGTH * Math.cos(inward + half),
    y: node.y + CONE_LENGTH * Math.sin(inward + half),
  }
  return `${round(node.x)},${round(node.y)} ${round(left.x)},${round(left.y)} ${round(right.x)},${round(right.y)}`
}

const labelAnchorFor = (node: Point): Point => {
  const outward = Math.atan2(node.y - CENTER.y, node.x - CENTER.x)
  return {
    x: node.x + 26 * Math.cos(outward),
    y: node.y + 22 * Math.sin(outward),
  }
}

const directionForAngle = (angle: number): MapCamera["direction"] => {
  const normalized = ((angle % 360) + 360) % 360
  if (normalized >= 45 && normalized < 135) {
    return "S"
  }
  if (normalized >= 135 && normalized < 225) {
    return "W"
  }
  if (normalized >= 225 && normalized < 315) {
    return "N"
  }
  return "E"
}

const liveStreamConfidence = (frameCount: number): number => (frameCount > 0 ? 86 : 62)

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

const round = (value: number): number => Math.round(value * 100) / 100

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
