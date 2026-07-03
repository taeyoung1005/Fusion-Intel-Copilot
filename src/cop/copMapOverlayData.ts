import { type AlertTone, CENTER, MAP_VIEW, type Point, cameraById } from "./copMapBaseData"

// --- Real satellite basemap (Esri World Imagery, keyless) -----------------------
// Web-Mercator tiles centered on the readout coordinate. Computed once at load
// (no Date/random) and rendered as SVG <image> tiles under the facility overlay,
// so the +/- zoom transform scales imagery and overlay together. If the tiles
// fail to load (offline), the synthetic terrain base shows through underneath.

export type SatelliteTile = {
  readonly id: string
  readonly href: string
  readonly x: number
  readonly y: number
  readonly size: number
}

// Basemap centered on a building-dense district (Suwon Yeongtong) so the real
// OpenStreetMap building/road layers have genuine geometry to render.
export const SATELLITE = { lat: 37.25, lon: 127.07, zoom: 16 } as const

const SATELLITE_TILE_SIZE = 256

const buildSatelliteTiles = (): readonly SatelliteTile[] => {
  const z = SATELLITE.zoom
  const worldTiles = 2 ** z
  const worldPx = SATELLITE_TILE_SIZE * worldTiles
  const latRad = (SATELLITE.lat * Math.PI) / 180
  const sin = Math.sin(latRad)
  const gx = ((SATELLITE.lon + 180) / 360) * worldPx
  const gy = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldPx
  const round = (value: number): number => Math.round(value * 100) / 100
  const txMin = Math.floor((gx - CENTER.x) / SATELLITE_TILE_SIZE)
  const txMax = Math.floor((gx + (MAP_VIEW.width - CENTER.x)) / SATELLITE_TILE_SIZE)
  const tyMin = Math.floor((gy - CENTER.y) / SATELLITE_TILE_SIZE)
  const tyMax = Math.floor((gy + (MAP_VIEW.height - CENTER.y)) / SATELLITE_TILE_SIZE)
  const tiles: SatelliteTile[] = []
  for (let ty = tyMin; ty <= tyMax; ty += 1) {
    for (let tx = txMin; tx <= txMax; tx += 1) {
      if (tx < 0 || ty < 0 || tx >= worldTiles || ty >= worldTiles) {
        continue
      }
      tiles.push({
        id: `${z}-${tx}-${ty}`,
        href: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`,
        x: round(CENTER.x + tx * SATELLITE_TILE_SIZE - gx),
        y: round(CENTER.y + ty * SATELLITE_TILE_SIZE - gy),
        size: SATELLITE_TILE_SIZE,
      })
    }
  }
  return tiles
}

export const SATELLITE_TILES: readonly SatelliteTile[] = buildSatelliteTiles()

// --- Blind spots ----------------------------------------------------------------

export type BlindSpot = {
  readonly id: string
  readonly label: string
  readonly points: string
  readonly labelPoint: Point
}

export const BLIND_SPOTS: readonly BlindSpot[] = [
  {
    id: "blind-a",
    label: "BLIND SPOT A",
    points: "742,96 884,128 858,196 720,164",
    labelPoint: { x: 800, y: 146 },
  },
  {
    id: "blind-b",
    label: "BLIND SPOT B",
    points: "150,392 286,418 268,486 132,460",
    labelPoint: { x: 208, y: 440 },
  },
] as const

// --- Handoff path ---------------------------------------------------------------

const handoffSource = cameraById("CAM-N-02")?.node ?? CENTER
const handoffTarget = cameraById("CAM-E-01")?.node ?? CENTER

export const HANDOFF_CAMERA_IDS = ["CAM-N-02", "CAM-E-01"] as const

export const HANDOFF_PATH = {
  d: `M ${handoffSource.x} ${handoffSource.y} Q ${(handoffSource.x + handoffTarget.x) / 2 + 40} ${handoffSource.y - 70} ${handoffTarget.x} ${handoffTarget.y}`,
  source: handoffSource,
  target: handoffTarget,
  callout: {
    title: "HANDOFF",
    route: "CAM-N-02 → CAM-E-01",
    time: "09:41:55",
    point: { x: 626, y: 150 },
  },
} as const

// --- Map event markers (synthetic motion) ---------------------------------------

export type MapEvent = {
  readonly id: string
  readonly time: string
  readonly tone: AlertTone
  readonly point: Point
}

export const MAP_EVENTS: readonly MapEvent[] = [
  { id: "evt-w", time: "09:41:33", tone: "watch", point: { x: 322, y: 286 } },
  { id: "evt-e", time: "09:45:55", tone: "watch", point: { x: 656, y: 286 } },
  { id: "evt-s", time: "09:41:02", tone: "alert", point: { x: 474, y: 408 } },
] as const

// --- Map coordinate readout -----------------------------------------------------

export const MAP_COORDINATE = {
  lat: "37.250000° N",
  lon: "127.070000° E",
  datum: "WGS 84",
  elevation: "128 m",
} as const
