import { z } from "zod"
import {
  AgentErrorRecordSchema,
  AgentFindingSchema,
  AgentInputSchema,
  AgentOutputSchema,
  CorrectionRecordSchema,
  FacilityIncidentSchema,
  HumanDecisionSchema,
  ReportSchema,
} from "./agents"
import type { EventId } from "./primitives"
import {
  ISOTimeSchema,
  IncidentIdSchema,
  ReportIdSchema,
  ScenarioLabelSchema,
  TrackSessionIdSchema,
} from "./primitives"
import { MetadataSchema } from "./shared"
import { CameraGroupSchema, CameraTopologySchema, cameraEdgeKeys, cameraPairKey } from "./topology"
import { TrackSchema, TrackSessionSchema } from "./track"
import { ObservationSchema, SemanticEventSchema } from "./events"

const ReportWindowSchema = z
  .object({
    windowType: z.enum(["shift", "day", "week"]),
    startsAt: ISOTimeSchema,
    endsAt: ISOTimeSchema,
    reportId: ReportIdSchema,
  })
  .strict()
  .readonly()

export const SharedOperationalMemorySchema = z
  .object({
    cameraGroups: z.array(CameraGroupSchema).min(1).readonly(),
    activeTrackSessionIds: z.array(TrackSessionIdSchema).readonly(),
    incidentIds: z.array(IncidentIdSchema).readonly(),
    notes: z.array(z.string().min(1)).readonly(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type SharedOperationalMemory = Readonly<z.infer<typeof SharedOperationalMemorySchema>>

export const ScenarioFixtureBaseSchema = z
  .object({
    fixtureId: z.string().regex(/^scenario-[A-Za-z0-9-]+$/),
    generatedAt: ISOTimeSchema,
    scenarioLabels: z.array(ScenarioLabelSchema).min(1).readonly(),
    topology: CameraTopologySchema,
    sharedMemory: SharedOperationalMemorySchema,
    observations: z.array(ObservationSchema).readonly(),
    tracks: z.array(TrackSchema).readonly(),
    trackSessions: z.array(TrackSessionSchema).readonly(),
    semanticEvents: z.array(SemanticEventSchema).readonly(),
    agentInputs: z.array(AgentInputSchema).readonly(),
    agentOutputs: z.array(AgentOutputSchema).readonly(),
    agentFindings: z.array(AgentFindingSchema).readonly(),
    humanDecisions: z.array(HumanDecisionSchema).readonly(),
    facilityIncidents: z.array(FacilityIncidentSchema).readonly(),
    corrections: z.array(CorrectionRecordSchema).readonly(),
    agentErrors: z.array(AgentErrorRecordSchema).readonly(),
    reports: z.array(ReportSchema).readonly(),
    reportWindows: z.array(ReportWindowSchema).readonly(),
    timeline: z.array(SemanticEventSchema).readonly(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()

export type ScenarioFixtureBase = Readonly<z.infer<typeof ScenarioFixtureBaseSchema>>

export const collectEventIds = (fixture: ScenarioFixtureBase): readonly EventId[] => [
  ...fixture.observations.map((event) => event.eventId),
  ...fixture.semanticEvents.map((event) => event.eventId),
  ...fixture.agentInputs.map((event) => event.eventId),
  ...fixture.agentOutputs.map((event) => event.eventId),
  ...fixture.agentFindings.map((event) => event.eventId),
  ...fixture.humanDecisions.map((event) => event.eventId),
  ...fixture.corrections.map((event) => event.eventId),
  ...fixture.agentErrors.map((event) => event.eventId),
  ...fixture.reports.map((event) => event.eventId),
]

const addDuplicateEventIssues = (fixture: ScenarioFixtureBase, ctx: z.RefinementCtx): void => {
  const seen = new Set<string>()
  for (const eventId of collectEventIds(fixture)) {
    if (seen.has(eventId)) {
      ctx.addIssue({
        code: "custom",
        path: ["eventIds"],
        message: `duplicate event id: ${eventId}`,
      })
    }
    seen.add(eventId)
  }
}

const addTopologyIssues = (fixture: ScenarioFixtureBase, ctx: z.RefinementCtx): void => {
  const cameraIds = new Set(fixture.topology.cameras.map((camera) => camera.cameraId))
  const edgeKeys = cameraEdgeKeys(fixture.topology.edges)
  for (const edge of fixture.topology.edges) {
    if (!cameraIds.has(edge.fromCameraId) || !cameraIds.has(edge.toCameraId)) {
      ctx.addIssue({
        code: "custom",
        path: ["topology", "edges"],
        message: `topology edge references an unknown camera: ${edge.fromCameraId}->${edge.toCameraId}`,
      })
    }
  }
  for (const group of [...fixture.topology.cameraGroups, ...fixture.sharedMemory.cameraGroups]) {
    for (const cameraId of group.cameraIds) {
      if (!cameraIds.has(cameraId)) {
        ctx.addIssue({ code: "custom", path: ["cameraGroups"], message: `unknown camera: ${cameraId}` })
      }
    }
  }
  for (const event of fixture.semanticEvents.filter((item) => item.eventType === "camera_handoff")) {
    for (const [index, cameraId] of event.cameraIds.entries()) {
      const nextCameraId = event.cameraIds[index + 1]
      if (nextCameraId !== undefined && !edgeKeys.has(cameraPairKey(cameraId, nextCameraId))) {
        ctx.addIssue({
          code: "custom",
          path: ["semanticEvents", event.eventId],
          message: `missing topology edge for handoff ${cameraId}->${nextCameraId}`,
        })
      }
    }
  }
  for (const incident of fixture.facilityIncidents) {
    for (const [index, cameraId] of incident.correlation.cameraIds.entries()) {
      const nextCameraId = incident.correlation.cameraIds[index + 1]
      if (nextCameraId !== undefined && !edgeKeys.has(cameraPairKey(cameraId, nextCameraId))) {
        ctx.addIssue({
          code: "custom",
          path: ["facilityIncidents", incident.incidentId, "correlation"],
          message: `missing topology edge for correlated cameras ${cameraId}->${nextCameraId}`,
        })
      }
    }
  }
}

export const ScenarioFixtureSchema = ScenarioFixtureBaseSchema.superRefine((fixture, ctx) => {
  addDuplicateEventIssues(fixture, ctx)
  addTopologyIssues(fixture, ctx)
})
export type ScenarioFixture = Readonly<z.infer<typeof ScenarioFixtureSchema>>
