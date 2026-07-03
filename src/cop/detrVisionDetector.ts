import { z } from "zod"
import type { VisionPipelineRequest } from "./visionPipelineClient"

const DETR_MODEL_ID = "Xenova/detr-resnet-50"
const DETR_THRESHOLD = 0.5

const DetrBoxSchema = z
  .object({
    xmin: z.number(),
    ymin: z.number(),
    xmax: z.number(),
    ymax: z.number(),
  })
  .strict()
  .readonly()

const DetrDetectionSchema = z
  .object({
    label: z.string().min(1),
    score: z.number().min(0).max(1),
    box: DetrBoxSchema,
  })
  .strict()
  .readonly()

const DetrDetectionArraySchema = z.array(DetrDetectionSchema).readonly()

export type DetrDetection = Readonly<z.infer<typeof DetrDetectionSchema>>
export type VisionFrameObject = VisionPipelineRequest["frames"][number]["objects"][number]

type NormalizeFrame = {
  readonly frameWidth: number
  readonly frameHeight: number
}

type DetectFrameInput = NormalizeFrame & {
  readonly source: string
}

const createDetrDetector = async () => {
  const { pipeline } = await import("@huggingface/transformers")
  return pipeline("object-detection", DETR_MODEL_ID)
}

let detrDetectorPromise: ReturnType<typeof createDetrDetector> | undefined

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

const testDetector = (): D4dTestDetrDetector | undefined => {
  if (typeof window === "undefined") {
    return undefined
  }
  return window.__D4D_TEST_DETR_DETECTOR__
}

const runDetrPipeline = async (source: string): Promise<readonly DetrDetection[]> => {
  detrDetectorPromise ??= createDetrDetector()
  const detector = await detrDetectorPromise
  const output = await detector(source, { threshold: DETR_THRESHOLD, percentage: false })
  return DetrDetectionArraySchema.parse(output)
}

export const detectFrameObjectsWithDetr = async ({
  source,
  frameWidth,
  frameHeight,
}: DetectFrameInput): Promise<readonly VisionFrameObject[]> => {
  const detector = testDetector()
  const detections =
    detector === undefined
      ? await runDetrPipeline(source)
      : DetrDetectionArraySchema.parse(await detector(source))
  return normalizeDetrDetections(detections, { frameWidth, frameHeight })
}
