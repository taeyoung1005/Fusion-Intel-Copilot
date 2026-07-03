import { MonitorPlay, Smartphone, WifiOff } from "lucide-react"
import { type ReactElement, useEffect, useRef } from "react"
import type { EvidenceClip } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import { mobileCameraConnectionState } from "./mobileCameraStatus"
import { useMobileCameraDetection } from "./useMobileCameraDetection"
import { useMobileCameraStream } from "./useMobileCameraStream"

type LivePhoneCctvWallProps = {
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

export function LivePhoneCctvWall({
  cameras,
  selectedCameraId,
  onSelectCamera,
  onVisionEvidence,
}: LivePhoneCctvWallProps): ReactElement {
  const liveCount = cameras.filter(
    (camera) => mobileCameraConnectionState(camera).tone === "live",
  ).length

  return (
    <section
      id="cop-live-cctv-panel"
      className="cop-panel cop-mobile-live"
      aria-labelledby="cop-live-cctv-title"
    >
      <div className="cop-panel-head">
        <h2 id="cop-live-cctv-title">LIVE PHONE CCTV</h2>
        <MonitorPlay size={15} aria-hidden="true" />
      </div>

      <div className="cop-mobile-live-summary">
        <span className={liveCount > 0 ? undefined : "waiting"}>
          LIVE {liveCount}/{cameras.length}
        </span>
        <small>휴대폰 카메라 실시간 업링크 화면</small>
      </div>

      {cameras.length === 0 ? (
        <div className="cop-mobile-live-empty-state">
          <div className="cop-mobile-live-empty-screen">
            <Smartphone size={26} aria-hidden="true" />
            <strong>연결된 휴대폰 CCTV 없음</strong>
            <span>
              좌측 CCTV REGISTRY의 QR을 휴대폰으로 스캔하면 실시간 카메라 화면이 여기에 표시됩니다.
            </span>
          </div>
        </div>
      ) : (
        <div className="cop-mobile-live-grid" aria-label="휴대폰 CCTV 라이브 화면">
          {cameras.map((record) => (
            <LivePhoneCctvCard
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

type LivePhoneCctvCardProps = {
  readonly record: DynamicCameraRecord
  readonly selected: boolean
  readonly onSelectCamera: (camera: DynamicCameraRecord) => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
}

function LivePhoneCctvCard({
  record,
  selected,
  onSelectCamera,
  onVisionEvidence,
}: LivePhoneCctvCardProps): ReactElement {
  const connection = mobileCameraConnectionState(record)
  const { stream } = useMobileCameraStream(record.id)
  useMobileCameraDetection(record.id, record.label, stream, onVisionEvidence)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasFrame = record.latestFrameDataUrl !== null && record.latestFrameDataUrl !== undefined

  useEffect(() => {
    const video = videoRef.current
    if (video !== null) {
      video.srcObject = stream
    }
  }, [stream])

  return (
    <button
      type="button"
      className={`cop-mobile-live-card tone-${connection.tone}${selected ? " selected" : ""}`}
      aria-label={`${record.id} 라이브 CCTV 선택`}
      onClick={() => onSelectCamera(record)}
    >
      <div className="cop-mobile-live-media">
        <span className={`cop-mobile-live-status tone-${connection.tone}`}>
          {stream !== null ? "LIVE" : connection.shortLabel}
        </span>
        {stream !== null ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label={`${record.id} 라이브 영상`}
          />
        ) : hasFrame ? (
          <img src={record.latestFrameDataUrl ?? ""} alt={`${record.id} 라이브 CCTV 화면`} />
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
