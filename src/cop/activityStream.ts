import { type ActivityEvent, ActivityEventSchema } from "../activityEvents"

export const ACTIVITY_STREAM_STAGES = ["receive", "decode", "detect", "classify", "decide"] as const

export type ActivityStreamStage = (typeof ACTIVITY_STREAM_STAGES)[number]
export type ActivityStreamEvent = ActivityEvent
export type ActivityStreamLevel = ActivityEvent["level"]
export type ActivityStreamSource = ActivityEvent["source"]

export class ActivityStreamParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ActivityStreamParseError"
  }
}

export const parseActivityStreamEvent = (raw: string): ActivityStreamEvent => {
  try {
    const payload: unknown = JSON.parse(raw)
    return ActivityEventSchema.parse(payload)
  } catch (error) {
    if (error instanceof ActivityStreamParseError) {
      throw error
    }
    if (error instanceof Error) {
      throw new ActivityStreamParseError(
        `activity-event-backend 이벤트 형식 오류: ${error.message}`,
      )
    }
    throw new ActivityStreamParseError("activity-event-backend 이벤트 형식 오류")
  }
}

export const appendActivityEvent = (
  buffer: readonly ActivityStreamEvent[],
  event: ActivityStreamEvent,
  limit = 50,
): readonly ActivityStreamEvent[] => {
  return [...buffer, event].slice(-limit)
}

export const activityPipelineStageOf = (stage: string): ActivityStreamStage | null => {
  const baseStage = stage.split(":")[0]
  switch (baseStage) {
    case "receive":
      return "receive"
    case "decode":
      return "decode"
    case "detect":
      return "detect"
    case "classify":
      return "classify"
    case "decide":
      return "decide"
    default:
      return null
  }
}
