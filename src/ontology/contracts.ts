import { z } from "zod"
import {
  AlertStageSchema,
  CameraGroupIdSchema,
  CameraIdSchema,
  CameraStatusSchema,
  CameraZoneSchema,
  CitationIdSchema,
  ConfidenceSchema,
  DistanceBandSchema,
  EventIdSchema,
  ISOTimeSchema,
  IncidentIdSchema,
  MetadataSchema,
  OptionalSummarySchema,
  ReportIdSchema,
  TrackIdSchema,
  TrackSessionIdSchema,
} from "../domain"

export const ONTOLOGY_OBJECT_TYPES = [
  "Sensor",
  "SensorGroup",
  "Observation",
  "Track",
  "TrackSession",
  "Incident",
  "EvidenceClip",
  "Citation",
  "Assessment",
  "ResponseGate",
  "CommanderReport",
  "Asset",
] as const
export const ONTOLOGY_LINK_TYPES = [
  "sensor_observed_observation",
  "observation_supports_track",
  "track_raised_incident",
  "incident_has_evidence",
  "incident_has_assessment",
  "incident_has_response_gate",
  "report_summarizes_incident",
] as const
export const ONTOLOGY_ACTION_TYPES = [
  "recordAssessment",
  "submitResponseGate",
  "generateCommanderReport",
] as const

export const OntologyObjectTypeSchema = z.enum(ONTOLOGY_OBJECT_TYPES)
export type OntologyObjectType = z.infer<typeof OntologyObjectTypeSchema>
export const OntologyLinkTypeSchema = z.enum(ONTOLOGY_LINK_TYPES)
export type OntologyLinkType = z.infer<typeof OntologyLinkTypeSchema>
export const OntologyActionTypeSchema = z.enum(ONTOLOGY_ACTION_TYPES)
export type OntologyActionType = z.infer<typeof OntologyActionTypeSchema>

export const SensorIdSchema = z
  .union([CameraIdSchema, z.string().regex(/^(sensor|camera|CAM|PHONE|AMMO)-[A-Za-z0-9-]+$/)])
  .brand("SensorId")
export type SensorId = z.infer<typeof SensorIdSchema>
export const SensorGroupIdSchema = z
  .union([CameraGroupIdSchema, z.string().regex(/^group-[A-Za-z0-9-]+$/)])
  .brand("SensorGroupId")
export type SensorGroupId = z.infer<typeof SensorGroupIdSchema>
export const ObservationIdSchema = EventIdSchema
export type ObservationId = z.infer<typeof ObservationIdSchema>
export const EvidenceClipIdSchema = z
  .string()
  .regex(/^(evidence|clip)-[A-Za-z0-9-]+$/)
  .brand("EvidenceClipId")
export type EvidenceClipId = z.infer<typeof EvidenceClipIdSchema>
export const AssessmentIdSchema = z
  .string()
  .regex(/^assessment-[A-Za-z0-9-]+$/)
  .brand("AssessmentId")
export type AssessmentId = z.infer<typeof AssessmentIdSchema>
export const ResponseGateIdSchema = z
  .string()
  .regex(/^gate-[A-Za-z0-9-]+$/)
  .brand("ResponseGateId")
export type ResponseGateId = z.infer<typeof ResponseGateIdSchema>
export const AssetIdSchema = z
  .string()
  .regex(/^asset-[A-Za-z0-9-]+$/)
  .brand("AssetId")
export type AssetId = z.infer<typeof AssetIdSchema>
export const OntologyLinkIdSchema = z
  .string()
  .regex(/^link-[A-Za-z0-9-]+$/)
  .brand("OntologyLinkId")
export type OntologyLinkId = z.infer<typeof OntologyLinkIdSchema>
export const OntologyActionIdSchema = z
  .string()
  .regex(/^action-[A-Za-z0-9-]+$/)
  .brand("OntologyActionId")
export type OntologyActionId = z.infer<typeof OntologyActionIdSchema>

