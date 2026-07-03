import { CENTER, SATELLITE } from "./copData"
import snapshotRaw from "./osmSnapshot.json?raw"

// Real map features (buildings + roads) from OpenStreetMap for the basemap
// coordinate, captured to a bundled snapshot and projected into the same
// Web-Mercator pixel space as the Esri satellite tiles so they line up with the
// imagery. Bundling (instead of a live Overpass call) keeps rendering
// deterministic and offline-safe — no CORS, rate-limit, or latency at demo time.

export type OsmPoint = { readonly x: number; readonly y: number }
export type OsmRoad = {
  readonly id: string
  readonly points: readonly OsmPoint[]
  readonly major: boolean
}
export type OsmFeatures = {
  readonly buildings: readonly (readonly OsmPoint[])[]
  readonly roads: readonly OsmRoad[]
}

const TILE_SIZE = 256
const WORLD_PX = TILE_SIZE * 2 ** SATELLITE.zoom

const lonToWorldX = (lon: number): number => ((lon + 180) / 360) * WORLD_PX
const latToWorldY = (lat: number): number => {
  const sin = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * WORLD_PX
}

const ORIGIN_X = lonToWorldX(SATELLITE.lon)
const ORIGIN_Y = latToWorldY(SATELLITE.lat)

export const projectToSvg = (lat: number, lon: number): OsmPoint => ({
  x: Math.round((CENTER.x + (lonToWorldX(lon) - ORIGIN_X)) * 100) / 100,
  y: Math.round((CENTER.y + (latToWorldY(lat) - ORIGIN_Y)) * 100) / 100,
})

export const pointsToSvg = (points: readonly OsmPoint[]): string =>
  points.map((point) => `${point.x},${point.y}`).join(" ")

type OsmSnapshot = {
  readonly buildings: readonly (readonly [number, number])[][]
  readonly roads: readonly { readonly m: number; readonly p: readonly [number, number][] }[]
}

const projectPath = (path: readonly (readonly [number, number])[]): readonly OsmPoint[] =>
  path.map(([lat, lon]) => projectToSvg(lat, lon))

const loadSnapshot = (): OsmFeatures => {
  const snapshot = JSON.parse(snapshotRaw) as OsmSnapshot
  return {
    buildings: snapshot.buildings.map(projectPath),
    roads: snapshot.roads.map((road, index) => ({
      id: `road-${index}`,
      points: projectPath(road.p),
      major: road.m === 1,
    })),
  }
}

// Projected once at module load; the geometry is static for the basemap.
export const OSM_FEATURES: OsmFeatures = loadSnapshot()
