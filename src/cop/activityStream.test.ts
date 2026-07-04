import { describe, expect, it } from "vitest"
import {
  type ActivityStreamEvent,
  ActivityStreamParseError,
  activityPipelineStageOf,
  appendActivityEvent,
  parseActivityStreamEvent,
} from "./activityStream"

describe("activity stream parsing", () => {
  it("parses backend JSON events into the shared activity log shape", () => {
    const event = parseActivityStreamEvent(
      JSON.stringify({
        ts: "2026-07-04T09:42:18.120Z",
        source: "vision",
        level: "watch",
        stage: "detect:end",
        message: "DETR 후보 2건 검출",
        detail: { detectionCount: 2 },
      }),
    )

    expect(event).toEqual({
      ts: "2026-07-04T09:42:18.120Z",
      source: "vision",
      level: "watch",
      stage: "detect:end",
      message: "DETR 후보 2건 검출",
      detail: { detectionCount: 2 },
    })
  })

  it("maps backend stage phases onto the panel pipeline stages", () => {
    expect(activityPipelineStageOf("receive:start")).toBe("receive")
    expect(activityPipelineStageOf("decode:end")).toBe("decode")
    expect(activityPipelineStageOf("detect:end")).toBe("detect")
    expect(activityPipelineStageOf("classify:end")).toBe("classify")
    expect(activityPipelineStageOf("decide:end")).toBe("decide")
    expect(activityPipelineStageOf("frame-upload:end")).toBeNull()
  })

  it("rejects malformed backend events with a typed parse error", () => {
    expect(() =>
      parseActivityStreamEvent(
        JSON.stringify({
          ts: "2026-07-04T09:42:18.120Z",
          source: "demo",
          level: "watch",
          stage: "detect:end",
          message: "허용되지 않은 소스",
        }),
      ),
    ).toThrow(ActivityStreamParseError)
  })

  it("keeps only the most recent events in append order", () => {
    const events = ["receive:end", "decode:end", "detect:end", "classify:end"].reduce(
      (buffer, stage, index) =>
        appendActivityEvent(buffer, event(stage, `2026-07-04T09:42:1${String(index)}.000Z`), 3),
      [] satisfies readonly ActivityStreamEvent[],
    )

    expect(events.map((activityEvent) => activityEvent.stage)).toEqual([
      "decode:end",
      "detect:end",
      "classify:end",
    ])
  })
})

const event = (stage: string, ts: string): ActivityStreamEvent => ({
  ts,
  source: "vision",
  level: "info",
  stage,
  message: `${stage} 단계`,
})
