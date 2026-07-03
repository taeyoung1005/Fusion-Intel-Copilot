import { useEffect, useRef } from "react"
import type { EvidenceClip } from "./copData"
import { detectFrameObjectsWithDetr } from "./detrVisionDetector"
import { riskToTone } from "./evidenceData"
import {
  type VisionPipelineRequest,
  type VisionPipelineResponse,
  requestVisionPipeline,
} from "./visionPipelineClient"

const FRAME_WIDTH = 640
const FRAME_HEIGHT = 360
const SEMANTIC_FRAME_HISTORY_LIMIT = 4
const EVIDENCE_EVERY_FRAMES = 3
const DETECTION_INTERVAL_MS = 1_200

type VisionPipelineFrame = VisionPipelineRequest["frames"][number]

let carlaDetrDisabled = false
let carlaDetrDisableWarningShown = false

const nowClock = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

const normalizeToFixedFrame = (dataUrl: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = FRAME_WIDTH
      canvas.height = FRAME_HEIGHT
      const context = canvas.getContext("2d")
      if (context === null) {
        reject(new Error("캔버스 컨텍스트를 생성할 수 없습니다."))
        return
      }
      context.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
      resolve(canvas.toDataURL("image/jpeg", 0.78))
    }
    image.onerror = () => reject(new Error("CARLA 카메라 프레임을 디코딩할 수 없습니다."))
    image.src = dataUrl
  })

const isDetrMemoryFailure = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }
  return /bad_alloc|can't create a session|failed to call ortrun/i.test(error.message)
}

export const useCarlaCameraDetection = (
  cameraId: string,
  cameraLabel: string,
  latestFrameDataUrl: string | null,
  lastFrameAt: string | null,
  onVisionEvidence: (clip: EvidenceClip) => void,
): void => {
  const onVisionEvidenceRef = useRef(onVisionEvidence)
  onVisionEvidenceRef.current = onVisionEvidence

  const inFlightRef = useRef(false)
  const frameIndexRef = useRef(0)
  const lastInferenceStartedAtRef = useRef(-DETECTION_INTERVAL_MS)
  const lastEvidenceFrameRef = useRef(-EVIDENCE_EVERY_FRAMES)
  const frameHistoryRef = useRef<readonly VisionPipelineFrame[]>([])

  useEffect(() => {
    if (
      carlaDetrDisabled ||
      lastFrameAt === null ||
      latestFrameDataUrl === null ||
      inFlightRef.current
    ) {
      return
    }
    const startedAt = performance.now()
    if (startedAt - lastInferenceStartedAtRef.current < DETECTION_INTERVAL_MS) {
      return
    }
    lastInferenceStartedAtRef.current = startedAt
    inFlightRef.current = true
    const frameIndex = frameIndexRef.current + 1
    frameIndexRef.current = frameIndex

    const inferOneFrame = async (): Promise<void> => {
      try {
        const source = await normalizeToFixedFrame(latestFrameDataUrl)
        const objects = await detectFrameObjectsWithDetr({
          source,
          frameWidth: FRAME_WIDTH,
          frameHeight: FRAME_HEIGHT,
        })
        if (objects.length === 0) {
          return
        }
        const frame: VisionPipelineFrame = {
          frameId: `carla-frame-${cameraId}-${String(frameIndex).padStart(3, "0")}`,
          timestampMs: Math.round(performance.now()),
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          objects,
        }
        const frames = [...frameHistoryRef.current, frame].slice(-SEMANTIC_FRAME_HISTORY_LIMIT)
        frameHistoryRef.current = frames
        const response: VisionPipelineResponse = await requestVisionPipeline({
          cameraId,
          incidentId: `carla-${cameraId}`,
          sequenceId: `carla-detr-${cameraId}-${String(frameIndex).padStart(4, "0")}`,
          capturedAt: new Date().toISOString(),
          providerHint: "transformers-detr",
          frames,
        })

        if (frameIndex - lastEvidenceFrameRef.current >= EVIDENCE_EVERY_FRAMES) {
          lastEvidenceFrameRef.current = frameIndex
          const topObject = objects[0]
          const semantic = response.semanticEvents?.at(0)
          const label =
            semantic !== undefined
              ? `${semantic.subjectLabel} ${semantic.action}`
              : `${topObject?.label ?? "object"} 탐지`
          onVisionEvidenceRef.current({
            id: `ev-carla-vision-${cameraId}-${frameIndex}`,
            time: nowClock(),
            camera: cameraId,
            tone: riskToTone(response.situationAnalysisAgent.riskLevel),
            label: `${cameraLabel} · ${label}`,
            detail: `CONF ${Math.round((topObject?.confidence ?? 0) * 100)}%`,
            source: "vision",
            confidencePct: Math.round((topObject?.confidence ?? 0) * 100),
            frameDataUrl: source,
          })
        }
      } catch (error: unknown) {
        if (isDetrMemoryFailure(error)) {
          carlaDetrDisabled = true
          if (!carlaDetrDisableWarningShown) {
            carlaDetrDisableWarningShown = true
            console.warn(
              "CARLA 시뮬레이션 CCTV DETR 메모리 부족으로 자동 추론을 일시 중단했습니다.",
            )
          }
          return
        }
        console.error("CARLA 시뮬레이션 CCTV DETR 추론 실패", error)
      } finally {
        inFlightRef.current = false
      }
    }

    void inferOneFrame()
  }, [cameraId, cameraLabel, latestFrameDataUrl, lastFrameAt])
}
