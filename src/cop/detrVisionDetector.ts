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
