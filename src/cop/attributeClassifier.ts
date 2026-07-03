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
