import { Crosshair, Expand, Minus, Plus, RotateCcw, RotateCw } from "lucide-react"
import {
  Component,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
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
import { useFacilityMapViewport } from "./useFacilityMapViewport"
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

type FacilityMapErrorBoundaryProps = {
  readonly children: ReactNode
}

type FacilityMapErrorBoundaryState = {
  readonly hasRenderError: boolean
}

class FacilityMapErrorBoundary extends Component<
  FacilityMapErrorBoundaryProps,
  FacilityMapErrorBoundaryState
> {
  readonly state: FacilityMapErrorBoundaryState = {
    hasRenderError: false,
  }

  static getDerivedStateFromError(): FacilityMapErrorBoundaryState {
    return { hasRenderError: true }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    console.error("시설 지도 렌더링 실패", error, errorInfo.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasRenderError) {
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
          <div className="cop-map-error" role="alert">
            <strong>지도 표시 오류</strong>
            <span>지도 모듈에서 예외가 발생했습니다. 다른 COP 패널은 계속 사용할 수 있습니다.</span>
            <button type="button" onClick={this.reset}>
              다시 시도
            </button>
          </div>
        </section>
      )
    }

    return this.props.children
  }

  private readonly reset = (): void => {
    this.setState({ hasRenderError: false })
  }
}

export const FacilityMap = memo(function FacilityMap(props: FacilityMapProps): ReactElement {
  return (
    <FacilityMapErrorBoundary>
      <FacilityMapContent {...props} />
    </FacilityMapErrorBoundary>
  )
})

function FacilityMapContent({
  activeLayers,
  selectedCameraId,
  dynamicCameraRecords,
  detectionMarkers,
  onSelectCamera,
  onSelectDynamicCamera,
  onSelectEvent,
}: FacilityMapProps): ReactElement {
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D")
  const [expanded, setExpanded] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const viewportControls = useFacilityMapViewport()
  const osmFeatures = useOsmFeatures()
  const weather = useWeather()

  const has = useCallback((id: MapLayerId): boolean => activeLayers.has(id), [activeLayers])

  useEffect(() => {
    const svg = svgRef.current
    if (svg === null) {
      return
    }
    const handleWheel = viewportControls.handleWheel
    svg.addEventListener("wheel", handleWheel, { passive: false })
    return () => {
      svg.removeEventListener("wheel", handleWheel)
    }
  }, [viewportControls.handleWheel])

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
        aria-label={`시설 지도와 실시간 CCTV 시야, 현재 뷰포트 ${viewportControls.minimapCoveragePercent}%`}
      >
        <div className="cop-map-stage">
          <svg
            ref={svgRef}
            className="cop-map-svg"
            viewBox={viewportControls.viewBox}
            preserveAspectRatio="xMidYMid slice"
            role="img"
            aria-label="시설 지도"
            onPointerDown={viewportControls.handlePointerDown}
            onPointerMove={viewportControls.handlePointerMove}
            onPointerUp={viewportControls.endPointerDrag}
            onPointerCancel={viewportControls.endPointerDrag}
            onPointerLeave={viewportControls.endPointerDrag}
          >
            <MapDefs />
            <rect
              x={0}
              y={0}
              width={MAP_VIEW.width}
              height={MAP_VIEW.height}
              fill="url(#cop-map-bg)"
            />
            <g transform={viewportControls.rotationTransform}>
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
            </g>
          </svg>
          {has("weather") && weather !== null && <WeatherCanvas weather={weather} />}
        </div>

        {has("weather") && <WeatherReadout weather={weather} />}

        {has("legend") && (
          <div className="cop-map-legend" aria-label="범례">
            <strong>LEGEND</strong>
            <ul>
              {LEGEND_ITEMS.map((item) => (
                <li key={item.id} title={"title" in item ? item.title : undefined}>
                  <span className={`cop-legend-mark mark-${item.id}`} aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="cop-map-zoom" aria-label="지도 확대 제어">
          <button type="button" aria-label="확대" onClick={viewportControls.zoomIn}>
            <Plus size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="축소" onClick={viewportControls.zoomOut}>
            <Minus size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="기준 위치로" onClick={viewportControls.resetViewport}>
            <Crosshair size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="cop-map-rotate" aria-label="지도 회전 제어">
          <button type="button" aria-label="왼쪽으로 회전" onClick={viewportControls.rotateLeft}>
            <RotateCcw size={15} aria-hidden="true" />
          </button>
          <span>{viewportControls.viewport.rotation}°</span>
          <button type="button" aria-label="오른쪽으로 회전" onClick={viewportControls.rotateRight}>
            <RotateCw size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="cop-map-mini" aria-label="미니맵과 보기 모드">
          {has("minimap") && (
            <>
              <div className="cop-mini-frame" aria-hidden="true">
                <span className="cop-mini-shape" />
                <span className="cop-mini-view" style={viewportControls.minimapStyle} />
              </div>
              <div className="cop-mini-meta">
                <span>{viewportControls.minimapCoveragePercent}% VIEW</span>
                <span>{viewportControls.viewport.zoom.toFixed(1)}x</span>
              </div>
            </>
          )}
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
