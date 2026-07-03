import { Crosshair, Expand, Minus, Plus } from "lucide-react"
import { type ReactElement, useState } from "react"
import { MapDefs } from "./FacilityMapDefs"
import { MapScene } from "./FacilityMapScene"
import { WeatherCanvas, WeatherReadout } from "./FacilityMapWeather"
import {
  LEGEND_ITEMS,
  MAP_COORDINATE,
  MAP_VIEW,
  type MapCamera,
  type MapEvent,
  type MapLayerId,
} from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import { useOsmFeatures } from "./useOsmFeatures"
import { useWeather } from "./useWeather"

type FacilityMapProps = {
  readonly activeLayers: ReadonlySet<MapLayerId>
  readonly selectedCameraId: string
  readonly dynamicCameraRecords: readonly DynamicCameraRecord[]
  readonly detectionMarkers: readonly MapEvent[]
  readonly onSelectCamera: (camera: MapCamera) => void
  readonly onSelectDynamicCamera: (camera: DynamicCameraRecord) => void
  readonly onSelectEvent: (event: MapEvent) => void
}

export function FacilityMap({
  activeLayers,
  selectedCameraId,
  dynamicCameraRecords,
  detectionMarkers,
  onSelectCamera,
  onSelectDynamicCamera,
  onSelectEvent,
}: FacilityMapProps): ReactElement {
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D")
  const [zoom, setZoom] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const osmFeatures = useOsmFeatures()
  const weather = useWeather()

  const has = (id: MapLayerId): boolean => activeLayers.has(id)
  const clampZoom = (next: number): number => Math.min(1.6, Math.max(0.7, next))

  return (
    <section
      id="cop-map-section"
      className="cop-panel cop-map-card"
      aria-labelledby="cop-map-title"
    >
      <div className="cop-panel-head cop-map-head">
        <h2 id="cop-map-title">
          <span className="cop-kicker">FACILITY MAP / LIVE SIM CCTV</span>
        </h2>
      </div>

      <div
        className={`cop-map${viewMode === "3D" ? " is-3d" : ""}${expanded ? " is-expanded" : ""}`}
        aria-label="시설 지도와 실시간 CCTV 시야"
      >
        <div className="cop-map-stage">
          <svg
            className="cop-map-svg"
            viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`}
            preserveAspectRatio="xMidYMid slice"
            style={{ transform: `scale(${zoom})` }}
            role="img"
            aria-label="시설 지도"
          >
            <MapDefs />
            <rect
              x={0}
              y={0}
              width={MAP_VIEW.width}
              height={MAP_VIEW.height}
              fill="url(#cop-map-bg)"
            />
            <MapScene
              has={has}
              selectedCameraId={selectedCameraId}
              dynamicCameraRecords={dynamicCameraRecords}
              detectionMarkers={detectionMarkers}
              osmFeatures={osmFeatures}
              onSelectCamera={onSelectCamera}
              onSelectDynamicCamera={onSelectDynamicCamera}
              onSelectEvent={onSelectEvent}
            />
          </svg>
          {has("weather") && weather !== null && <WeatherCanvas weather={weather} />}
        </div>

        {has("weather") && <WeatherReadout weather={weather} />}

        <div className="cop-map-legend" aria-label="범례">
          <strong>LEGEND</strong>
          <ul>
            {LEGEND_ITEMS.map((item) => (
              <li key={item.id}>
                <span className={`cop-legend-mark mark-${item.id}`} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="cop-map-zoom" aria-label="지도 확대 제어">
          <button
            type="button"
            aria-label="확대"
            onClick={() => setZoom((z) => clampZoom(z + 0.15))}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="축소"
            onClick={() => setZoom((z) => clampZoom(z - 0.15))}
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="기준 위치로" onClick={() => setZoom(1)}>
            <Crosshair size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="cop-map-mini" aria-label="미니맵과 보기 모드">
          <div className="cop-mini-frame" aria-hidden="true">
            <span className="cop-mini-shape" />
            <span className="cop-mini-view" />
          </div>
          <div className="cop-mini-controls">
            <button
              type="button"
              className={viewMode === "2D" ? "active" : ""}
              onClick={() => setViewMode("2D")}
            >
              2D
            </button>
            <button
              type="button"
              className={viewMode === "3D" ? "active" : ""}
              onClick={() => setViewMode("3D")}
            >
              3D
            </button>
            <button
              type="button"
              className="cop-mini-expand"
              aria-label="전체 화면"
              aria-pressed={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <Expand size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="cop-map-coord">
          <span>
            {MAP_COORDINATE.lat}, {MAP_COORDINATE.lon}
          </span>
          <small>
            {MAP_COORDINATE.datum} • {MAP_COORDINATE.elevation}
          </small>
        </div>
      </div>
    </section>
  )
}
