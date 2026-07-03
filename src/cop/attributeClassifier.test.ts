import { describe, expect, it } from "vitest"
import {
  buildFromRatio,
  describeAttributes,
  pickBinaryLabel,
  rgbToNamedColor,
} from "./attributeClassifier"

describe("rgbToNamedColor", () => {
  it("recognizes red", () => {
    expect(rgbToNamedColor(255, 0, 0)).toBe("red")
  })

  it("recognizes blue", () => {
    expect(rgbToNamedColor(0, 0, 255)).toBe("blue")
  })

  it("recognizes green", () => {
    expect(rgbToNamedColor(0, 180, 0)).toBe("green")
  })

  it("recognizes yellow", () => {
    expect(rgbToNamedColor(230, 220, 20)).toBe("yellow")
  })

  it("recognizes black by low lightness", () => {
    expect(rgbToNamedColor(10, 10, 10)).toBe("black")
  })

  it("recognizes white by high lightness and low saturation", () => {
    expect(rgbToNamedColor(245, 245, 245)).toBe("white")
  })

  it("recognizes gray by low saturation at mid lightness", () => {
    expect(rgbToNamedColor(120, 120, 120)).toBe("gray")
  })

  it("falls back to other for hues outside the named buckets (magenta)", () => {
    expect(rgbToNamedColor(180, 0, 180)).toBe("other")
  })
})

describe("buildFromRatio", () => {
  it("classifies a small bounding box ratio as small", () => {
    expect(buildFromRatio(72, 360)).toBe("small")
  })

  it("classifies a mid bounding box ratio as medium", () => {
    expect(buildFromRatio(162, 360)).toBe("medium")
  })

  it("classifies a large bounding box ratio as large", () => {
    expect(buildFromRatio(270, 360)).toBe("large")
  })

  it("defaults to medium when frameHeight is zero", () => {
    expect(buildFromRatio(100, 0)).toBe("medium")
  })
})

describe("pickBinaryLabel", () => {
  const labels: readonly [string, string] = ["a person wearing a hat", "a person not wearing a hat"]
  const values: readonly ["wearing_hat", "no_hat"] = ["wearing_hat", "no_hat"]

  it("picks the first value when its score is higher", () => {
    const result = pickBinaryLabel(
      [
        { label: "a person wearing a hat", score: 0.82 },
        { label: "a person not wearing a hat", score: 0.18 },
      ],
      labels,
      values,
    )
    expect(result).toEqual({ value: "wearing_hat", score: 0.82 })
  })

  it("picks the second value when its score is higher", () => {
    const result = pickBinaryLabel(
      [
        { label: "a person wearing a hat", score: 0.3 },
        { label: "a person not wearing a hat", score: 0.7 },
      ],
      labels,
      values,
    )
    expect(result).toEqual({ value: "no_hat", score: 0.7 })
  })
})

describe("describeAttributes", () => {
  it("composes a Korean description from all five attributes", () => {
    const text = describeAttributes({
      hat: "no_hat",
      sleeveLength: "short_sleeve",
      bagCarried: "carrying_bag",
      topColor: "red",
      build: "medium",
      attributeConfidence: 0.8,
    })
    expect(text).toBe("빨간 상의 · 배낭 소지 · 모자 없음 · 반팔")
  })

  it("omits the color prefix when topColor is other", () => {
    const text = describeAttributes({
      hat: "wearing_hat",
      sleeveLength: "long_sleeve",
      bagCarried: "no_bag",
      topColor: "other",
      build: "large",
      attributeConfidence: 0.6,
    })
    expect(text).toBe("상의 · 소지품 없음 · 모자 착용 · 긴팔")
  })
})
