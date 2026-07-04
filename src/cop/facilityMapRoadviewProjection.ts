import { MAP_VIEW, type Point } from "./copData"

export type RoadviewProjection = {
  readonly leftPercent: number
  readonly bottomPercent: number
  readonly scale: number
  readonly depthPercent: number
}

const VIEW_ORIGIN_Y = 700
const VIEW_HORIZON_Y = 116
const LATERAL_SPREAD = 42
const FAR_PULL_TO_CENTER = 0.58

export const projectRoadviewPoint = (point: Point): RoadviewProjection | null => {
  const depth = clamp((VIEW_ORIGIN_Y - point.y) / (VIEW_ORIGIN_Y - VIEW_HORIZON_Y), 0, 1)
  const lateralRatio = (point.x - MAP_VIEW.width / 2) / (MAP_VIEW.width / 2)
  const lateralSpread = LATERAL_SPREAD * (1 - depth * FAR_PULL_TO_CENTER)
  const leftPercent = 50 + lateralRatio * lateralSpread
  if (leftPercent < 3 || leftPercent > 97) {
    return null
  }
  return {
    leftPercent: round(leftPercent, 1),
    bottomPercent: round(12 + depth * 60, 1),
    scale: round(1.08 - depth * 0.4, 2),
    depthPercent: round(depth * 100, 1),
  }
}

const round = (value: number, precision: number): number => {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