export const OntologyObjectIdSchema = z.union([
  SensorIdSchema,
  SensorGroupIdSchema,
  ObservationIdSchema,
  TrackIdSchema,
  TrackSessionIdSchema,
  IncidentIdSchema,
  EvidenceClipIdSchema,
  CitationIdSchema,
  AssessmentIdSchema,
  ResponseGateIdSchema,
  ReportIdSchema,
  AssetIdSchema,
])
export type OntologyObjectId = z.infer<typeof OntologyObjectIdSchema>

const refSchema = <const ObjectType extends string, ObjectIdSchema extends z.ZodType>(
  objectType: ObjectType,
  objectId: ObjectIdSchema,
) =>
  z
    .object({ objectType: z.literal(objectType), objectId })
    .strict()
    .readonly()

const payloadSchema = <
  const ObjectType extends string,
  ObjectIdSchema extends z.ZodType,
  PropertiesShape extends z.ZodRawShape,
>(
  objectType: ObjectType,
  objectId: ObjectIdSchema,
  properties: PropertiesShape,
) =>
  z
    .object({
      objectType: z.literal(objectType),
      objectId,
      properties: z.object(properties).strict().readonly(),
    })
    .strict()
    .readonly()

const SensorRefSchema = refSchema("Sensor", SensorIdSchema)
const SensorGroupRefSchema = refSchema("SensorGroup", SensorGroupIdSchema)
const ObservationRefSchema = refSchema("Observation", ObservationIdSchema)
const TrackRefSchema = refSchema("Track", TrackIdSchema)
const TrackSessionRefSchema = refSchema("TrackSession", TrackSessionIdSchema)
const IncidentRefSchema = refSchema("Incident", IncidentIdSchema)
const EvidenceClipRefSchema = refSchema("EvidenceClip", EvidenceClipIdSchema)
const CitationRefSchema = refSchema("Citation", CitationIdSchema)
const AssessmentRefSchema = refSchema("Assessment", AssessmentIdSchema)
const ResponseGateRefSchema = refSchema("ResponseGate", ResponseGateIdSchema)
const CommanderReportRefSchema = refSchema("CommanderReport", ReportIdSchema)
const AssetRefSchema = refSchema("Asset", AssetIdSchema)

export const OntologyObjectRefSchema = z.discriminatedUnion("objectType", [
  SensorRefSchema,
  SensorGroupRefSchema,
  ObservationRefSchema,
  TrackRefSchema,
  TrackSessionRefSchema,
  IncidentRefSchema,
  EvidenceClipRefSchema,
  CitationRefSchema,
  AssessmentRefSchema,
  ResponseGateRefSchema,
  CommanderReportRefSchema,
  AssetRefSchema,
])
export type OntologyObjectRef = Readonly<z.infer<typeof OntologyObjectRefSchema>>

export const EvidenceClipSourceSchema = z.enum(["mobile", "vision", "correlation"])
export const AssessmentFindingSchema = z.enum([
  "benign",
  "uncertain",
  "suspicious",
  "needs_human_review",
])
export const ResponseGateStatusSchema = z.enum(["PASS", "PENDING", "BLOCKED"])
export const AssetTypeSchema = z.enum(["camera", "perimeter_zone", "facility", "vehicle", "other"])

const AssessmentInputShape = {
  assessedAt: ISOTimeSchema,
  assessor: z.string().min(1),
  finding: AssessmentFindingSchema,
  confidence: ConfidenceSchema,
  citationIds: z.array(CitationIdSchema).readonly(),
  summary: z.string().min(1),
  metadata: MetadataSchema.optional(),
} satisfies z.ZodRawShape
const CommanderReportInputShape = {
  generatedAt: ISOTimeSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  citationIds: z.array(CitationIdSchema).readonly(),
  metadata: MetadataSchema.optional(),
} satisfies z.ZodRawShape

