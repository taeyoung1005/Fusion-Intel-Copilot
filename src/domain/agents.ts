import { z } from "zod"
import {
  AgentIdSchema,
  AlertStageSchema,
  CitationIdSchema,
  CameraIdSchema,
  EventIdSchema,
  ISOTimeSchema,
  IncidentIdSchema,
  ReportIdSchema,
  ReportWindowTypeSchema,
  TrackSessionIdSchema,
} from "./primitives"
import { ConfidenceSchema, MetadataSchema, OptionalSummarySchema } from "./shared"

export const EvidenceCitationSchema = z
  .object({
    citationId: CitationIdSchema,
    eventId: EventIdSchema,
    summary: OptionalSummarySchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type EvidenceCitation = Readonly<z.infer<typeof EvidenceCitationSchema>>

export const AgentInputSchema = z
  .object({
    eventId: EventIdSchema,
    simTime: ISOTimeSchema,
    agentId: AgentIdSchema,
    trackSessionId: TrackSessionIdSchema.optional(),
    promptLabel: z.string().min(1),
    evidenceEventIds: z.array(EventIdSchema).readonly(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type AgentInput = Readonly<z.infer<typeof AgentInputSchema>>

export const AgentFindingSchema = z
  .object({
    eventId: EventIdSchema,
    simTime: ISOTimeSchema,
    agentId: AgentIdSchema,
    findingType: z.enum(["benign", "uncertain", "suspicious", "needs_human_review"]),
    confidence: ConfidenceSchema,
    rationale: z.string().min(1),
    citations: z.array(EvidenceCitationSchema).readonly(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type AgentFinding = Readonly<z.infer<typeof AgentFindingSchema>>

export const AgentOutputSchema = z
  .object({
    eventId: EventIdSchema,
    simTime: ISOTimeSchema,
    agentId: AgentIdSchema,
    finding: AgentFindingSchema,
    recommendedStage: AlertStageSchema,
    citations: z.array(EvidenceCitationSchema).readonly(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type AgentOutput = Readonly<z.infer<typeof AgentOutputSchema>>

export const HumanDecisionSchema = z
  .object({
    eventId: EventIdSchema,
    simTime: ISOTimeSchema,
    decisionType: z.enum(["acknowledge", "dismiss", "escalate", "resolve", "close"]),
    operatorRole: z.string().min(1),
    rationale: OptionalSummarySchema,
    citations: z.array(EvidenceCitationSchema).readonly(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type HumanDecision = Readonly<z.infer<typeof HumanDecisionSchema>>

export const ReportSchema = z
  .object({
    reportId: ReportIdSchema,
    eventId: EventIdSchema,
    windowType: ReportWindowTypeSchema,
    generatedAt: ISOTimeSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    citations: z.array(EvidenceCitationSchema).readonly(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type Report = Readonly<z.infer<typeof ReportSchema>>

export const CorrectionRecordSchema = z
  .object({
    eventId: EventIdSchema,
    simTime: ISOTimeSchema,
    correctedEventId: EventIdSchema,
    correctionType: z.enum(["label", "stage", "correlation", "citation", "other"]),
    rationale: z.string().min(1),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type CorrectionRecord = Readonly<z.infer<typeof CorrectionRecordSchema>>

export const AgentErrorRecordSchema = z
  .object({
    eventId: EventIdSchema,
    simTime: ISOTimeSchema,
    agentId: AgentIdSchema,
    errorType: z.enum(["timeout", "invalid_output", "low_confidence", "provider_unavailable"]),
    recovery: z.enum(["fallback", "retry", "human_review", "ignored"]),
    summary: z.string().min(1),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type AgentErrorRecord = Readonly<z.infer<typeof AgentErrorRecordSchema>>

export const FacilityIncidentSchema = z
  .object({
    incidentId: IncidentIdSchema,
    openedAt: ISOTimeSchema,
    closedAt: ISOTimeSchema.optional(),
    stage: AlertStageSchema,
    correlation: z
      .object({
        cameraIds: z.array(CameraIdSchema).min(1).readonly(),
        trackSessionIds: z.array(TrackSessionIdSchema).min(1).readonly(),
        eventIds: z.array(EventIdSchema).min(1).readonly(),
        rationale: z.string().min(1),
      })
      .strict()
      .readonly(),
    summary: z.string().min(1),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type FacilityIncident = Readonly<z.infer<typeof FacilityIncidentSchema>>
