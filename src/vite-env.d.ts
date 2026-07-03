/// <reference types="vite/client" />

type D4dTestDetrDetection = {
  readonly label: string
  readonly score: number
  readonly box: {
    readonly xmin: number
    readonly ymin: number
    readonly xmax: number
    readonly ymax: number
  }
}

type D4dTestDetrDetector = (source: string) => Promise<readonly D4dTestDetrDetection[]>

type D4dTestClipClassification = {
  readonly label: string
  readonly score: number
}

type D4dTestClipClassifier = (
  source: string,
  candidateLabels: readonly string[],
) => Promise<readonly D4dTestClipClassification[]>

interface Window {
  __D4D_TEST_DETR_DETECTOR__?: D4dTestDetrDetector
  __D4D_TEST_CLIP_CLASSIFIER__?: D4dTestClipClassifier
}