export const SensorObjectPayloadSchema = payloadSchema("Sensor", SensorIdSchema, {
  label: z.string().min(1),
  zone: CameraZoneSchema,
  status: CameraStatusSchema,
  coverageNote: OptionalSummarySchema,
  metadata: MetadataSchema.optional(),
})
export const SensorGroupObjectPayloadSchema = payloadSchema("SensorGroup", SensorGroupIdSchema, {
  label: z.string().min(1),
  sensorIds: z.array(SensorIdSchema).min(1).readonly(),
  purpose: OptionalSummarySchema,
  metadata: MetadataSchema.optional(),
})
export const ObservationObjectPayloadSchema = payloadSchema("Observation", ObservationIdSchema, {
  observedAt: ISOTimeSchema,
  sensorId: SensorIdSchema,
  trackId: TrackIdSchema.optional(),
  objectLabel: z.string().min(1),
  confidence: ConfidenceSchema,
  distanceBand: DistanceBandSchema.optional(),
  summary: OptionalSummarySchema,
  metadata: MetadataSchema.optional(),
})
export const TrackObjectPayloadSchema = payloadSchema("Track", TrackIdSchema, {
  sensorId: SensorIdSchema,
  firstSeen: ISOTimeSchema,
  lastSeen: ISOTimeSchema,
  confidence: ConfidenceSchema,
  distanceBand: DistanceBandSchema.optional(),
  observationIds: z.array(ObservationIdSchema).min(1).readonly(),
  summary: OptionalSummarySchema,
  metadata: MetadataSchema.optional(),
})
export const TrackSessionObjectPayloadSchema = payloadSchema("TrackSession", TrackSessionIdSchema, {
  trackIds: z.array(TrackIdSchema).min(1).readonly(),
  sensorIds: z.array(SensorIdSchema).min(1).readonly(),
  startedAt: ISOTimeSchema,
  endedAt: ISOTimeSchema.optional(),
  currentStage: AlertStageSchema,
  summary: OptionalSummarySchema,
  metadata: MetadataSchema.optional(),
})
export const IncidentObjectPayloadSchema = payloadSchema("Incident", IncidentIdSchema, {
  openedAt: ISOTimeSchema,
  closedAt: ISOTimeSchema.optional(),
  stage: AlertStageSchema,
  sensorIds: z.array(SensorIdSchema).min(1).readonly(),
  trackSessionIds: z.array(TrackSessionIdSchema).readonly(),
  eventIds: z.array(ObservationIdSchema).min(1).readonly(),
  summary: z.string().min(1),
  metadata: MetadataSchema.optional(),
})
export const EvidenceClipObjectPayloadSchema = payloadSchema("EvidenceClip", EvidenceClipIdSchema, {
  capturedAt: ISOTimeSchema,
  sensorId: SensorIdSchema,
  label: z.string().min(1),
  source: EvidenceClipSourceSchema,
  confidence: ConfidenceSchema,
  uri: z.string().min(1),
  metadata: MetadataSchema.optional(),
})
export const CitationObjectPayloadSchema = payloadSchema("Citation", CitationIdSchema, {
  label: z.string().min(1),
  citedAt: ISOTimeSchema.optional(),
  evidenceClipId: EvidenceClipIdSchema.optional(),
  metadata: MetadataSchema.optional(),
})
export const AssessmentObjectPayloadSchema = payloadSchema("Assessment", AssessmentIdSchema, {
  incidentId: IncidentIdSchema,
  ...AssessmentInputShape,
})
export const ResponseGateObjectPayloadSchema = payloadSchema("ResponseGate", ResponseGateIdSchema, {
  incidentId: IncidentIdSchema,
  label: z.string().min(1),
  status: ResponseGateStatusSchema,
  decidedAt: ISOTimeSchema.optional(),
  decidedBy: z.string().min(1).optional(),
  metadata: MetadataSchema.optional(),
})
export const CommanderReportObjectPayloadSchema = payloadSchema("CommanderReport", ReportIdSchema, {
  incidentId: IncidentIdSchema,
  ...CommanderReportInputShape,
})
export const AssetObjectPayloadSchema = payloadSchema("Asset", AssetIdSchema, {
  label: z.string().min(1),
  assetType: AssetTypeSchema,
  zone: z.string().min(1).optional(),
  metadata: MetadataSchema.optional(),
})

export const OntologyObjectPayloadSchema = z.discriminatedUnion("objectType", [
  SensorObjectPayloadSchema,
  SensorGroupObjectPayloadSchema,
  ObservationObjectPayloadSchema,
  TrackObjectPayloadSchema,
  TrackSessionObjectPayloadSchema,
  IncidentObjectPayloadSchema,
  EvidenceClipObjectPayloadSchema,
  CitationObjectPayloadSchema,
  AssessmentObjectPayloadSchema,
  ResponseGateObjectPayloadSchema,
  CommanderReportObjectPayloadSchema,
  AssetObjectPayloadSchema,
])
export type OntologyObjectPayload = Readonly<z.infer<typeof OntologyObjectPayloadSchema>>

