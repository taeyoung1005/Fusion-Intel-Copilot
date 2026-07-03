import { Car, MonitorPlay, WifiOff } from "lucide-react"
import type { ReactElement } from "react"
import { cameraConnectionState } from "./cameraConnectionStatus"
import { carlaCameraStreamSrc } from "./carlaCameraClient"
import type { EvidenceClip } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import { useCarlaCameraDetection } from "./useCarlaCameraDetection"

type CarlaCctvWallProps = {
  readonly cameras: readonly DynamicCameraRecord[]
  readonly selectedCameraId: string
  readonly onSelectCamera: (camera: DynamicCameraRecord) => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
}

const formatLastFrame = (iso: string | null | undefined): string => {
  if (iso === null || iso === undefined) {
    return "프레임 대기"
  }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) {
    return "프레임 대기"
  }
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}

export function CarlaCctvWall({
  cameras,
  selectedCameraId,
  onSelectCamera,
  onVisionEvidence,
}: CarlaCctvWallProps): ReactElement {
  const liveCount = cameras.filter((camera) => cameraConnectionState(camera).tone === "live").length

  return (
    <section
      id="cop-carla-cctv-panel"
      className="cop-panel cop-mobile-live"
      aria-labelledby="cop-carla-cctv-title"
    >
      <div className="cop-panel-head">
        <h2 id="cop-carla-cctv-title">CARLA SIM CCTV</h2>
        <MonitorPlay size={15} aria-hidden="true" />
      </div>

      <div className="cop-mobile-live-summary">
        <span className={liveCount > 0 ? undefined : "waiting"}>
          LIVE {liveCount}/{cameras.length}
        </span>
        <small>CARLA 가상 도시 시뮬레이션 CCTV 화면</small>
      </div>

      {cameras.length === 0 ? (
        <div className="cop-mobile-live-empty-state">
          <div className="cop-mobile-live-empty-screen">
            <Car size={26} aria-hidden="true" />
            <strong>연결된 CARLA 시뮬레이션 카메라 없음</strong>
            <span>CARLA 브리지를 실행하면 여러 각도의 CCTV 화면이 여기에 자동으로 표시됩니다.</span>
          </div>
        </div>
      ) : (
        <div className="cop-mobile-live-grid" aria-label="CARLA 시뮬레이션 CCTV 화면">
          {cameras.map((record) => (
            <CarlaCctvCard
              key={record.id}
              record={record}
              selected={record.id === selectedCameraId}
              onSelectCamera={onSelectCamera}
              onVisionEvidence={onVisionEvidence}
            />
          ))}
        </div>
      )}
    </section>
  )
}

type CarlaCctvCardProps = {
  readonly record: DynamicCameraRecord
  readonly selected: boolean
  readonly onSelectCamera: (camera: DynamicCameraRecord) => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
}

function CarlaCctvCard({
  record,
  selected,
  onSelectCamera,
  onVisionEvidence,
}: CarlaCctvCardProps): ReactElement {
  const connection = cameraConnectionState(record)
  useCarlaCameraDetection(
    record.id,
    record.label,
    record.latestFrameDataUrl ?? null,
    record.lastFrameAt ?? null,
    onVisionEvidence,
  )
  const hasFrame = record.latestFrameDataUrl !== null && record.latestFrameDataUrl !== undefined
  const streamSrc = carlaCameraStreamSrc(record.id)

  return (
    <button
      type="button"
      className={`cop-mobile-live-card tone-${connection.tone}${selected ? " selected" : ""}`}
      aria-label={`${record.id} CARLA 시뮬레이션 CCTV 선택`}
      onClick={() => onSelectCamera(record)}
    >
      <div className="cop-mobile-live-media">
        <span className={`cop-mobile-live-status tone-${connection.tone}`}>
          {connection.shortLabel}
        </span>
        {hasFrame ? (
          <img src={streamSrc} alt={`${record.id} CARLA CCTV 화면`} decoding="async" />
        ) : (
          <span className="cop-mobile-live-empty">
            <WifiOff size={12} aria-hidden="true" />
            프레임 대기
          </span>
        )}
      </div>
      <div className="cop-mobile-live-meta">
        <strong>{record.id}</strong>
        <span>
          {record.frameCount ?? 0}F · {formatLastFrame(record.lastFrameAt)}
        </span>
      </div>
    </button>
  )
}
