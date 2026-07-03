import { z } from "zod"
import {
  ALERT_STAGES,
  CAMERA_GROUP_IDS,
  CAMERA_IDS,
  CAMERA_ZONES,
  DISTANCE_BANDS,
  REPORT_WINDOW_TYPES,
  SCENARIO_LABELS,
  SEMANTIC_EVENT_TYPES,
  TRACK_SESSION_STATES,
} from "./constants"

export const CameraIdSchema = z.enum(CAMERA_IDS).brand("CameraId")
export type CameraId = z.infer<typeof CameraIdSchema>

export const CameraGroupIdSchema = z.enum(CAMERA_GROUP_IDS).brand("CameraGroupId")
export type CameraGroupId = z.infer<typeof CameraGroupIdSchema>

export const EventIdSchema = z
  .string()
  .regex(/^(obs|evt|agent|human|report|correction|error)-[A-Za-z0-9-]+$/)
  .brand("EventId")
export type EventId = z.infer<typeof EventIdSchema>

export const TrackIdSchema = z.string().regex(/^track-[A-Za-z0-9-]+$/).brand("TrackId")
export type TrackId = z.infer<typeof TrackIdSchema>

export const TrackSessionIdSchema = z
  .string()
  .regex(/^session-[A-Za-z0-9-]+$/)
  .brand("TrackSessionId")
export type TrackSessionId = z.infer<typeof TrackSessionIdSchema>

export const IncidentIdSchema = z.string().regex(/^incident-[A-Za-z0-9-]+$/).brand("IncidentId")
export type IncidentId = z.infer<typeof IncidentIdSchema>

export const CitationIdSchema = z.string().regex(/^cite-[A-Za-z0-9-]+$/).brand("CitationId")
export type CitationId = z.infer<typeof CitationIdSchema>

export const ReportIdSchema = z.string().regex(/^report-[A-Za-z0-9-]+$/).brand("ReportId")
export type ReportId = z.infer<typeof ReportIdSchema>

export const AgentIdSchema = z.string().regex(/^agent-[A-Za-z0-9-]+$/).brand("AgentId")
export type AgentId = z.infer<typeof AgentIdSchema>

export const ISOTimeSchema = z.string().datetime({ offset: true }).brand("ISOTime")
export type ISOTime = z.infer<typeof ISOTimeSchema>

export const AlertStageSchema = z.enum(ALERT_STAGES)
export type AlertStage = z.infer<typeof AlertStageSchema>

export const CameraZoneSchema = z.enum(CAMERA_ZONES)
export type CameraZone = z.infer<typeof CameraZoneSchema>

export const DistanceBandSchema = z.enum(DISTANCE_BANDS)
export type DistanceBand = z.infer<typeof DistanceBandSchema>

export const TrackSessionStateSchema = z.enum(TRACK_SESSION_STATES)
export type TrackSessionState = z.infer<typeof TrackSessionStateSchema>

export const SemanticEventTypeSchema = z.enum(SEMANTIC_EVENT_TYPES)
export type SemanticEventType = z.infer<typeof SemanticEventTypeSchema>

export const ReportWindowTypeSchema = z.enum(REPORT_WINDOW_TYPES)
export type ReportWindowType = z.infer<typeof ReportWindowTypeSchema>

export const ScenarioLabelSchema = z.enum(SCENARIO_LABELS)
export type ScenarioLabel = z.infer<typeof ScenarioLabelSchema>
