import { describe, expect, it } from "vitest"
import { describeAttributes, pickBinaryLabel, rgbToNamedColor } from "./attributeClassifier"

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
      hatConfidence: 0.8,
      sleeveLength: "short_sleeve",
      sleeveLengthConfidence: 0.8,
      bagCarried: "carrying_bag",
      bagCarriedConfidence: 0.8,
      topColor: "red",
    })
    expect(text).toBe("빨간 상의 · 배낭 소지 · 모자 없음 · 반팔")
  })

  it("omits the color prefix when topColor is other", () => {
    const text = describeAttributes({
      hat: "wearing_hat",
      hatConfidence: 0.6,
      sleeveLength: "long_sleeve",
      sleeveLengthConfidence: 0.6,
      bagCarried: "no_bag",
      bagCarriedConfidence: 0.6,
      topColor: "other",
    })
    expect(text).toBe("상의 · 소지품 없음 · 모자 착용 · 긴팔")
  })
})
