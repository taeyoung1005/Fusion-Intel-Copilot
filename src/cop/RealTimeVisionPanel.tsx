import { Camera, Play, Square, Upload } from "lucide-react"
import { type ChangeEvent, type ReactElement, useEffect, useRef, useState } from "react"
import { VisionPipelineResult } from "./VisionPipelineResult"
import type { EvidenceClip } from "./copData"
import { detectFrameObjectsWithDetr } from "./detrVisionDetector"
import { riskToTone } from "./evidenceData"
import {
  type VisionPipelineRequest,
  type VisionPipelineResponse,
  requestVisionPipeline,
} from "./visionPipelineClient"

type RealtimeState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly message: string }
  | {
      readonly kind: "running"
      readonly response?: VisionPipelineResponse
      readonly frameCount: number
    }
  | { readonly kind: "failure"; readonly message: string }

const FRAME_WIDTH = 640
const FRAME_HEIGHT = 360
const INFERENCE_INTERVAL_MS = 1_200
const SEMANTIC_FRAME_HISTORY_LIMIT = 4

type VisionPipelineFrame = VisionPipelineRequest["frames"][number]

const EVIDENCE_EVERY_FRAMES = 3

const nowClock = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export function RealTimeVisionPanel({
  cameraLabel,
  onVisionEvidence,
}: {
  readonly cameraLabel: string
  readonly onVisionEvidence: (clip: EvidenceClip) => void
}): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const inFlightRef = useRef(false)
  const frameIndexRef = useRef(0)
  const lastEvidenceFrameRef = useRef(-EVIDENCE_EVERY_FRAMES)
  const frameHistoryRef = useRef<readonly VisionPipelineFrame[]>([])
  const objectUrlRef = useRef<string | undefined>(undefined)
  const [state, setState] = useState<RealtimeState>({ kind: "idle" })

  useEffect(() => () => stopRealtime(), [])

  const stopCameraStream = (): void => {
    const video = videoRef.current
    if (video?.srcObject instanceof MediaStream) {
      for (const track of video.srcObject.getTracks()) {
        track.stop()
      }
      video.srcObject = null
    }
  }

  const revokeObjectUrl = (): void => {
    if (objectUrlRef.current !== undefined) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = undefined
    }
  }

  const stopRealtime = (): void => {
    if (timerRef.current !== undefined) {
      window.clearInterval(timerRef.current)
      timerRef.current = undefined
    }
    stopCameraStream()
    inFlightRef.current = false
    frameHistoryRef.current = []
  }

  const onVideoFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (file === undefined) {
      return
    }
    stopRealtime()
    revokeObjectUrl()
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    const video = videoRef.current
    if (video !== null) {
      video.srcObject = null
      video.src = url
      void video.play()
    }
    setState({ kind: "idle" })
  }

  const connectCamera = async (): Promise<void> => {
    try {
      stopRealtime()
      revokeObjectUrl()
      setState({ kind: "loading", message: "카메라 권한 요청 중" })
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      const video = videoRef.current
      if (video !== null) {
        video.srcObject = stream
        await video.play()
      }
      setState({ kind: "idle" })
    } catch (error) {
      if (error instanceof Error) {
        setState({ kind: "failure", message: error.message })
        return
      }
      throw error
    }
  }

  const drawFrame = (): string | undefined => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return undefined
    }
    canvas.width = FRAME_WIDTH
    canvas.height = FRAME_HEIGHT
    const context = canvas.getContext("2d")
    if (context === null) {
      return undefined
    }
    const video = videoRef.current
    if (video !== null && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      context.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
    } else {
      drawSyntheticFrame(context, frameIndexRef.current)
    }
    return canvas.toDataURL("image/jpeg", 0.78)
  }

  const inferOneFrame = async (): Promise<void> => {
    if (inFlightRef.current) {
      return
    }
    inFlightRef.current = true
    const frameIndex = frameIndexRef.current + 1
    frameIndexRef.current = frameIndex
    try {
      const source = drawFrame()
      if (source === undefined) {
        setState({ kind: "failure", message: "비디오 프레임을 캡처할 수 없습니다." })
        return
      }
      const objects = await detectFrameObjectsWithDetr({
        source,
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
      })
      if (objects.length === 0) {
        setState({ kind: "running", frameCount: frameIndex })
        return
      }
      const frame: VisionPipelineFrame = {
        frameId: `rt-frame-${String(frameIndex).padStart(3, "0")}`,
        timestampMs: Math.round(performance.now()),
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        objects,
      }
      const frames = [...frameHistoryRef.current, frame].slice(-SEMANTIC_FRAME_HISTORY_LIMIT)
      frameHistoryRef.current = frames
      const response = await requestVisionPipeline({
        cameraId: cameraLabel,
        incidentId: "inc-east",
        sequenceId: `rt-detr-${String(frameIndex).padStart(4, "0")}`,
        capturedAt: new Date().toISOString(),
        providerHint: "transformers-detr",
        frames,
      })
      setState({ kind: "running", response, frameCount: frameIndex })

      // Every real detection feeds the evidence strip with its captured frame,
      // throttled so a long run does not flood the strip.
      if (frameIndex - lastEvidenceFrameRef.current >= EVIDENCE_EVERY_FRAMES) {
        lastEvidenceFrameRef.current = frameIndex
        const topObject = objects[0]
        const semantic = response.semanticEvents?.at(0)
        const label =
          semantic !== undefined
            ? `${semantic.subjectLabel} ${semantic.action}`
            : `${topObject?.label ?? "object"} 탐지`
        onVisionEvidence({
          id: `ev-vision-${frameIndex}`,
          time: nowClock(),
          camera: cameraLabel,
          tone: riskToTone(response.situationAnalysisAgent.riskLevel),
          label,
          detail: `CONF ${Math.round((topObject?.confidence ?? 0) * 100)}%`,
          source: "vision",
          confidencePct: Math.round((topObject?.confidence ?? 0) * 100),
          frameDataUrl: source,
        })
      }
    } catch (error) {
      if (error instanceof Error) {
        setState({ kind: "failure", message: error.message })
        return
      }
      throw error
    } finally {
      inFlightRef.current = false
    }
  }

  const startRealtime = async (): Promise<void> => {
    stopRealtime()
    setState({ kind: "loading", message: "DETR 모델 로딩 및 첫 프레임 추론 중" })
    await inferOneFrame()
    timerRef.current = window.setInterval(() => {
      void inferOneFrame()
    }, INFERENCE_INTERVAL_MS)
  }

  return (
    <div className="cop-realtime">
      <div className="cop-realtime-controls">
        <label className="cop-upload">
          <Upload size={13} aria-hidden="true" />
          <span>영상 파일</span>
          <input type="file" accept="video/*" onChange={onVideoFile} />
        </label>
        <button
          type="button"
          className="cop-button secondary"
          onClick={() => {
            void connectCamera()
          }}
        >
          <Camera size={13} aria-hidden="true" />
          카메라 연결
        </button>
      </div>
      <div className="cop-realtime-media">
        <video ref={videoRef} muted loop playsInline aria-label="실시간 CCTV 영상 소스" />
        <canvas ref={canvasRef} aria-label="DETR 추론 프레임 캔버스" />
      </div>
      <div className="cop-realtime-actions">
        <button
          type="button"
          className="cop-button full"
          disabled={state.kind === "loading"}
          onClick={() => {
            void startRealtime()
          }}
        >
          <Play size={13} aria-hidden="true" />
          실시간 DETR 추론 시작
        </button>
        <button
          type="button"
          className="cop-icon-btn"
          aria-label="실시간 DETR 추론 중지"
          onClick={() => {
            stopRealtime()
            setState({ kind: "idle" })
          }}
        >
          <Square size={13} aria-hidden="true" />
        </button>
      </div>
      <RealtimeStatus state={state} cameraLabel={cameraLabel} />
    </div>
  )
}

