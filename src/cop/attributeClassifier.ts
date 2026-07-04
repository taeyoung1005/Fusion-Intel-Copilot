import { type ClipClassification, ClipClassificationSchema } from "./clipClassificationSchema"
import type { VisionFrameObject } from "./detrVisionDetector"
import { DETR_ONDEVICE_FALLBACK_ENABLED } from "./serverDetectionClient"

export type TopColor = "red" | "blue" | "black" | "white" | "gray" | "green" | "yellow" | "other"

export type PersonAttributes = {
  readonly hat: "wearing_hat" | "no_hat"
  readonly hatConfidence: number
  readonly sleeveLength: "short_sleeve" | "long_sleeve"
  readonly sleeveLengthConfidence: number
  readonly bagCarried: "carrying_bag" | "no_bag"
  readonly bagCarriedConfidence: number
  readonly topColor: TopColor
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

const ON_DEVICE_CLIP_CLASSIFIER_MODULE = "./onDeviceClipClassifier.ts"

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

type OnDeviceClipClassifierModule = typeof import("./onDeviceClipClassifier")

class OnDeviceClipClassifierDisabledError extends Error {
  readonly name = "OnDeviceClipClassifierDisabledError"
}

const testClipClassifier = (): D4dTestClipClassifier | undefined => {
  if (typeof window === "undefined") {
    return undefined
  }
  return window.__D4D_TEST_CLIP_CLASSIFIER__
}

const loadOnDeviceClipClassifier = async (): Promise<OnDeviceClipClassifierModule> =>
  import(/* @vite-ignore */ ON_DEVICE_CLIP_CLASSIFIER_MODULE)

const runClipClassification = async (
  source: string,
  candidateLabels: readonly [string, string],
): Promise<readonly ClipClassification[]> => {
  const testFn = testClipClassifier()
  if (testFn !== undefined) {
    return ClipClassificationSchema.parse(await testFn(source, candidateLabels))
  }
  if (!DETR_ONDEVICE_FALLBACK_ENABLED) {
    throw new OnDeviceClipClassifierDisabledError("On-device CLIP classification is disabled")
  }
  const { runOnDeviceClipClassification } = await loadOnDeviceClipClassifier()
  return runOnDeviceClipClassification(source, candidateLabels)
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

// Sampling the whole bbox for "top color" pulls in head, legs, and background
// bleed at the crop edges. Restrict to a torso-ish band: below the head, above
// the legs, and inset from both side edges.
const TORSO_TOP_RATIO = 0.15
const TORSO_BOTTOM_RATIO = 0.55
const TORSO_SIDE_INSET_RATIO = 0.2

type PixelRegion = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const torsoRegion = (canvas: HTMLCanvasElement): PixelRegion => {
  const top = Math.round(canvas.height * TORSO_TOP_RATIO)
  const bottom = Math.round(canvas.height * TORSO_BOTTOM_RATIO)
  const insetX = Math.round(canvas.width * TORSO_SIDE_INSET_RATIO)
  return {
    x: insetX,
    y: top,
    width: Math.max(1, canvas.width - insetX * 2),
    height: Math.max(1, bottom - top),
  }
}

const averageColorOfRegion = (
  canvas: HTMLCanvasElement,
  region: PixelRegion,
): { r: number; g: number; b: number } => {
  const context = canvas.getContext("2d")
  if (context === null) {
    return { r: 128, g: 128, b: 128 }
  }
  const { data } = context.getImageData(region.x, region.y, region.width, region.height)
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
}): Promise<PersonAttributes> => {
  const canvas = await decodeAndCropToCanvas(input.source, input.bbox)
  const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.8)
  const { r, g, b } = averageColorOfRegion(canvas, torsoRegion(canvas))
  const topColor = rgbToNamedColor(r, g, b)

  const [hat, sleeveLength, bagCarried] = await Promise.all([
    classifyBinary(croppedDataUrl, HAT_LABELS, ["wearing_hat", "no_hat"] as const),
    classifyBinary(croppedDataUrl, SLEEVE_LABELS, ["short_sleeve", "long_sleeve"] as const),
    classifyBinary(croppedDataUrl, BAG_LABELS, ["carrying_bag", "no_bag"] as const),
  ])

  return {
    hat: hat.value,
    hatConfidence: hat.score,
    sleeveLength: sleeveLength.value,
    sleeveLengthConfidence: sleeveLength.score,
    bagCarried: bagCarried.value,
    bagCarriedConfidence: bagCarried.score,
    topColor,
  }
}

let attributesDisabled = false
let attributesDisableWarningShown = false

export const extractPersonAttributesSafely = async (
  source: string,
  bbox: Bbox,
  isMemoryFailure: (error: unknown) => boolean,
): Promise<PersonAttributes | undefined> => {
  if (attributesDisabled) {
    return undefined
  }
  try {
    return await extractPersonAttributes({ source, bbox })
  } catch (error: unknown) {
    if (error instanceof OnDeviceClipClassifierDisabledError) {
      return undefined
    }
    if (isMemoryFailure(error)) {
      attributesDisabled = true
      if (!attributesDisableWarningShown) {
        attributesDisableWarningShown = true
        console.warn("CARLA 속성 추출(CLIP) 메모리 부족으로 자동 비활성화했습니다.")
      }
      return undefined
    }
    console.error("CARLA 인물 속성 추출 실패", error)
    return undefined
  }
}
