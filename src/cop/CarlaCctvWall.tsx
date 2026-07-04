import { Car, MonitorPlay, WifiOff } from "lucide-react"
import { type ReactElement, memo, useCallback, useEffect, useMemo, useState } from "react"
import { cameraConnectionState } from "./cameraConnectionStatus"
import type { EvidenceClip } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import type { CarlaCameraDetectionFrame } from "./useCarlaCameraDetection"
import { useCarlaCameraDetection } from "./useCarlaCameraDetection"
import { useCarlaVideoDetection } from "./useCarlaVideoDetection"
import { useCarlaWebrtcVideo } from "./useCarlaWebrtcVideo"

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

export const CarlaCctvWall = memo(function CarlaCctvWall({
  cameras,
  selectedCameraId,
  onSelectCamera,
  onVisionEvidence,
}: CarlaCctvWallProps): ReactElement {
  const liveCount = useMemo(
    () => cameras.filter((camera) => cameraConnectionState(camera).tone === "live").length,
    [cameras],
  )

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
})

type CarlaCctvCardProps = {
  readonly record: DynamicCameraRecord
  readonly selected: boolean
  readonly onSelectCamera: (camera: DynamicCameraRecord) => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
}

type CarlaCctvDetectionOverlayProps = {
  readonly frame: CarlaCameraDetectionFrame | null
}

// DETR only returns bounding boxes here, so this is a box-based contour approximation,
// not pixel-level segmentation or an object mask.
export const CarlaCctvDetectionOverlay = memo(function CarlaCctvDetectionOverlay({
  frame,
}: CarlaCctvDetectionOverlayProps): ReactElement | null {
  if (frame === null || frame.objects.length === 0) {
    return null
  }

  return (
    <svg
      className="cop-detection-overlay"
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {frame.objects.map((object) => {
        const { bbox } = object
        const x2 = bbox.x + bbox.width
        const y2 = bbox.y + bbox.height
        const cornerLength = Math.max(8, Math.min(22, Math.min(bbox.width, bbox.height) * 0.28))
        const label = `${object.label} ${Math.round(object.confidence * 100)}%`

        return (
          <g
            className="cop-detection-object"
            data-object-label={object.label}
            key={
              object.objectId ?? `${object.label}-${bbox.x}-${bbox.y}-${bbox.width}-${bbox.height}`
            }
          >
            <rect
              className="cop-detection-box"
              x={bbox.x}
              y={bbox.y}
              width={bbox.width}
              height={bbox.height}
              rx="2"
            />
            <path
              className="cop-detection-corners"
              d={`M ${bbox.x} ${bbox.y + cornerLength} L ${bbox.x} ${bbox.y} L ${bbox.x + cornerLength} ${bbox.y} M ${x2 - cornerLength} ${bbox.y} L ${x2} ${bbox.y} L ${x2} ${bbox.y + cornerLength} M ${x2} ${y2 - cornerLength} L ${x2} ${y2} L ${x2 - cornerLength} ${y2} M ${bbox.x + cornerLength} ${y2} L ${bbox.x} ${y2} L ${bbox.x} ${y2 - cornerLength}`}
            />
            <text className="cop-detection-label" x={bbox.x + 5} y={Math.max(13, bbox.y + 14)}>
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
})

const CarlaCctvCard = memo(function CarlaCctvCard({
  record,
  selected,
  onSelectCamera,
  onVisionEvidence,
}: CarlaCctvCardProps): ReactElement {
  const connection = cameraConnectionState(record)
  const hasFrame = record.latestFrameDataUrl !== null && record.latestFrameDataUrl !== undefined
  const webrtc = useCarlaWebrtcVideo(record.id, hasFrame)
  const webrtcLive = webrtc.state === "live"
  const [detectionFrame, setDetectionFrame] = useState<CarlaCameraDetectionFrame | null>(null)
  const updateDetections = useCallback((frame: CarlaCameraDetectionFrame): void => {
    setDetectionFrame(frame.objects.length === 0 ? null : frame)
  }, [])
  const selectCamera = useCallback((): void => {
    onSelectCamera(record)
  }, [onSelectCamera, record])

  useEffect(() => {
    if (!hasFrame || webrtcLive) {
      setDetectionFrame(null)
    }
  }, [hasFrame, webrtcLive])

  useCarlaVideoDetection(record.id, record.label, webrtc.videoRef, webrtcLive, onVisionEvidence)
  useCarlaCameraDetection(
    record.id,
    record.label,
    webrtcLive ? null : (record.latestFrameDataUrl ?? null),
    webrtcLive ? null : (record.lastFrameAt ?? null),
    onVisionEvidence,
    updateDetections,
  )

  return (
    <button
      type="button"
      className={`cop-mobile-live-card tone-${connection.tone}${selected ? " selected" : ""}`}
      aria-label={`${record.id} CARLA 시뮬레이션 CCTV 선택`}
      onClick={selectCamera}
    >
      <div className="cop-mobile-live-media">
        <span className={`cop-mobile-live-status tone-${connection.tone}`}>
          {connection.shortLabel}
        </span>
        {hasFrame ? (
          <>
            <video
              ref={webrtc.videoRef}
              className={webrtcLive ? undefined : "pending"}
              aria-label={`${record.id} CARLA WebRTC CCTV 화면`}
              autoPlay
              muted
              playsInline
            />
            <img
              className={webrtcLive ? "fallback" : undefined}
              src={record.latestFrameDataUrl ?? ""}
              alt={`${record.id} CARLA CCTV 화면`}
              decoding="async"
            />
            <CarlaCctvDetectionOverlay frame={detectionFrame} />
          </>
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
})
