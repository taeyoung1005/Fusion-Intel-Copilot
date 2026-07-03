import { describe, expect, it } from "vitest"
import { normalizeDetrDetections } from "./detrVisionDetector"

describe("normalizeDetrDetections", () => {
  it("converts DETR box output into pipeline frame objects", () => {
    const objects = normalizeDetrDetections(
      [
        {
          label: "person",
          score: 0.91,
          box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 },
        },
      ],
      { frameWidth: 640, frameHeight: 360 },
    )

    expect(objects).toEqual([
      {
        objectId: "detr-person-001",
        label: "person",
        confidence: 0.91,
        distanceMeters: 16,
        bbox: { x: 300, y: 92, width: 66, height: 166 },
      },
    ])
  })
})
