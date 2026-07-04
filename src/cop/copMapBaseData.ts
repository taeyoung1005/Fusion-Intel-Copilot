// Static "Common Operational Picture" concept data for the D4D AI perimeter harness.
// Everything here is synthetic and presentational only: no real sensor, identity, or
// targeting data is implied. Geometry is computed once at module load so the SVG map
// and the HTML overlays share a single 1000x600 coordinate space.

export type AlertTone = "normal" | "watch" | "alert" | "confirmed" | "uncertain"

export const MAP_VIEW = { width: 1000, height: 600 } as const

export const CENTER = { x: 492, y: 298 } as const
export const PERIMETER = { rx: 322, ry: 206 } as const

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

export type Point = { readonly x: number; readonly y: number }

const perimeterPoint = (degrees: number): Point => ({
  x: CENTER.x + PERIMETER.rx * Math.cos(toRadians(degrees)),
  y: CENTER.y + PERIMETER.ry * Math.sin(toRadians(degrees)),
})

const percentOf = (value: number, total: number): number =>
  Math.round((value / total) * 10000) / 100

export const toLeftPercent = (x: number): number => percentOf(x, MAP_VIEW.width)
export const toTopPercent = (y: number): number => percentOf(y, MAP_VIEW.height)

// --- Camera nodes on the oval perimeter -----------------------------------------

export type MapCameraSeed = {
  readonly id: string
  readonly direction: "N" | "W" | "E" | "S"
  readonly angle: number
  readonly confidence: number
  readonly tone: AlertTone
  readonly handoff?: "source" | "target"
}

const MAP_CAMERA_SEEDS: readonly MapCameraSeed[] = [
  { id: "CAM-N-01", direction: "N", angle: 238, confidence: 94, tone: "normal" },
  { id: "CAM-N-02", direction: "N", angle: 270, confidence: 95, tone: "watch", handoff: "source" },
  { id: "CAM-N-03", direction: "N", angle: 302, confidence: 91, tone: "normal" },
  { id: "CAM-W-01", direction: "W", angle: 206, confidence: 92, tone: "normal" },
  { id: "CAM-W-02", direction: "W", angle: 158, confidence: 74, tone: "watch" },
  { id: "CAM-E-01", direction: "E", angle: 330, confidence: 93, tone: "watch", handoff: "target" },
  { id: "CAM-E-02", direction: "E", angle: 6, confidence: 92, tone: "normal" },
  { id: "CAM-E-03", direction: "E", angle: 38, confidence: 90, tone: "alert" },
  { id: "CAM-S-01", direction: "S", angle: 124, confidence: 90, tone: "normal" },
  { id: "CAM-S-02", direction: "S", angle: 92, confidence: 88, tone: "normal" },
  { id: "CAM-S-03", direction: "S", angle: 58, confidence: 89, tone: "normal" },
] as const

export type MapCamera = {
  readonly id: string
  readonly direction: MapCameraSeed["direction"]
  readonly confidence: number
  readonly tone: AlertTone
  readonly handoff?: "source" | "target"
  readonly node: Point
  readonly conePoints: string
  readonly labelAnchor: Point
}

const CONE_LENGTH = 150
const CONE_HALF_ANGLE = 17

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
  const round = (value: number): number => Math.round(value * 100) / 100
  return `${round(node.x)},${round(node.y)} ${round(left.x)},${round(left.y)} ${round(right.x)},${round(right.y)}`
}

// Push the label chip a little further out from the center than the node so it sits
// outside the coverage cone, mirroring the concept layout.
const labelAnchorFor = (node: Point): Point => {
  const outward = Math.atan2(node.y - CENTER.y, node.x - CENTER.x)
  return {
    x: node.x + 26 * Math.cos(outward),
    y: node.y + 22 * Math.sin(outward),
  }
}

export const MAP_CAMERAS: readonly MapCamera[] = MAP_CAMERA_SEEDS.map((seed) => {
  const node = perimeterPoint(seed.angle)
  return {
    id: seed.id,
    direction: seed.direction,
    confidence: seed.confidence,
    tone: seed.tone,
    ...(seed.handoff !== undefined ? { handoff: seed.handoff } : {}),
    node,
    conePoints: buildCone(node),
    labelAnchor: labelAnchorFor(node),
  }
})

export const cameraById = (id: string): MapCamera | undefined =>
  MAP_CAMERAS.find((camera) => camera.id === id)

// --- Perimeter + distance bands -------------------------------------------------

export const PERIMETER_PATH = {
  cx: CENTER.x,
  cy: CENTER.y,
  rx: PERIMETER.rx,
  ry: PERIMETER.ry,
} as const

export type DistanceBand = {
  readonly id: string
  readonly label: string
  readonly rx: number
  readonly ry: number
  readonly labelPoint: Point
}

const distanceBand = (id: string, label: string, scale: number): DistanceBand => {
  const rx = PERIMETER.rx * scale
  const ry = PERIMETER.ry * scale
  return { id, label, rx, ry, labelPoint: { x: CENTER.x - 54, y: CENTER.y - ry - 7 } }
}

export const DISTANCE_BANDS: readonly DistanceBand[] = [
  distanceBand("band-50", "50m", 0.86),
  distanceBand("band-30", "30m", 0.6),
  distanceBand("band-10", "10m", 0.34),
] as const

// --- Zones ----------------------------------------------------------------------

export type ZoneLabel = {
  readonly id: string
  readonly label: string
  readonly point: Point
}

export const ZONE_LABELS: readonly ZoneLabel[] = [
  { id: "north", label: "NORTH ZONE", point: { x: 430, y: 196 } },
  { id: "west", label: "WEST ZONE", point: { x: 300, y: 318 } },
  { id: "east", label: "EAST ZONE", point: { x: 678, y: 322 } },
  { id: "south", label: "SOUTH ZONE", point: { x: 452, y: 430 } },
] as const

// --- Satellite base map: ground texture -----------------------------------------

// Irregular ground patches (clearings / dirt) over the terrain texture. Real
// buildings and roads come from OpenStreetMap (see osmFeatures.ts), not from
// hand-drawn shapes.
export const CLEARINGS: readonly string[] = [
  "250,150 330,130 360,200 300,250 240,220",
  "640,420 740,400 770,470 690,510 620,480",
  "150,470 240,450 250,520 160,540",
  "720,140 800,120 820,180 740,200",
]

// --- Central AMMO DEPOT footprint -----------------------------------------------

export type DepotBunker = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly labelPoint: Point
}

export const DEPOT_FOOTPRINT = { x: 478, y: 240, width: 168, height: 128 } as const

export const DEPOT_BUNKERS: readonly DepotBunker[] = [
  { id: "AMMO-C", x: 494, y: 258, width: 26, height: 18, labelPoint: { x: 507, y: 252 } },
  { id: "AMMO-D", x: 600, y: 258, width: 26, height: 18, labelPoint: { x: 613, y: 252 } },
  { id: "AMMO-E", x: 494, y: 330, width: 26, height: 18, labelPoint: { x: 507, y: 360 } },
  { id: "AMMO-F", x: 600, y: 330, width: 26, height: 18, labelPoint: { x: 613, y: 360 } },
] as const

export const DEPOT_TITLE_POINT: Point = { x: 562, y: 307 }
