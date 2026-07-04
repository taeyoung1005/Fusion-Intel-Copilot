import {
  BarChart3,
  Building2,
  FileText,
  FolderOpen,
  Layers,
  Map as MapIcon,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
} from "lucide-react"
import { type ReactElement, useState } from "react"
import { CarlaCctvWall, type CarlaDetectionServerConnectionHandler } from "./CarlaCctvWall"
import { type EvidenceClip, MAP_LAYERS, type MapLayerId } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"

const RAIL_ICONS = [
  { id: "map", label: "지도", icon: MapIcon, targetId: "cop-map-section" },
  { id: "folder", label: "사건 폴더", icon: FolderOpen, targetId: "cop-incidents-panel" },
  { id: "facility", label: "시설", icon: Building2, targetId: "cop-carla-cctv-panel" },
  { id: "layers", label: "레이어", icon: Layers, targetId: "cop-map-layers-panel" },
  { id: "reports", label: "보고서", icon: FileText, targetId: "cop-report-panel" },
  { id: "analytics", label: "분석", icon: BarChart3, targetId: "cop-codex-panel" },
  { id: "settings", label: "설정", icon: Settings2, targetId: "cop-gate" },
] as const

export function IconRail({
  onNavigate,
  onOpenCctvWindow,
}: {
  readonly onNavigate: (targetId: string, label: string) => void
  readonly onOpenCctvWindow: () => void
}): ReactElement {
  const [activeId, setActiveId] = useState("map")

  return (
    <nav className="cop-icon-rail" aria-label="운용 도구 레일">
      {RAIL_ICONS.map((item) => {
        const Icon = item.icon
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            className={`cop-rail-button${active ? " active" : ""}`}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              setActiveId(item.id)
              if (item.id === "facility") {
                onOpenCctvWindow()
                return
              }
              onNavigate(item.targetId, item.label)
            }}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        )
      })}
    </nav>
  )
}

type LeftPanelsProps = {
  readonly activeLayers: ReadonlySet<MapLayerId>
  readonly onToggleLayer: (id: MapLayerId) => void
  readonly selectedCameraId: string
  readonly carlaCameras: readonly DynamicCameraRecord[]
  readonly onSelectDynamicCamera: (camera: DynamicCameraRecord) => void
  readonly lastUpdated: string
  readonly onRefresh: () => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
  readonly cctvWindowOpen: boolean
  readonly onCloseCctvWindow: () => void
  readonly onDetectionServerConnectionChange: CarlaDetectionServerConnectionHandler
}

export function LeftPanels({
  activeLayers,
  onToggleLayer,
  selectedCameraId,
  carlaCameras,
  onSelectDynamicCamera,
  lastUpdated,
  onRefresh,
  onVisionEvidence,
  cctvWindowOpen,
  onCloseCctvWindow,
  onDetectionServerConnectionChange,
}: LeftPanelsProps): ReactElement {
  return (
    <>
      <aside className="cop-left" aria-label="좌측 운용 레이어">
        <section
          id="cop-map-layers-panel"
          className="cop-panel"
          aria-labelledby="cop-map-layers-title"
        >
          <div className="cop-panel-head">
            <h2 id="cop-map-layers-title">MAP LAYERS</h2>
            <SlidersHorizontal size={15} aria-hidden="true" />
          </div>
          <ul className="cop-layer-list">
            {MAP_LAYERS.map((layer) => {
              const checked = activeLayers.has(layer.id)
              return (
                <li key={layer.id}>
                  <label className="cop-layer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleLayer(layer.id)}
                    />
                    <span className="cop-check" aria-hidden="true" />
                    <span className="cop-layer-label">{layer.label}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>

        {!cctvWindowOpen && (
          <CarlaCctvWall
            cameras={carlaCameras}
            selectedCameraId={selectedCameraId}
            onSelectCamera={onSelectDynamicCamera}
            onVisionEvidence={onVisionEvidence}
            onDetectionServerConnectionChange={onDetectionServerConnectionChange}
          />
        )}

        <div className="cop-left-footer">
          <div>
            <small>LAST UPDATED</small>
            <strong>{lastUpdated}</strong>
          </div>
          <button type="button" className="cop-refresh" onClick={onRefresh}>
            <RefreshCw size={13} aria-hidden="true" />
            REFRESH
          </button>
        </div>
      </aside>

      {cctvWindowOpen && (
        <CarlaCctvWall
          cameras={carlaCameras}
          selectedCameraId={selectedCameraId}
          onSelectCamera={onSelectDynamicCamera}
          onVisionEvidence={onVisionEvidence}
          onDetectionServerConnectionChange={onDetectionServerConnectionChange}
          expanded
          onClose={onCloseCctvWindow}
        />
      )}
    </>
  )
}
