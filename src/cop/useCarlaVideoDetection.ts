import { type RefObject, useEffect, useRef } from "react"
import { describeAttributes, extractPersonAttributesSafely } from "./attributeClassifier"
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

let carlaVideoDetrDisabled = false
let carlaVideoDetrDisableWarningShown = false

const nowClock = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

const captureVideoFrame = (video: HTMLVideoElement): string | null => {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
    return null
  }
  const canvas = document.createElement("canvas")
  canvas.width = FRAME_WIDTH
  canvas.height = FRAME_HEIGHT
  const context = canvas.getContext("2d")
  if (context === null) {
    return null
  }
  context.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
  return canvas.toDataURL("image/jpeg", 0.78)
}

const isDetrMemoryFailure = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }
  return /bad_alloc|can't create a session|failed to call ortrun/i.test(error.message)
}

export const useCarlaVideoDetection = (
  cameraId: string,
  cameraLabel: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onVisionEvidence: (clip: EvidenceClip) => void,
): void => {
  const onVisionEvidenceRef = useRef(onVisionEvidence)
  onVisionEvidenceRef.current = onVisionEvidence

  const inFlightRef = useRef(false)
  const frameIndexRef = useRef(0)
  const lastEvidenceFrameRef = useRef(-EVIDENCE_EVERY_FRAMES)
  const frameHistoryRef = useRef<readonly VisionPipelineFrame[]>([])

  useEffect(() => {
    if (!enabled || carlaVideoDetrDisabled) {
      return
    }

    const inferCurrentVideoFrame = async (): Promise<void> => {
      if (inFlightRef.current || carlaVideoDetrDisabled) {
        return
      }
      const video = videoRef.current
      if (video === null) {
        return
      }
      const source = captureVideoFrame(video)
      if (source === null) {
        return
      }
      inFlightRef.current = true
      const frameIndex = frameIndexRef.current + 1
      frameIndexRef.current = frameIndex

      try {
        const objects = await detectFrameObjectsWithDetr({
          source,
          frameWidth: FRAME_WIDTH,
          frameHeight: FRAME_HEIGHT,
        })
        if (objects.length === 0) {
          return
        }
        const frame: VisionPipelineFrame = {
          frameId: `carla-video-${cameraId}-${String(frameIndex).padStart(3, "0")}`,
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
          sequenceId: `carla-video-detr-${cameraId}-${String(frameIndex).padStart(4, "0")}`,
          capturedAt: new Date().toISOString(),
          providerHint: "transformers-detr",
          frames,
        })

        if (frameIndex - lastEvidenceFrameRef.current >= EVIDENCE_EVERY_FRAMES) {
          lastEvidenceFrameRef.current = frameIndex
          const topObject = objects[0]
          const personObject = objects.find((object) =>
            object.label.toLowerCase().includes("person"),
          )
          const semantic = response.semanticEvents?.at(0)
          const label =
            semantic !== undefined
              ? `${semantic.subjectLabel} ${semantic.action}`
              : `${topObject?.label ?? "object"} 탐지`

          const attributes =
            personObject !== undefined
              ? await extractPersonAttributesSafely(source, personObject.bbox, isDetrMemoryFailure)
              : undefined
          const attributeSuffix =
            attributes !== undefined ? ` · ${describeAttributes(attributes)}` : ""

          onVisionEvidenceRef.current({
            id: `ev-carla-vision-${cameraId}-${frameIndex}`,
            time: nowClock(),
            camera: cameraId,
            tone: riskToTone(response.situationAnalysisAgent.riskLevel),
            label: `${cameraLabel} · ${label}${attributeSuffix}`,
            detail: `CONF ${Math.round((topObject?.confidence ?? 0) * 100)}%`,
            source: "vision",
            confidencePct: Math.round((topObject?.confidence ?? 0) * 100),
            frameDataUrl: source,
            ...(attributes !== undefined ? { attributes } : {}),
          })
        }
      } catch (error: unknown) {
        if (isDetrMemoryFailure(error)) {
          carlaVideoDetrDisabled = true
          if (!carlaVideoDetrDisableWarningShown) {
            carlaVideoDetrDisableWarningShown = true
            console.warn("CARLA WebRTC CCTV DETR 메모리 부족으로 자동 추론을 일시 중단했습니다.")
          }
          return
        }
        console.error("CARLA WebRTC CCTV DETR 추론 실패", error)
      } finally {
        inFlightRef.current = false
      }
    }

    const intervalId = window.setInterval(
      () => void inferCurrentVideoFrame(),
      DETECTION_INTERVAL_MS,
    )
    void inferCurrentVideoFrame()
    return () => window.clearInterval(intervalId)
  }, [cameraId, cameraLabel, enabled, videoRef])
}
