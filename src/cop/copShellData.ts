// --- Left rail: map layers ------------------------------------------------------

export type MapLayerId =
  | "facilityZones"
  | "perimeterFence"
  | "cctvCameras"
  | "cameraCoverage"
  | "cameraHandoff"
  | "blindSpots"
  | "distanceBands"
  | "terrainContours"
  | "roads"
  | "buildings"
  | "poi"
  | "weather"

export type MapLayer = {
  readonly id: MapLayerId
  readonly label: string
  readonly defaultOn: boolean
}

export const MAP_LAYERS: readonly MapLayer[] = [
  { id: "facilityZones", label: "Facility Zones", defaultOn: true },
  { id: "perimeterFence", label: "Perimeter Fence", defaultOn: true },
  { id: "cctvCameras", label: "CCTV Cameras", defaultOn: true },
  { id: "cameraCoverage", label: "Camera Coverage", defaultOn: true },
  { id: "cameraHandoff", label: "Camera Handoff", defaultOn: true },
  { id: "blindSpots", label: "Blind Spots", defaultOn: true },
  { id: "distanceBands", label: "Distance Bands (50/30/10m)", defaultOn: true },
  { id: "terrainContours", label: "Terrain Contours", defaultOn: false },
  { id: "roads", label: "Roads", defaultOn: false },
  { id: "buildings", label: "Buildings", defaultOn: false },
  { id: "poi", label: "POI / Landmarks", defaultOn: false },
  { id: "weather", label: "Weather Overlay", defaultOn: false },
] as const

// --- Header status --------------------------------------------------------------

export const HEADER = {
  title: "FUSION INTEL COPILOT",
  subtitle: "COMMON OPERATIONAL PICTURE",
  systemStatus: "SYSTEM NOMINAL",
  agents: "AI AGENTS  6 / 6",
  alert: "ALERT WATCH",
  clock: "09:42:18",
  operatorBadge: "A1",
  operatorRole: "OPERATOR",
  operatorName: "Alpha-1",
} as const

export const LAST_UPDATED = "09:42:15"
