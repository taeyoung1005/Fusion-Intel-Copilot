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
const INFERENCE_INTERVAL_MS = 1_200
const SEMANTIC_FRAME_HISTORY_LIMIT = 4
const EVIDENCE_EVERY_FRAMES = 3

type VisionPipelineFrame = VisionPipelineRequest["frames"][number]

const nowClock = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/**
 * Runs the same DETR inference loop as RealTimeVisionPanel, headlessly, against
 * a phone's live WebRTC stream. Only emits evidence when DETR actually detects
 * something — a heartbeat frame with nothing in it produces no evidence.
 */
export const useMobileCameraDetection = (
  cameraId: string,
  cameraLabel: string,
  stream: MediaStream | null,
  onVisionEvidence: (clip: EvidenceClip) => void,
): void => {
  const onVisionEvidenceRef = useRef(onVisionEvidence)
  onVisionEvidenceRef.current = onVisionEvidence

  useEffect(() => {
    if (stream === null) {
      return
    }

    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    void video.play()

    const canvas = document.createElement("canvas")
    canvas.width = FRAME_WIDTH
    canvas.height = FRAME_HEIGHT
    const context = canvas.getContext("2d")

    let inFlight = false
    let frameIndex = 0
    let lastEvidenceFrame = -EVIDENCE_EVERY_FRAMES
    let frameHistory: readonly VisionPipelineFrame[] = []

    const inferOneFrame = async (): Promise<void> => {
      if (inFlight || context === null || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return
      }
      inFlight = true
      frameIndex += 1
      const currentFrameIndex = frameIndex
      try {
        context.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
        const source = canvas.toDataURL("image/jpeg", 0.78)
        const objects = await detectFrameObjectsWithDetr({
          source,
          frameWidth: FRAME_WIDTH,
          frameHeight: FRAME_HEIGHT,
        })
        if (objects.length === 0) {
          return
        }
        const frame: VisionPipelineFrame = {
          frameId: `mobile-frame-${cameraId}-${String(currentFrameIndex).padStart(3, "0")}`,
          timestampMs: Math.round(performance.now()),
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          objects,
        }
        frameHistory = [...frameHistory, frame].slice(-SEMANTIC_FRAME_HISTORY_LIMIT)
        const response: VisionPipelineResponse = await requestVisionPipeline({
          cameraId,
          incidentId: `mobile-${cameraId}`,
          sequenceId: `mobile-detr-${cameraId}-${String(currentFrameIndex).padStart(4, "0")}`,
          capturedAt: new Date().toISOString(),
          providerHint: "transformers-detr",
          frames: frameHistory,
        })

        if (currentFrameIndex - lastEvidenceFrame >= EVIDENCE_EVERY_FRAMES) {
          lastEvidenceFrame = currentFrameIndex
          const topObject = objects[0]
          const semantic = response.semanticEvents?.at(0)
          const label =
            semantic !== undefined
              ? `${semantic.subjectLabel} ${semantic.action}`
              : `${topObject?.label ?? "object"} 탐지`
          onVisionEvidenceRef.current({
            id: `ev-mobile-vision-${cameraId}-${currentFrameIndex}`,
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
        console.error("모바일 CCTV DETR 추론 실패", error)
      } finally {
        inFlight = false
      }
    }

    const intervalId = window.setInterval(() => void inferOneFrame(), INFERENCE_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
      video.pause()
      video.srcObject = null
    }
  }, [stream, cameraId, cameraLabel])
}
