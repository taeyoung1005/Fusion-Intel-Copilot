import { z } from "zod"
import {
  AlertStageSchema,
  CameraIdSchema,
  DistanceBandSchema,
  EventIdSchema,
  ISOTimeSchema,
  TrackIdSchema,
  TrackSessionIdSchema,
  TrackSessionStateSchema,
  type TrackSessionState,
} from "./primitives"
import { ConfidenceSchema, MetadataSchema, OptionalSummarySchema } from "./shared"

const allowedTransitions: Readonly<Record<TrackSessionState, readonly TrackSessionState[]>> = {
  candidate: ["active_track"],
  active_track: ["incident_session"],
  incident_session: ["agent_review_cycle"],
  agent_review_cycle: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
}

export const TrackSchema = z
  .object({
    trackId: TrackIdSchema,
    cameraId: CameraIdSchema,
    firstSeen: ISOTimeSchema,
    lastSeen: ISOTimeSchema,
    confidence: ConfidenceSchema,
    distanceBand: DistanceBandSchema.optional(),
    observationEventIds: z.array(EventIdSchema).min(1).readonly(),
    summary: OptionalSummarySchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type Track = Readonly<z.infer<typeof TrackSchema>>

export const TrackSessionStateEntrySchema = z
  .object({
    state: TrackSessionStateSchema,
    simTime: ISOTimeSchema,
    eventId: EventIdSchema.optional(),
    note: OptionalSummarySchema,
  })
  .strict()
  .readonly()
export type TrackSessionStateEntry = Readonly<z.infer<typeof TrackSessionStateEntrySchema>>

export const validateTrackSessionTransitions = (
  session: Readonly<{ stateHistory: readonly TrackSessionStateEntry[] }>,
): boolean =>
  session.stateHistory.every((entry, index, history) => {
    if (index === 0) {
      return entry.state === "candidate"
    }
    const previous = history[index - 1]
    return previous !== undefined && allowedTransitions[previous.state].includes(entry.state)
  })

export const TrackSessionSchema = z
  .object({
    sessionId: TrackSessionIdSchema,
    trackIds: z.array(TrackIdSchema).min(1).readonly(),
    cameraIds: z.array(CameraIdSchema).min(1).readonly(),
    startedAt: ISOTimeSchema,
    endedAt: ISOTimeSchema.optional(),
    currentStage: AlertStageSchema,
    stateHistory: z.array(TrackSessionStateEntrySchema).min(1).readonly(),
    summary: OptionalSummarySchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
  .superRefine((session, ctx) => {
    if (!validateTrackSessionTransitions(session)) {
      ctx.addIssue({
        code: "custom",
        path: ["stateHistory"],
        message: "TrackSession stateHistory contains an invalid lifecycle transition",
      })
    }
  })
export type TrackSession = Readonly<z.infer<typeof TrackSessionSchema>>
