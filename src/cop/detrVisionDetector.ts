import { z } from "zod"
import type { DetrServerConnection } from "./serverDetectionClient"
import type { VisionPipelineRequest } from "./visionPipelineClient"

const ON_DEVICE_DETR_FALLBACK_MODULE = "./onDeviceDetrFallback.ts"

const DetrBoxSchema = z
  .object({
    xmin: z.number(),
    ymin: z.number(),
    xmax: z.number(),
    ymax: z.number(),
  })
  .strict()
  .readonly()

export const DetrDetectionSchema = z
  .object({
    label: z.string().min(1),
    score: z.number().min(0).max(1),
    box: DetrBoxSchema,
  })
  .strict()
  .readonly()

export const DetrDetectionArraySchema = z.array(DetrDetectionSchema).readonly()

export type DetrDetection = Readonly<z.infer<typeof DetrDetectionSchema>>
export type VisionFrameObject = VisionPipelineRequest["frames"][number]["objects"][number]
export type DetrDetectionSource = "server" | "on-device" | "skipped"
export type DetrDetectionResult = {
  readonly objects: readonly VisionFrameObject[]
  readonly serverConnection: DetrServerConnection
  readonly source: DetrDetectionSource
}
export type DetrEventSuppressionReason = "track_already_promoted" | "camera_class_cooldown"
export type DetrEventPromotionMetadata = {
  readonly cameraId: string
  readonly cooldownKey: string
  readonly cooldownMs: number
  readonly detectionClass: string
  readonly promotedAtMs: number
  readonly trackId: string | null
  readonly trackingKey: string | null
}
export type DetrEventEvidenceFields = {
  readonly cooldownKey: string
  readonly detectionClass: string
  readonly promotedAtMs: number
  readonly trackId?: string
}
export type DetrEventPromotionDecision =
  | {
      readonly shouldPromote: true
      readonly metadata: DetrEventPromotionMetadata
    }
  | {
      readonly shouldPromote: false
      readonly reason: DetrEventSuppressionReason
      readonly remainingCooldownMs: number
      readonly metadata: DetrEventPromotionMetadata
    }
export type DetrEventPromotionInput = {
  readonly cameraId: string
  readonly detectionClass: string
  readonly nowMs: number
  readonly trackId: string | null
}
export type DetrEventPromotionGate = {
  readonly shouldPromote: (input: DetrEventPromotionInput) => DetrEventPromotionDecision
  readonly recordPromotion: (metadata: DetrEventPromotionMetadata) => void
}
type DetrEventPromotionGateOptions = {
  readonly cameraClassCooldownMs?: number
}

export const DETR_CAMERA_CLASS_COOLDOWN_MS = 30_000

type NormalizeFrame = {
  readonly frameWidth: number
  readonly frameHeight: number
}

type DetectFrameInput = NormalizeFrame & {
  readonly source: string
}

type OnDeviceDetrFallbackModule = typeof import("./onDeviceDetrFallback")

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const sanitizeLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "object"

export const normalizeDetrDetectionClass = (label: string): string => sanitizeLabel(label)

const detrCooldownKey = (cameraId: string, detectionClass: string): string =>
  `${cameraId}:${detectionClass}`

const detrTrackingKey = (
  cameraId: string,
  detectionClass: string,
  trackId: string | null,
): string | null => (trackId === null ? null : `${cameraId}:${detectionClass}:${trackId}`)

export const createDetrEventPromotionGate = (
  options: DetrEventPromotionGateOptions = {},
): DetrEventPromotionGate => {
  const cooldownMs = options.cameraClassCooldownMs ?? DETR_CAMERA_CLASS_COOLDOWN_MS
  const promotedTrackingKeys = new Set<string>()
  const lastPromotedByCooldownKey = new Map<string, number>()

  const metadataFor = (input: DetrEventPromotionInput): DetrEventPromotionMetadata => {
    const detectionClass = normalizeDetrDetectionClass(input.detectionClass)
    return {
      cameraId: input.cameraId,
      cooldownKey: detrCooldownKey(input.cameraId, detectionClass),
      cooldownMs,
      detectionClass,
      promotedAtMs: input.nowMs,
      trackId: input.trackId,
      trackingKey: detrTrackingKey(input.cameraId, detectionClass, input.trackId),
    }
  }

  return {
    shouldPromote: (input) => {
      const metadata = metadataFor(input)
      if (metadata.trackingKey !== null && promotedTrackingKeys.has(metadata.trackingKey)) {
        return {
          shouldPromote: false,
          reason: "track_already_promoted",
          remainingCooldownMs: 0,
          metadata,
        }
      }
      const lastPromotedAt = lastPromotedByCooldownKey.get(metadata.cooldownKey)
      if (lastPromotedAt !== undefined) {
        const elapsedMs = input.nowMs - lastPromotedAt
        if (elapsedMs < cooldownMs) {
          return {
            shouldPromote: false,
            reason: "camera_class_cooldown",
            remainingCooldownMs: cooldownMs - elapsedMs,
            metadata,
          }
        }
      }
      return { shouldPromote: true, metadata }
    },
    recordPromotion: (metadata) => {
      if (metadata.trackingKey !== null) {
        promotedTrackingKeys.add(metadata.trackingKey)
      }
      lastPromotedByCooldownKey.set(metadata.cooldownKey, metadata.promotedAtMs)
    },
  }
}

