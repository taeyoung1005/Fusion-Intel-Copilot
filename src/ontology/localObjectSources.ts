import type { EvidenceCitation, ScenarioFixture } from "../domain"
import type { LocalOntologyObject, LocalOntologyObjectInput } from "./localObjects"

type RuntimeActivityEvent = LocalOntologyObjectInput["activityEvents"][number]

type LocalOntologyObjectSourceInput = {
  readonly kind: LocalOntologyObject["kind"]
  readonly id: string
  readonly sourceType: string
  readonly sourceId: string
  readonly sourcePath: string
  readonly fixtureId?: string
  readonly parentId?: string
}

type ScenarioCitationSource = {
  readonly citationId: string
  readonly sourcePath: string
}

const ACTIVITY_EVENT_PARENT_DETAIL_KEYS = ["incidentId", "clipId", "cameraId"] as const

const objectFromSource = ({
  kind,
  id,
  sourceType,
  sourceId,
  sourcePath,
  fixtureId,
  parentId,
}: LocalOntologyObjectSourceInput): LocalOntologyObject => ({
  kind,
  id,
  sourceRef: {
    system: "d4d",
    sourceType,
    sourceId,
    sourcePath,
    ...(fixtureId !== undefined ? { fixtureId } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
  },
})

const scenarioObject = (
  scenario: ScenarioFixture,
  input: Omit<LocalOntologyObjectSourceInput, "fixtureId" | "parentId">,
): LocalOntologyObject => objectFromSource({ ...input, fixtureId: scenario.fixtureId })

const collectScenarioCitationSources = (
  scenario: ScenarioFixture,
): readonly ScenarioCitationSource[] => {
  const citations: ScenarioCitationSource[] = []
  const pushCitations = (sourcePath: string, entries: readonly EvidenceCitation[]): void => {
    for (const citation of entries) {
      citations.push({ citationId: citation.citationId, sourcePath })
    }
  }

  for (const finding of scenario.agentFindings) {
    pushCitations("scenario.agentFindings.citations", finding.citations)
  }
  for (const output of scenario.agentOutputs) {
    pushCitations("scenario.agentOutputs.citations", output.citations)
  }
  for (const decision of scenario.humanDecisions) {
    pushCitations("scenario.humanDecisions.citations", decision.citations)
  }
  for (const report of scenario.reports) {
    pushCitations("scenario.reports.citations", report.citations)
  }

  return citations
}

const parentIdFromActivityEvent = (event: RuntimeActivityEvent): string => {
  const detail = event.detail
  if (detail !== undefined) {
    for (const key of ACTIVITY_EVENT_PARENT_DETAIL_KEYS) {
      const value = detail[key]
      if (typeof value === "string" && value.length > 0) {
        return value
      }
    }
  }
  return event.source
}

export const createLocalOntologyObjectDrafts = (
  input: LocalOntologyObjectInput,
): readonly LocalOntologyObject[] => {
  const { scenario } = input
  const objects: LocalOntologyObject[] = [
    scenarioObject(scenario, {
      kind: "CameraTopology",
      id: `camera-topology:${scenario.topology.topologyId}`,
      sourceType: "CameraTopology",
      sourceId: scenario.topology.topologyId,
      sourcePath: "scenario.topology",
    }),
  ]

  for (const camera of scenario.topology.cameras) {
    objects.push(
      scenarioObject(scenario, {
        kind: "Camera",
        id: `camera:${camera.cameraId}`,
        sourceType: "Camera",
        sourceId: camera.cameraId,
        sourcePath: "scenario.topology.cameras",
      }),
    )
  }

  for (const group of scenario.topology.cameraGroups) {
    objects.push(
      scenarioObject(scenario, {
        kind: "CameraGroup",
        id: `camera-group:${group.groupId}`,
        sourceType: "CameraGroup",
        sourceId: group.groupId,
        sourcePath: "scenario.topology.cameraGroups",
      }),
    )
  }

  for (const observation of scenario.observations) {
    objects.push(
      scenarioObject(scenario, {
        kind: "Observation",
        id: `observation:${observation.eventId}`,
        sourceType: "Observation",
        sourceId: observation.eventId,
        sourcePath: "scenario.observations",
      }),
    )
  }

  for (const track of scenario.tracks) {
    objects.push(
      scenarioObject(scenario, {
        kind: "Track",
        id: `track:${track.trackId}`,
        sourceType: "Track",
        sourceId: track.trackId,
        sourcePath: "scenario.tracks",
      }),
    )
  }

  for (const session of scenario.trackSessions) {
    objects.push(
      scenarioObject(scenario, {
        kind: "TrackSession",
        id: `track-session:${session.sessionId}`,
        sourceType: "TrackSession",
        sourceId: session.sessionId,
        sourcePath: "scenario.trackSessions",
      }),
    )
  }

  for (const incident of scenario.facilityIncidents) {
    objects.push(
      scenarioObject(scenario, {
        kind: "Incident",
        id: `incident:${incident.incidentId}`,
        sourceType: "FacilityIncident",
        sourceId: incident.incidentId,
        sourcePath: "scenario.facilityIncidents",
      }),
    )
  }

  for (const incident of input.incidents) {
    objects.push(
      objectFromSource({
        kind: "Incident",
        id: `incident:${incident.id}`,
        sourceType: "Incident",
        sourceId: incident.id,
        sourcePath: "runtime.incidents",
        parentId: incident.zone,
      }),
    )
  }

  for (const clip of input.evidenceClips) {
    objects.push(
      objectFromSource({
        kind: "EvidenceClip",
        id: `evidence-clip:${clip.id}`,
        sourceType: "EvidenceClip",
        sourceId: clip.id,
        sourcePath: "runtime.evidenceClips",
        parentId: clip.camera,
      }),
    )
  }

  for (const gate of input.responseGates) {
    const sourceId = `${input.responseGateIncidentId}:${gate.id}`
    objects.push(
      objectFromSource({
        kind: "ResponseGate",
        id: `response-gate:${sourceId}`,
        sourceType: "ResponseGate",
        sourceId,
        sourcePath: "runtime.responseGates",
        parentId: input.responseGateIncidentId,
      }),
    )
  }

  const scenarioCitationIds = new Set<string>()
  for (const citation of collectScenarioCitationSources(scenario)) {
    if (scenarioCitationIds.has(citation.citationId)) {
      continue
    }
    scenarioCitationIds.add(citation.citationId)
    objects.push(
      scenarioObject(scenario, {
        kind: "Citation",
        id: `citation:${citation.citationId}`,
        sourceType: "Citation",
        sourceId: citation.citationId,
        sourcePath: citation.sourcePath,
      }),
    )
  }

  for (const citation of input.citations) {
    objects.push(
      objectFromSource({
        kind: "Citation",
        id: `citation:${citation.id}`,
        sourceType: "Citation",
        sourceId: citation.id,
        sourcePath: "runtime.citations",
        parentId: citation.id.startsWith("cite-") ? citation.id.slice("cite-".length) : citation.id,
      }),
    )
  }

  for (const [index, event] of input.activityEvents.entries()) {
    const sourceId = `${index}:${event.ts}:${event.source}:${event.stage}`
    objects.push(
      objectFromSource({
        kind: "ActivityEvent",
        id: `activity-event:${sourceId}`,
        sourceType: "ActivityEvent",
        sourceId,
        sourcePath: "runtime.activityEvents",
        parentId: parentIdFromActivityEvent(event),
      }),
    )
  }

  return objects
}
