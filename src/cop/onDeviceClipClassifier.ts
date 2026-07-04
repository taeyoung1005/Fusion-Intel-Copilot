import { type ClipClassification, ClipClassificationSchema } from "./clipClassificationSchema"

const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32"
const TRANSFORMERS_MODULE = "@huggingface/transformers"

type ClipClassifier = (source: string, candidateLabels: string[]) => Promise<unknown>

type TransformersPipeline = (
  task: "zero-shot-image-classification",
  modelId: string,
) => Promise<ClipClassifier>

const createClipClassifier = async (): Promise<ClipClassifier> => {
  const { pipeline }: { readonly pipeline: TransformersPipeline } = await import(
    /* @vite-ignore */ TRANSFORMERS_MODULE
  )
  return pipeline("zero-shot-image-classification", CLIP_MODEL_ID)
}

let clipClassifierPromise: ReturnType<typeof createClipClassifier> | undefined

export const runOnDeviceClipClassification = async (
  source: string,
  candidateLabels: readonly [string, string],
): Promise<readonly ClipClassification[]> => {
  clipClassifierPromise ??= createClipClassifier()
  const classifier = await clipClassifierPromise
  const output = await classifier(source, [...candidateLabels])
  return ClipClassificationSchema.parse(output)
}