function RealtimeStatus({
  state,
  cameraLabel,
}: {
  readonly state: RealtimeState
  readonly cameraLabel: string
}): ReactElement {
  if (state.kind === "loading") {
    return <p className="cop-vision-safe">{state.message}</p>
  }
  if (state.kind === "failure") {
    return <p className="cop-vision-error">{state.message}</p>
  }
  if (state.kind === "running") {
    return (
      <div className="cop-realtime-status">
        <strong>실시간 DETR 가동</strong>
        <span>프레임 {state.frameCount}</span>
        {state.response === undefined ? (
          <p>현재 프레임에서는 에이전트를 깨울 탐지가 없습니다.</p>
        ) : (
          <VisionPipelineResult response={state.response} cameraLabel={cameraLabel} />
        )}
      </div>
    )
  }
  return (
    <p className="cop-vision-copy">
      영상 파일 또는 카메라 입력을 연결한 뒤 실시간 추론을 시작할 수 있습니다.
    </p>
  )
}

function drawSyntheticFrame(context: CanvasRenderingContext2D, frameIndex: number): void {
  const styles = getComputedStyle(document.documentElement)
  context.fillStyle = styles.getPropertyValue("--surface-inset").trim()
  context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
  context.strokeStyle = styles.getPropertyValue("--map-grid-line").trim()
  for (let x = 0; x <= FRAME_WIDTH; x += 64) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, FRAME_HEIGHT)
    context.stroke()
  }
  const personX = 300 + ((frameIndex * 12) % 90)
  context.fillStyle = styles.getPropertyValue("--text-secondary").trim()
  context.fillRect(personX, 98, 42, 142)
  context.fillStyle = styles.getPropertyValue("--alert-watch").trim()
  context.fillRect(personX + 8, 70, 26, 26)
}
