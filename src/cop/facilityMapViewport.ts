import { CENTER, MAP_VIEW, type Point } from "./copData"

export type FacilityViewport = {
  readonly center: Point
  readonly zoom: number
  readonly rotation: number
}

export type MinimapViewportIndicator = {
  readonly leftPercent: number
  readonly topPercent: number
  readonly widthPercent: number
  readonly heightPercent: number
  readonly coveragePercent: number
}

export type FacilityMapPointerBounds = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export const DEFAULT_FACILITY_VIEWPORT: FacilityViewport = {
  center: CENTER,
  zoom: 1,
  rotation: 0,
}

export const FACILITY_VIEWPORT_ZOOM = {
  min: 1,
  max: 2.4,
  step: 0.2,
} as const

const ROTATION_LIMIT = 45

export const facilityViewBoxRect = (
  viewport: FacilityViewport,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } => {
  const width = MAP_VIEW.width / viewport.zoom
  const height = MAP_VIEW.height / viewport.zoom
  const x = clamp(viewport.center.x - width / 2, 0, MAP_VIEW.width - width)
  const y = clamp(viewport.center.y - height / 2, 0, MAP_VIEW.height - height)
  return { x, y, width, height }
}

export const facilityViewBox = (viewport: FacilityViewport): string => {
  const rect = facilityViewBoxRect(viewport)
  return `${format(rect.x)} ${format(rect.y)} ${format(rect.width)} ${format(rect.height)}`
}

export const pointerMapPoint = (
  bounds: FacilityMapPointerBounds,
  clientX: number,
  clientY: number,
  viewport: FacilityViewport,
): Point => {
  const rect = facilityViewBoxRect(viewport)
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  return {
    x: rect.x + ((clientX - bounds.left) / width) * rect.width,
    y: rect.y + ((clientY - bounds.top) / height) * rect.height,
  }
}

export const zoomFacilityViewport = (
  viewport: FacilityViewport,
  zoom: number,
  focusPoint: Point,
): FacilityViewport => {
  const nextZoom = clamp(zoom, FACILITY_VIEWPORT_ZOOM.min, FACILITY_VIEWPORT_ZOOM.max)
  const current = facilityViewBoxRect(viewport)
  const width = MAP_VIEW.width / nextZoom
  const height = MAP_VIEW.height / nextZoom
  const widthRatio = width / current.width
  const heightRatio = height / current.height
  const x = focusPoint.x - (focusPoint.x - current.x) * widthRatio
  const y = focusPoint.y - (focusPoint.y - current.y) * heightRatio
  return viewportFromRect(x, y, width, height, viewport.rotation, nextZoom)
}

export const panFacilityViewport = (
  viewport: FacilityViewport,
  delta: Point,
): FacilityViewport => ({
  ...viewport,
  center: clampCenter(
    {
      x: viewport.center.x + delta.x,
      y: viewport.center.y + delta.y,
    },
    viewport.zoom,
  ),
})

export const rotateFacilityViewport = (
  viewport: FacilityViewport,
  deltaDegrees: number,
): FacilityViewport => ({
  ...viewport,
  rotation: clamp(viewport.rotation + deltaDegrees, -ROTATION_LIMIT, ROTATION_LIMIT),
})

export const minimapViewportIndicator = (viewport: FacilityViewport): MinimapViewportIndicator => {
  const rect = facilityViewBoxRect(viewport)
  return {
    leftPercent: round((rect.x / MAP_VIEW.width) * 100),
    topPercent: round((rect.y / MAP_VIEW.height) * 100),
    widthPercent: round((rect.width / MAP_VIEW.width) * 100),
    heightPercent: round((rect.height / MAP_VIEW.height) * 100),
    coveragePercent: round((rect.width * rect.height * 100) / (MAP_VIEW.width * MAP_VIEW.height)),
  }
}

const viewportFromRect = (
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  zoom: number,
): FacilityViewport => ({
  center: clampCenter({ x: x + width / 2, y: y + height / 2 }, zoom),
  zoom,
  rotation,
})

const clampCenter = (center: Point, zoom: number): Point => {
  const halfWidth = MAP_VIEW.width / zoom / 2
  const halfHeight = MAP_VIEW.height / zoom / 2
  return {
    x: clamp(center.x, halfWidth, MAP_VIEW.width - halfWidth),
    y: clamp(center.y, halfHeight, MAP_VIEW.height - halfHeight),
  }
}

const format = (value: number): string => {
  const rounded = round(value)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

const round = (value: number): number => Math.round(value * 100) / 100

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
