export type TopColor = "red" | "blue" | "black" | "white" | "gray" | "green" | "yellow" | "other"
export type Build = "small" | "medium" | "large"

export type PersonAttributes = {
  readonly hat: "wearing_hat" | "no_hat"
  readonly sleeveLength: "short_sleeve" | "long_sleeve"
  readonly bagCarried: "carrying_bag" | "no_bag"
  readonly topColor: TopColor
  readonly build: Build
  readonly attributeConfidence: number
}

const BUILD_SMALL_MAX_RATIO = 0.3
const BUILD_LARGE_MIN_RATIO = 0.6

export const buildFromRatio = (bboxHeight: number, frameHeight: number): Build => {
  if (frameHeight <= 0) {
    return "medium"
  }
  const ratio = bboxHeight / frameHeight
  if (ratio < BUILD_SMALL_MAX_RATIO) {
    return "small"
  }
  if (ratio >= BUILD_LARGE_MIN_RATIO) {
    return "large"
  }
  return "medium"
}

export const rgbToNamedColor = (r: number, g: number, b: number): TopColor => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2 / 255
  const delta = max - min
  const saturation = delta === 0 ? 0 : delta / (255 - Math.abs(max + min - 255))

  if (lightness < 0.15) {
    return "black"
  }
  if (lightness > 0.85 && saturation < 0.25) {
    return "white"
  }
  if (saturation < 0.2) {
    return "gray"
  }

  let hue: number
  if (max === r) {
    hue = ((g - b) / delta) % 6
  } else if (max === g) {
    hue = (b - r) / delta + 2
  } else {
    hue = (r - g) / delta + 4
  }
  hue = Math.round(hue * 60)
  if (hue < 0) {
    hue += 360
  }

  if (hue < 30 || hue >= 330) {
    return "red"
  }
  if (hue < 90) {
    return "yellow"
  }
  if (hue < 150) {
    return "green"
  }
  if (hue < 270) {
    return "blue"
  }
  return "other"
}

export const pickBinaryLabel = <A extends string, B extends string>(
  scores: readonly { readonly label: string; readonly score: number }[],
  labels: readonly [string, string],
  values: readonly [A, B],
): { readonly value: A | B; readonly score: number } => {
  const first = scores.find((item) => item.label === labels[0])
  const second = scores.find((item) => item.label === labels[1])
  if (second === undefined || (first !== undefined && first.score >= second.score)) {
    return { value: values[0], score: first?.score ?? 0 }
  }
  return { value: values[1], score: second.score }
}

const COLOR_LABEL_KO: Record<TopColor, string> = {
  red: "빨간 ",
  blue: "파란 ",
  black: "검은 ",
  white: "흰 ",
  gray: "회색 ",
  green: "초록 ",
  yellow: "노란 ",
  other: "",
}

export const describeAttributes = (attributes: PersonAttributes): string => {
  const hatText = attributes.hat === "wearing_hat" ? "모자 착용" : "모자 없음"
  const sleeveText = attributes.sleeveLength === "short_sleeve" ? "반팔" : "긴팔"
  const bagText = attributes.bagCarried === "carrying_bag" ? "배낭 소지" : "소지품 없음"
  const colorPrefix = COLOR_LABEL_KO[attributes.topColor]
  return `${colorPrefix}상의 · ${bagText} · ${hatText} · ${sleeveText}`
}

import { z } from "zod"
import type { VisionFrameObject } from "./detrVisionDetector"

const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32"

const HAT_LABELS: readonly [string, string] = [
  "a person wearing a hat",
  "a person not wearing a hat",
]
const SLEEVE_LABELS: readonly [string, string] = [
  "a person wearing short sleeves",
  "a person wearing long sleeves",
]
const BAG_LABELS: readonly [string, string] = [
  "a person carrying a bag or backpack",
  "a person without a bag",
]

const ClipClassificationSchema = z
  .array(z.object({ label: z.string(), score: z.number() }))
  .readonly()

const createClipClassifier = async () => {
  const { pipeline } = await import("@huggingface/transformers")
  return pipeline("zero-shot-image-classification", CLIP_MODEL_ID)
}

let clipClassifierPromise: ReturnType<typeof createClipClassifier> | undefined

const testClipClassifier = (): D4dTestClipClassifier | undefined => {
  if (typeof window === "undefined") {
    return undefined
  }
  return window.__D4D_TEST_CLIP_CLASSIFIER__
}

const runClipClassification = async (
  source: string,
  candidateLabels: readonly [string, string],
): Promise<readonly { label: string; score: number }[]> => {
  const testFn = testClipClassifier()
  if (testFn !== undefined) {
    return ClipClassificationSchema.parse(await testFn(source, candidateLabels))
  }
  clipClassifierPromise ??= createClipClassifier()
  const classifier = await clipClassifierPromise
  const output = await classifier(source, candidateLabels as unknown as string[])
  return ClipClassificationSchema.parse(output)
}

const classifyBinary = async <A extends string, B extends string>(
  source: string,
  labels: readonly [string, string],
  values: readonly [A, B],
): Promise<{ readonly value: A | B; readonly score: number }> => {
  const scores = await runClipClassification(source, labels)
  return pickBinaryLabel(scores, labels, values)
}

type Bbox = VisionFrameObject["bbox"]

const decodeAndCropToCanvas = (source: string, bbox: Bbox): Promise<HTMLCanvasElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, bbox.width)
      canvas.height = Math.max(1, bbox.height)
      const context = canvas.getContext("2d")
      if (context === null) {
        reject(new Error("캔버스 컨텍스트를 생성할 수 없습니다."))
        return
      }
      context.drawImage(
        image,
        bbox.x,
        bbox.y,
        bbox.width,
        bbox.height,
        0,
        0,
        canvas.width,
        canvas.height,
      )
      resolve(canvas)
    }
    image.onerror = () => reject(new Error("프레임을 디코딩할 수 없습니다."))
    image.src = source
  })

const averageColorOf = (canvas: HTMLCanvasElement): { r: number; g: number; b: number } => {
  const context = canvas.getContext("2d")
  if (context === null) {
    return { r: 128, g: 128, b: 128 }
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  let r = 0
  let g = 0
  let b = 0
  const pixelCount = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    r += data[i] ?? 0
    g += data[i + 1] ?? 0
    b += data[i + 2] ?? 0
  }
  return { r: r / pixelCount, g: g / pixelCount, b: b / pixelCount }
}

export const extractPersonAttributes = async (input: {
  readonly source: string
  readonly bbox: Bbox
  readonly frameHeight: number
}): Promise<PersonAttributes> => {
  const canvas = await decodeAndCropToCanvas(input.source, input.bbox)
  const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.8)
  const { r, g, b } = averageColorOf(canvas)
  const topColor = rgbToNamedColor(r, g, b)
  const build = buildFromRatio(input.bbox.height, input.frameHeight)

  const [hat, sleeveLength, bagCarried] = await Promise.all([
    classifyBinary(croppedDataUrl, HAT_LABELS, ["wearing_hat", "no_hat"] as const),
    classifyBinary(croppedDataUrl, SLEEVE_LABELS, ["short_sleeve", "long_sleeve"] as const),
    classifyBinary(croppedDataUrl, BAG_LABELS, ["carrying_bag", "no_bag"] as const),
  ])

  return {
    hat: hat.value,
    sleeveLength: sleeveLength.value,
    bagCarried: bagCarried.value,
    topColor,
    build,
    attributeConfidence: (hat.score + sleeveLength.score + bagCarried.score) / 3,
  }
}
