import { describe, expect, it } from "vitest"
import { ActivityEventInputSchema } from "./activityEvents"

describe("activity event schemas", () => {
  it("parses activity event input before the server stamps ts", () => {
    const parsed = ActivityEventInputSchema.parse({
      source: "vision",
      stage: "detect",
      level: "watch",
      message: "DETR 후보 검출",
    })

    expect(parsed).toEqual({
      source: "vision",
      stage: "detect",
      level: "watch",
      message: "DETR 후보 검출",
    })
  })
})
