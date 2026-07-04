import { CENTER, MAP_VIEW, type MapCamera, type Point } from "./copData"
import {
  type CameraYawMapCalibration,
  TOWN10_CARLA_CAMERA_CALIBRATION,
} from "./mapCameraCalibration"

type DynamicCameraSource = "carla"

export type DynamicCameraRecord = {
  readonly id: string
  readonly label: string
  readonly source: DynamicCameraSource
  readonly camera: MapCamera
  readonly frameCount?: number
  readonly lastFrameAt?: string | null
  readonly latestFrameDataUrl?: string | null
  readonly yaw?: number
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
  readonly yaw?: number
}

const CONE_LENGTH = 132
const CONE_HALF_ANGLE = 16
const MINI_MAP_AVOIDANCE = {
  minX: MAP_VIEW.width - 280,
  maxY: 280,
} as const

export const carlaCameraInput = (
  id: string,
  label: string,
  index: number,
  frameCount: number,
  lastFrameAt: string | null,
  latestFrameDataUrl: string | null,
  payloadYaw?: number,
): DynamicCameraInput => {
  return {
    id,
    label,
    source: "carla",
    angle: -18 - index * 18,
    radiusX: 388,
    radiusY: 238,
    frameCount,
    lastFrameAt,
    latestFrameDataUrl,
    ...(payloadYaw !== undefined ? { yaw: payloadYaw } : {}),
  }
}

export const buildDynamicCameraRecord = (input: DynamicCameraInput): DynamicCameraRecord => {
  const node = pointOnEllipse(input.angle, input.radiusX, input.radiusY)
  const coneAngle = coneAngleForCamera(node, input.yaw)
  return {
    id: input.id,
    label: input.label,
    source: input.source,
    ...(input.frameCount !== undefined ? { frameCount: input.frameCount } : {}),
    ...(input.lastFrameAt !== undefined ? { lastFrameAt: input.lastFrameAt } : {}),
    ...(input.latestFrameDataUrl !== undefined
      ? { latestFrameDataUrl: input.latestFrameDataUrl }
      : {}),
    ...(input.yaw !== undefined ? { yaw: input.yaw } : {}),
    camera: {
      id: input.id,
      direction: directionForAngle(coneAngle),
      confidence: liveStreamConfidence(input.frameCount ?? 0),
      tone: "watch",
      node,
      conePoints: buildConePoints(node, coneAngle),
      labelAnchor: labelAnchorFor(node),
    },
  }
}

const pointOnEllipse = (degrees: number, radiusX: number, radiusY: number): Point => {
  const radians = toRadians(degrees)
  const point = {
    x: clamp(CENTER.x + radiusX * Math.cos(radians), 18, MAP_VIEW.width - 18),
    y: clamp(CENTER.y + radiusY * Math.sin(radians), 18, MAP_VIEW.height - 18),
  }
  return avoidMiniMap(point)
}

const avoidMiniMap = (point: Point): Point => {
  if (point.x < MINI_MAP_AVOIDANCE.minX || point.y > MINI_MAP_AVOIDANCE.maxY) {
    return point
  }
  return {
    ...point,
    x: MINI_MAP_AVOIDANCE.minX,
  }
}

export const coneAngleForCamera = (node: Point, yaw?: number): number => {
  if (yaw !== undefined) {
    return cameraYawToMapAngle(yaw)
  }
  return normalizeAngle(toDegrees(Math.atan2(CENTER.y - node.y, CENTER.x - node.x)))
}

export const cameraYawToMapAngleWithCalibration = (
  yaw: number,
  calibration: CameraYawMapCalibration,
): number => normalizeAngle(calibration.screenAngleOffsetDegrees + calibration.yawSign * yaw)

export const cameraYawToMapAngle = (yaw: number): number =>
  cameraYawToMapAngleWithCalibration(yaw, TOWN10_CARLA_CAMERA_CALIBRATION)

export const buildConePoints = (node: Point, angle: number): string => {
  const direction = toRadians(angle)
  const half = toRadians(CONE_HALF_ANGLE)
  const left = {
    x: node.x + CONE_LENGTH * Math.cos(direction - half),
    y: node.y + CONE_LENGTH * Math.sin(direction - half),
  }
  const right = {
    x: node.x + CONE_LENGTH * Math.cos(direction + half),
    y: node.y + CONE_LENGTH * Math.sin(direction + half),
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

export const directionForAngle = (angle: number): MapCamera["direction"] => {
  const normalized = normalizeAngle(angle)
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

const toDegrees = (radians: number): number => (radians * 180) / Math.PI

const normalizeAngle = (degrees: number): number => ((degrees % 360) + 360) % 360

const round = (value: number): number => Math.round(value * 100) / 100

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
