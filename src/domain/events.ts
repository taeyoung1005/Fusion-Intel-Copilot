import { z } from "zod"
import {
  AlertStageSchema,
  CameraIdSchema,
  DistanceBandSchema,
  EventIdSchema,
  ISOTimeSchema,
  SemanticEventTypeSchema,
  TrackIdSchema,
  TrackSessionIdSchema,
} from "./primitives"
import { ConfidenceSchema, MetadataSchema, OptionalSummarySchema } from "./shared"

export const ObservationSchema = z
  .object({
    eventId: EventIdSchema,
    simTime: ISOTimeSchema,
    cameraId: CameraIdSchema,
    trackId: TrackIdSchema.optional(),
    objectLabel: z.string().min(1),
    confidence: ConfidenceSchema,
    distanceBand: DistanceBandSchema.optional(),
    summary: OptionalSummarySchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type Observation = Readonly<z.infer<typeof ObservationSchema>>

export const SemanticEventSchema = z
  .object({
    eventId: EventIdSchema,
    simTime: ISOTimeSchema,
    eventType: SemanticEventTypeSchema,
    cameraIds: z.array(CameraIdSchema).min(1).readonly(),
    trackSessionId: TrackSessionIdSchema.optional(),
    alertStage: AlertStageSchema,
    distanceBand: DistanceBandSchema.optional(),
    summary: OptionalSummarySchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type SemanticEvent = Readonly<z.infer<typeof SemanticEventSchema>>