const LinkPropertiesSchema = z.record(z.string(), z.unknown()).readonly()
const linkSchema = <const LinkType extends string, From extends z.ZodType, To extends z.ZodType>(
  linkType: LinkType,
  from: From,
  to: To,
) =>
  z
    .object({
      linkType: z.literal(linkType),
      linkId: OntologyLinkIdSchema,
      from,
      to,
      properties: LinkPropertiesSchema.optional(),
    })
    .strict()
    .readonly()

export const SensorObservedObservationLinkPayloadSchema = linkSchema(
  "sensor_observed_observation",
  SensorRefSchema,
  ObservationRefSchema,
)
export const ObservationSupportsTrackLinkPayloadSchema = linkSchema(
  "observation_supports_track",
  ObservationRefSchema,
  TrackRefSchema,
)
export const TrackRaisedIncidentLinkPayloadSchema = linkSchema(
  "track_raised_incident",
  TrackRefSchema,
  IncidentRefSchema,
)
export const IncidentHasEvidenceLinkPayloadSchema = linkSchema(
  "incident_has_evidence",
  IncidentRefSchema,
  EvidenceClipRefSchema,
)
export const IncidentHasAssessmentLinkPayloadSchema = linkSchema(
  "incident_has_assessment",
  IncidentRefSchema,
  AssessmentRefSchema,
)
export const IncidentHasResponseGateLinkPayloadSchema = linkSchema(
  "incident_has_response_gate",
  IncidentRefSchema,
  ResponseGateRefSchema,
)
export const ReportSummarizesIncidentLinkPayloadSchema = linkSchema(
  "report_summarizes_incident",
  CommanderReportRefSchema,
  IncidentRefSchema,
)

export const OntologyLinkPayloadSchema = z.discriminatedUnion("linkType", [
  SensorObservedObservationLinkPayloadSchema,
  ObservationSupportsTrackLinkPayloadSchema,
  TrackRaisedIncidentLinkPayloadSchema,
  IncidentHasEvidenceLinkPayloadSchema,
  IncidentHasAssessmentLinkPayloadSchema,
  IncidentHasResponseGateLinkPayloadSchema,
  ReportSummarizesIncidentLinkPayloadSchema,
])
export type OntologyLinkPayload = Readonly<z.infer<typeof OntologyLinkPayloadSchema>>

const actionSchema = <
  const ActionType extends string,
  Target extends z.ZodType,
  Input extends z.ZodRawShape,
>(
  actionType: ActionType,
  target: Target,
  input: Input,
) =>
  z
    .object({
      actionType: z.literal(actionType),
      actionId: OntologyActionIdSchema,
      target,
      input: z.object(input).strict().readonly(),
    })
    .strict()
    .readonly()

export const RecordAssessmentActionPayloadSchema = actionSchema(
  "recordAssessment",
  IncidentRefSchema,
  {
    assessmentId: AssessmentIdSchema,
    ...AssessmentInputShape,
  },
)
export const SubmitResponseGateActionPayloadSchema = actionSchema(
  "submitResponseGate",
  ResponseGateRefSchema,
  {
    submittedAt: ISOTimeSchema,
    submittedBy: z.string().min(1),
    status: ResponseGateStatusSchema,
    rationale: z.string().min(1),
    metadata: MetadataSchema.optional(),
  },
)
export const GenerateCommanderReportActionPayloadSchema = actionSchema(
  "generateCommanderReport",
  IncidentRefSchema,
  {
    reportId: ReportIdSchema,
    ...CommanderReportInputShape,
  },
)

export const OntologyActionPayloadSchema = z.discriminatedUnion("actionType", [
  RecordAssessmentActionPayloadSchema,
  SubmitResponseGateActionPayloadSchema,
  GenerateCommanderReportActionPayloadSchema,
])
export type OntologyActionPayload = Readonly<z.infer<typeof OntologyActionPayloadSchema>>
