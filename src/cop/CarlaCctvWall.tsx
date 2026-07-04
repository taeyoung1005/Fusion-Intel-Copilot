import { Car, MonitorPlay, WifiOff, X } from "lucide-react"
import {
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { cameraConnectionState } from "./cameraConnectionStatus"
import type { EvidenceClip } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import type { DetrServerConnection } from "./serverDetectionClient"
import type { CarlaCameraDetectionFrame } from "./useCarlaCameraDetection"
import { useCarlaCameraDetection } from "./useCarlaCameraDetection"
import { useCarlaVideoDetection } from "./useCarlaVideoDetection"
import { useCarlaWebrtcVideo } from "./useCarlaWebrtcVideo"

type CarlaCctvWallProps = {
  readonly cameras: readonly DynamicCameraRecord[]
  readonly selectedCameraId: string
  readonly onSelectCamera: (camera: DynamicCameraRecord) => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
  readonly onDetectionServerConnectionChange?: CarlaDetectionServerConnectionHandler
  readonly onDetectionFrameChange?: CarlaDetectionFrameChangeHandler
  readonly expanded?: boolean
  readonly onClose?: () => void
}

export type CarlaDetectionServerConnectionHandler = (
  cameraId: string,
  connection: DetrServerConnection,
) => void

// Shares one camera's live tracking boxes with any other surface showing that
// same feed (e.g. the realtime alert popup), so we don't run a second DETR
// polling loop for a camera that's already being detected on in its CCTV tile.
export type CarlaDetectionFrameChangeHandler = (
  cameraId: string,
  frame: Pick<CarlaCameraDetectionFrame, "width" | "height" | "objects"> | null,
) => void

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
  onDetectionServerConnectionChange,
  onDetectionFrameChange,
  expanded = false,
  onClose,
}: CarlaCctvWallProps): ReactElement {
  const liveCount = useMemo(
    () => cameras.filter((camera) => cameraConnectionState(camera).tone === "live").length,
    [cameras],
  )

  useEffect(() => {
    if (!expanded || onClose === undefined) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [expanded, onClose])

  const handlePanelKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.currentTarget !== event.target) {
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      event.stopPropagation()
    }
  }, [])

  const handleBackdropKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (event.currentTarget !== event.target || onClose === undefined) {
        return
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        onClose()
      }
    },
    [onClose],
  )

  const panel = (
    <section
      id="cop-carla-cctv-panel"
      className={`cop-panel cop-mobile-live${expanded ? " cop-cctv-window" : ""}`}
      aria-labelledby="cop-carla-cctv-title"
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded ? true : undefined}
      tabIndex={expanded ? 0 : undefined}
      onClick={expanded ? (event) => event.stopPropagation() : undefined}
      onKeyDown={expanded ? handlePanelKeyDown : undefined}
    >
      <div className="cop-panel-head">
        <h2 id="cop-carla-cctv-title">CARLA SIM CCTV</h2>
        <div className="cop-panel-head-actions">
          <MonitorPlay size={15} aria-hidden="true" />
          {expanded && onClose !== undefined && (
            <button
              type="button"
              className="cop-icon-btn"
              aria-label="CCTV 창 닫기"
              onClick={onClose}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
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
              {...(onDetectionServerConnectionChange !== undefined
                ? { onDetectionServerConnectionChange }
                : {})}
              {...(onDetectionFrameChange !== undefined ? { onDetectionFrameChange } : {})}
            />
          ))}
        </div>
      )}
    </section>
  )

  if (!expanded) {
    return panel
  }

  return (
    <div
      className="cop-cctv-window-backdrop"
      role={onClose === undefined ? undefined : "button"}
      tabIndex={onClose === undefined ? undefined : 0}
      aria-label={onClose === undefined ? undefined : "CCTV 창 닫기"}
      onClick={onClose}
      onKeyDown={onClose === undefined ? undefined : handleBackdropKeyDown}
    >
      {panel}
    </div>
  )
})

type CarlaCctvCardProps = {
  readonly record: DynamicCameraRecord
  readonly selected: boolean
  readonly onSelectCamera: (camera: DynamicCameraRecord) => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
  readonly onDetectionServerConnectionChange?: CarlaDetectionServerConnectionHandler
  readonly onDetectionFrameChange?: CarlaDetectionFrameChangeHandler
}

type CarlaCctvDetectionOverlayProps = {
  readonly frame: Pick<CarlaCameraDetectionFrame, "width" | "height" | "objects"> | null
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
  onDetectionServerConnectionChange,
  onDetectionFrameChange,
}: CarlaCctvCardProps): ReactElement {
  const connection = cameraConnectionState(record)
  const hasFrame = record.latestFrameDataUrl !== null && record.latestFrameDataUrl !== undefined
  const webrtc = useCarlaWebrtcVideo(record.id, hasFrame)
  const webrtcLive = webrtc.state === "live"
  const [detectionFrame, setDetectionFrame] = useState<CarlaCameraDetectionFrame | null>(null)
  const [detectionServerConnection, setDetectionServerConnection] =
    useState<DetrServerConnection>("disabled")
  const updateDetectionServerConnection = useCallback(
    (connection: DetrServerConnection): void => {
      setDetectionServerConnection(connection)
      onDetectionServerConnectionChange?.(record.id, connection)
    },
    [onDetectionServerConnectionChange, record.id],
  )
  const updateDetections = useCallback(
    (frame: CarlaCameraDetectionFrame): void => {
      const next = frame.objects.length === 0 ? null : frame
      setDetectionFrame(next)
      onDetectionFrameChange?.(record.id, next)
      updateDetectionServerConnection(frame.serverConnection)
    },
    [onDetectionFrameChange, record.id, updateDetectionServerConnection],
  )
  const selectCamera = useCallback((): void => {
    onSelectCamera(record)
  }, [onSelectCamera, record])

  useEffect(() => {
    if (!hasFrame) {
      setDetectionFrame(null)
      onDetectionFrameChange?.(record.id, null)
    }
    if (!hasFrame && detectionServerConnection !== "disabled") {
      updateDetectionServerConnection("disabled")
    }
  }, [
    detectionServerConnection,
    hasFrame,
    onDetectionFrameChange,
    record.id,
    updateDetectionServerConnection,
  ])

  useCarlaVideoDetection(
    record.id,
    record.label,
    webrtc.videoRef,
    webrtcLive,
    onVisionEvidence,
    updateDetectionServerConnection,
    updateDetections,
  )
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
