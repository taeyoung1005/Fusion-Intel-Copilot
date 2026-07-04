import type { IncomingMessage, ServerResponse } from "node:http"
import { performance } from "node:perf_hooks"
import { z } from "zod"
import type { ActivityEventInput } from "../src/activityEvents"
import { emitActivityEvent } from "./activityStream"
import { type VisionSemanticEvent, buildSemanticEvents } from "./visionSemantics"

const VisionBoxSchema = z
  .object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict()
  .readonly()

const FrameObjectSchema = z
  .object({
    objectId: z.string().min(1).optional(),
    label: z.string().min(1),
    confidence: z.number().min(0).max(1),
    distanceM: z.number().positive().optional(),
    distanceMeters: z.number().positive().optional(),
    bbox: VisionBoxSchema,
  })
  .strict()
  .readonly()

const VisionFrameSchema = z
  .object({
    frameId: z.string().min(1),
    timestampMs: z.number().min(0),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    objects: z.array(FrameObjectSchema).readonly(),
  })
  .strict()
  .readonly()

export const VisionPipelineRequestSchema = z
  .object({
    cameraId: z.string().min(1),
    incidentId: z.string().min(1).optional(),
    sequenceId: z.string().min(1).optional(),
    capturedAt: z.string().min(1).optional(),
    providerHint: z.string().min(1).optional(),
    frames: z.array(VisionFrameSchema).min(1).readonly(),
  })
  .strict()
  .readonly()

export type VisionPipelineRequest = Readonly<z.infer<typeof VisionPipelineRequestSchema>>

export type VisionDetection = {
  readonly id: string
  readonly frameId: string
  readonly label: string
  readonly confidence: number
  readonly distanceMeters: number | null
  readonly bbox: z.infer<typeof VisionBoxSchema>
}

type VisionTrack = {
  readonly id: string
  readonly label: string
  readonly status: "candidate" | "active_track"
  readonly detectionIds: readonly string[]
  readonly distanceTrend: "approaching" | "receding" | "stable" | "unknown"
  readonly nearestDistanceMeters: number | null
}

export type VisionPipelineResponse = {
  readonly provider: "local-frame-cv" | "transformers-detr"
  readonly sequenceId: string
  readonly cameraId: string
  readonly detections: readonly VisionDetection[]
  readonly tracks: readonly VisionTrack[]
  readonly semanticEvents: readonly VisionSemanticEvent[]
  readonly visualAnalysisAgent: {
    readonly agentId: "agent-visual-analysis"
    readonly status: "idle" | "triggered"
    readonly summary: string
  }
  readonly situationAnalysisAgent: {
    readonly agentId: "agent-situation-analysis"
    readonly riskLevel: "normal" | "watch" | "review"
    readonly summary: string
  }
  readonly evidenceBundle: {
    readonly codexReady: boolean
    readonly recommendedAction: string
    readonly citations: readonly string[]
  }
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
} as const

const maxBodyBytes = 128 * 1024

type BodyReadResult =
  | { readonly kind: "ok"; readonly body: string }
  | { readonly kind: "too-large" }

type VisionActivity = {
  readonly stage: string
  readonly level?: ActivityEventInput["level"]
  readonly message: string
  readonly detail?: Readonly<Record<string, unknown>>
}

const durationMs = (startedAt: number): number =>
  Math.round((performance.now() - startedAt) * 100) / 100

const emitVisionActivity = (activity: VisionActivity): void => {
  emitActivityEvent({
    source: "vision",
    stage: activity.stage,
    level: activity.level ?? "info",
    message: activity.message,
    ...(activity.detail === undefined ? {} : { detail: activity.detail }),
  })
}

const collectBody = (request: IncomingMessage): Promise<BodyReadResult> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let tooLarge = false
    request.on("data", (chunk: Buffer | string) => {
      if (tooLarge) {
        return
      }
      const buffer = Buffer.from(chunk)
      totalBytes += buffer.byteLength
      if (totalBytes > maxBodyBytes) {
        tooLarge = true
        chunks.length = 0
        resolve({ kind: "too-large" })
        return
      }
      chunks.push(buffer)
    })
    request.on("end", () => {
      if (!tooLarge) {
        resolve({ kind: "ok", body: Buffer.concat(chunks).toString("utf8") })
      }
    })
    request.on("error", reject)
  })