export const detrEventEvidenceFields = (
  metadata: DetrEventPromotionMetadata,
): DetrEventEvidenceFields => ({
  cooldownKey: metadata.cooldownKey,
  detectionClass: metadata.detectionClass,
  promotedAtMs: metadata.promotedAtMs,
  ...(metadata.trackId === null ? {} : { trackId: metadata.trackId }),
})

const estimateDistanceMeters = (bboxHeight: number, frameHeight: number): number => {
  const ratio = bboxHeight / frameHeight
  if (ratio <= 0) {
    return 120
  }
  return clamp(Math.round((1 / ratio) * 7.5), 3, 120)
}

export const normalizeDetrDetections = (
  detections: readonly DetrDetection[],
  frame: NormalizeFrame,
): readonly VisionFrameObject[] =>
  detections.map((detection, index) => {
    const x = clamp(Math.round(detection.box.xmin), 0, frame.frameWidth)
    const y = clamp(Math.round(detection.box.ymin), 0, frame.frameHeight)
    const xmax = clamp(Math.round(detection.box.xmax), x, frame.frameWidth)
    const ymax = clamp(Math.round(detection.box.ymax), y, frame.frameHeight)
    const width = Math.max(1, xmax - x)
    const height = Math.max(1, ymax - y)
    return {
      objectId: `detr-${sanitizeLabel(detection.label)}-${String(index + 1).padStart(3, "0")}`,
      label: detection.label,
      confidence: Number(detection.score.toFixed(3)),
      distanceMeters: estimateDistanceMeters(height, frame.frameHeight),
      bbox: { x, y, width, height },
    }
  })

const loadOnDeviceDetrFallback = async (): Promise<OnDeviceDetrFallbackModule> =>
  import(/* @vite-ignore */ ON_DEVICE_DETR_FALLBACK_MODULE)

const runOptInOnDeviceDetr = async (
  source: string,
  frame: NormalizeFrame,
  serverConnection: DetrServerConnection,
): Promise<DetrDetectionResult> => {
  const { runFallbackDetrPipeline } = await loadOnDeviceDetrFallback()
  const detections = await runFallbackDetrPipeline(source)
  return {
    objects: normalizeDetrDetections(detections, frame),
    serverConnection,
    source: "on-device",
  }
}

export const detectFrameObjectsWithDetr = async ({
  source,
  frameWidth,
  frameHeight,
}: DetectFrameInput): Promise<DetrDetectionResult> => {
  const frame = { frameWidth, frameHeight }
  const {
    DETR_ONDEVICE_FALLBACK_ENABLED,
    DETR_SERVER_CONNECTION,
    DETR_SERVER_DETECTION_ENABLED,
    detectFrameObjectsWithServerDetr,
  } = await import("./serverDetectionClient")

  if (DETR_SERVER_DETECTION_ENABLED) {
    try {
      return {
        objects: await detectFrameObjectsWithServerDetr({ source, frameWidth, frameHeight }),
        serverConnection: DETR_SERVER_CONNECTION.connected,
        source: "server",
      }
    } catch (error: unknown) {
      if (!(error instanceof Error)) {
        throw error
      }
      if (DETR_ONDEVICE_FALLBACK_ENABLED) {
        return runOptInOnDeviceDetr(source, frame, DETR_SERVER_CONNECTION.disconnected)
      }
      return {
        objects: [],
        serverConnection: DETR_SERVER_CONNECTION.disconnected,
        source: "skipped",
      }
    }
  }

  if (DETR_ONDEVICE_FALLBACK_ENABLED) {
    return runOptInOnDeviceDetr(source, frame, DETR_SERVER_CONNECTION.disabled)
  }

  return {
    objects: [],
    serverConnection: DETR_SERVER_CONNECTION.disabled,
    source: "skipped",
  }
}
