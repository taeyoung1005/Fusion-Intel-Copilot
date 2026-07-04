import { type DetrDetection, DetrDetectionArraySchema } from "./detrVisionDetector"

const DETR_MODEL_ID = "Xenova/detr-resnet-50"
const DETR_THRESHOLD = 0.5
const TRANSFORMERS_MODULE = "@huggingface/transformers"

type DetrDetector = (
  source: string,
  options: { readonly threshold: number; readonly percentage: false },
) => Promise<unknown>

type TransformersPipeline = (task: "object-detection", modelId: string) => Promise<DetrDetector>

const createDetrDetector = async (): Promise<DetrDetector> => {
  const { pipeline }: { readonly pipeline: TransformersPipeline } = await import(
    /* @vite-ignore */ TRANSFORMERS_MODULE
  )
  return pipeline("object-detection", DETR_MODEL_ID)
}

let detrDetectorPromise: ReturnType<typeof createDetrDetector> | undefined

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

export const runFallbackDetrPipeline = async (
  source: string,
): Promise<readonly DetrDetection[]> => {
  const detector = testDetector()
  return detector === undefined
    ? runDetrPipeline(source)
    : DetrDetectionArraySchema.parse(await detector(source))
}