const parseJsonBody = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

const distanceOf = (object: z.infer<typeof FrameObjectSchema>): number | null =>
  object.distanceMeters ?? object.distanceM ?? null

const buildDetections = (request: VisionPipelineRequest): readonly VisionDetection[] =>
  request.frames.flatMap((frame, frameIndex) =>
    frame.objects.map((object, objectIndex) => ({
      id: `det-${String(frameIndex + 1).padStart(3, "0")}-${String(objectIndex + 1).padStart(2, "0")}`,
      frameId: frame.frameId,
      label: object.label,
      confidence: object.confidence,
      distanceMeters: distanceOf(object),
      bbox: object.bbox,
    })),
  )

const trackStatus = (detections: readonly VisionDetection[]): VisionTrack["status"] =>
  detections.length >= 2 && detections.some((detection) => detection.label.includes("person"))
    ? "active_track"
    : "candidate"

const distanceTrend = (detections: readonly VisionDetection[]): VisionTrack["distanceTrend"] => {
  const distances = detections
    .map((detection) => detection.distanceMeters)
    .filter((distance): distance is number => distance !== null)
  const first = distances[0]
  const last = distances.at(-1)
  if (first === undefined || last === undefined || distances.length < 2) {
    return "unknown"
  }
  if (last < first - 3) {
    return "approaching"
  }
  if (last > first + 3) {
    return "receding"
  }
  return "stable"
}

const buildTracks = (detections: readonly VisionDetection[]): readonly VisionTrack[] => {
  if (detections.length === 0) {
    return []
  }
  const distances = detections
    .map((detection) => detection.distanceMeters)
    .filter((distance): distance is number => distance !== null)
  return [
    {
      id: "track-vision-001",
      label: detections[0]?.label ?? "object",
      status: trackStatus(detections),
      detectionIds: detections.map((detection) => detection.id),
      distanceTrend: distanceTrend(detections),
      nearestDistanceMeters: distances.length === 0 ? null : Math.min(...distances),
    },
  ]
}

export const runVisionPipeline = (request: VisionPipelineRequest): VisionPipelineResponse => {
  const detectStartedAt = performance.now()
  emitVisionActivity({
    stage: "detect:start",
    message: "비전 검출을 시작했습니다.",
    detail: { cameraId: request.cameraId, frameCount: request.frames.length },
  })
  const detections = buildDetections(request)
  emitVisionActivity({
    stage: "detect:end",
    message: "비전 검출을 완료했습니다.",
    detail: {
      cameraId: request.cameraId,
      durationMs: durationMs(detectStartedAt),
      detectionCount: detections.length,
    },
  })

  const classifyStartedAt = performance.now()
  emitVisionActivity({
    stage: "classify:start",
    message: "비전 분류를 시작했습니다.",
    detail: { cameraId: request.cameraId, detectionCount: detections.length },
  })
  const tracks = buildTracks(detections)
  const semanticEvents = buildSemanticEvents(request.frames)
  emitVisionActivity({
    stage: "classify:end",
    message: "비전 분류를 완료했습니다.",
    detail: {
      cameraId: request.cameraId,
      durationMs: durationMs(classifyStartedAt),
      detectionCount: detections.length,
      semanticEventCount: semanticEvents.length,
      trackCount: tracks.length,
    },
  })

  const decideStartedAt = performance.now()
  emitVisionActivity({
    stage: "decide:start",
    message: "비전 판단을 시작했습니다.",
    detail: { cameraId: request.cameraId, detectionCount: detections.length },
  })
  const activeTrack = tracks.find((track) => track.status === "active_track")
  const watch =
    activeTrack !== undefined &&
    activeTrack.distanceTrend === "approaching" &&
    (activeTrack.nearestDistanceMeters ?? Number.POSITIVE_INFINITY) <= 30
  const riskLevel: VisionPipelineResponse["situationAnalysisAgent"]["riskLevel"] = watch
    ? "watch"
    : activeTrack === undefined
      ? "normal"
      : "review"

  const response: VisionPipelineResponse = {
    provider: request.providerHint === "transformers-detr" ? "transformers-detr" : "local-frame-cv",
    sequenceId: request.sequenceId ?? request.incidentId ?? "vision-sequence",
    cameraId: request.cameraId,
    detections,
    tracks,
    semanticEvents,
    visualAnalysisAgent: {
      agentId: "agent-visual-analysis",
      status: detections.length > 0 ? "triggered" : "idle",
      summary: `${request.cameraId} 프레임 ${request.frames.length}개에서 탐지 ${detections.length}건, 시맨틱 ${semanticEvents.length}건을 생성했습니다.`,
    },
    situationAnalysisAgent: {
      agentId: "agent-situation-analysis",
      riskLevel,
      summary:
        riskLevel === "watch"
          ? "접근 추세, 이동 방향, 거리 변화가 확인되어 사람 검토 대기 상태로 묶었습니다."
          : "자동 결론 없이 증거를 보존합니다.",
    },
    evidenceBundle: {
      codexReady: true,
      recommendedAction:
        "Keep human review active and confirm with adjacent camera evidence before any response.",
      citations: [
        ...detections.map((detection) => `${detection.frameId}:${detection.id}`),
        ...semanticEvents.map((event) => `${event.frameIds.join("+")}:${event.id}`),
      ],
    },
  }
  emitVisionActivity({
    stage: "decide:end",
    level: riskLevel === "watch" ? "watch" : "info",
    message: "비전 판단을 완료했습니다.",
    detail: {
      cameraId: request.cameraId,
      citationCount: response.evidenceBundle.citations.length,
      detectionCount: detections.length,
      durationMs: durationMs(decideStartedAt),
      riskLevel,
    },
  })
  return response
}

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  payload: VisionPipelineResponse | { readonly error: string },
): void => {
  response.writeHead(statusCode, jsonHeaders)
  response.end(JSON.stringify(payload))
}

export const handleVisionPipelineRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const receiveStartedAt = performance.now()
  emitVisionActivity({
    stage: "receive:start",
    message: "비전 파이프라인 요청 수신을 시작했습니다.",
  })
  const result = await collectBody(request)
  if (result.kind === "too-large") {
    emitVisionActivity({
      stage: "receive:end",
      level: "warn",
      message: "비전 파이프라인 요청이 제한 크기를 초과했습니다.",
      detail: { detectionCount: 0, durationMs: durationMs(receiveStartedAt) },
    })
    writeJson(response, 413, { error: "비전 파이프라인 요청이 너무 큽니다." })
    return
  }
  emitVisionActivity({
    stage: "receive:end",
    message: "비전 파이프라인 요청 수신을 완료했습니다.",
    detail: {
      bodyBytes: Buffer.byteLength(result.body),
      detectionCount: 0,
      durationMs: durationMs(receiveStartedAt),
    },
  })

  const decodeStartedAt = performance.now()
  emitVisionActivity({
    stage: "decode:start",
    message: "비전 파이프라인 요청 디코드를 시작했습니다.",
  })
  const parsedBody = parseJsonBody(result.body)
  const parsed = VisionPipelineRequestSchema.safeParse(parsedBody)
  if (!parsed.success) {
    emitVisionActivity({
      stage: "decode:end",
      level: "warn",
      message: "비전 파이프라인 요청 디코드에 실패했습니다.",
      detail: { detectionCount: 0, durationMs: durationMs(decodeStartedAt), valid: false },
    })
    writeJson(response, 400, { error: "비전 파이프라인 요청에는 하나 이상의 프레임이 필요합니다." })
    return
  }
  const decodedObjectCount = parsed.data.frames.reduce(
    (sum, frame) => sum + frame.objects.length,
    0,
  )
  emitVisionActivity({
    stage: "decode:end",
    message: "비전 파이프라인 요청 디코드를 완료했습니다.",
    detail: {
      detectionCount: decodedObjectCount,
      durationMs: durationMs(decodeStartedAt),
      frameCount: parsed.data.frames.length,
      objectCount: decodedObjectCount,
      valid: true,
    },
  })
  writeJson(response, 200, runVisionPipeline(parsed.data))
}
