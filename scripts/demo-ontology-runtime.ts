import type { ActivityEvent } from "../src/activityEvents.ts"
import type { Citation, EvidenceClip, Incident, ResponseGate } from "../src/cop/copData.ts"
import {
  buildCitations,
  buildDailyReportPeriod,
  buildDailyReportRows,
  buildIncidents,
  buildResponseGates,
} from "../src/cop/operationalTelemetry.ts"
import type { ScenarioFixture } from "../src/domain/index.ts"
import {
  generateCommanderReport,
  localOntologyActions,
  recordAssessment,
  submitResponseGate,
} from "../src/ontology/actions.ts"
import type { OntologyObjectRef } from "../src/ontology/localLinks.ts"
import {
  type LocalOntologyObject as SourceOntologyObject,
  buildLocalOntologyObjects,
} from "../src/ontology/localObjects.ts"
import { graphObjectsFromRuntime } from "./demo-ontology-graph.ts"

export type RuntimeOntologyInput = {
  readonly evidenceClips: readonly EvidenceClip[]
  readonly incidents: readonly Incident[]
  readonly citations: readonly Citation[]
  readonly responseGates: readonly ResponseGate[]
  readonly activityEvents: readonly ActivityEvent[]
  readonly selectedIncident: Incident
}

export type ExecutedActions = {
  readonly assessmentRef: OntologyObjectRef
  readonly responseGateRef: OntologyObjectRef
  readonly reportRef: OntologyObjectRef
}

export type DemoOntologyGraph = {
  readonly fixture: ScenarioFixture
  readonly sourceObjects: readonly SourceOntologyObject[]
  readonly graphObjects: ReturnType<typeof graphObjectsFromRuntime>
  readonly actionTypes: readonly string[]
}

export class DemoOntologyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DemoOntologyError"
  }
}

const ref = (objectType: OntologyObjectRef["objectType"], objectId: string): OntologyObjectRef => ({
  objectType,
  objectId,
})

const clockFromIso = (isoTime: string): string => {
  const timeStart = isoTime.indexOf("T") + 1
  return isoTime.slice(timeStart, timeStart + 8)
}

const evidenceTone = (
  observation: ScenarioFixture["observations"][number],
): EvidenceClip["tone"] => (observation.distanceBand === "10m" ? "alert" : "watch")

const buildEvidenceClips = (fixture: ScenarioFixture): readonly EvidenceClip[] =>
  fixture.observations.map((observation) => ({
    id: observation.eventId,
    time: clockFromIso(observation.simTime),
    camera: observation.cameraId,
    tone: evidenceTone(observation),
    label: observation.objectLabel,
    detail: `${Math.round(observation.confidence * 100)}% ${observation.distanceBand ?? "range-unknown"}`,
    source: "vision",
    confidencePct: Math.round(observation.confidence * 100),
  }))

const buildActivityEvents = (fixture: ScenarioFixture): readonly ActivityEvent[] =>
  fixture.observations.map((observation) => ({
    ts: observation.simTime,
    source: "vision",
    stage: `ontology.${observation.distanceBand ?? "observation"}`,
    level: observation.distanceBand === "10m" ? "warn" : "watch",
    message: observation.summary ?? observation.objectLabel,
    detail: { cameraId: observation.cameraId, clipId: observation.eventId },
  }))

const requireSelectedIncident = (incidents: readonly Incident[]): Incident => {
  const selected = incidents.find((incident) => incident.id !== "inc-standby")
  if (selected === undefined) {
    throw new DemoOntologyError("synthetic ontology demo has no incident with evidence")
  }
  return selected
}

const requirePendingGate = (responseGates: readonly ResponseGate[]): ResponseGate => {
  const gate = responseGates.find((entry) => entry.initial === "PENDING")
  if (gate === undefined) {
    throw new DemoOntologyError("synthetic ontology demo has no pending response gate")
  }
  return gate
}

const buildRuntimeOntologyInput = (fixture: ScenarioFixture): RuntimeOntologyInput => {
  const evidenceClips = buildEvidenceClips(fixture)
  const incidents = buildIncidents([], evidenceClips)
  const selectedIncident = requireSelectedIncident(incidents)
  return {
    evidenceClips,
    incidents,
    selectedIncident,
    responseGates: buildResponseGates(selectedIncident, evidenceClips, []),
    citations: buildCitations(evidenceClips),
    activityEvents: buildActivityEvents(fixture),
  }
}

const executeLocalActions = (
  fixture: ScenarioFixture,
  runtime: RuntimeOntologyInput,
): ExecutedActions => {
  const citation = runtime.citations[0]
  if (citation === undefined) {
    throw new DemoOntologyError("synthetic ontology demo has no citation")
  }
  const pendingGate = requirePendingGate(runtime.responseGates)
  const incidentRef = ref("Incident", runtime.selectedIncident.id)
  const citationRef = ref("Citation", citation.id)
  const gateRef = ref("ResponseGate", pendingGate.id)
  const assessedAt = fixture.observations[0]?.simTime ?? fixture.generatedAt
  const assessment = recordAssessment({
    assessmentId: `assessment-${runtime.selectedIncident.id}`,
    incidentRef,
    assessedAt,
    assessedBy: "demo-ontology",
    outcome: "needs_human_review",
    confidence: runtime.selectedIncident.confidence / 100,
    rationale: "Synthetic fixture evidence requires an operator review checkpoint.",
    citationRefs: [citationRef],
  })
  const gate = submitResponseGate({
    gateRef,
    incidentRef,
    currentStatus: pendingGate.initial,
    nextStatus: "PASS",
    submittedAt: assessedAt,
    submittedBy: "demo-ontology",
    rationale: "Synthetic fixture evidence and citations were linked locally.",
    citationRefs: [citationRef],
  })
  const report = generateCommanderReport({
    reportId: "report-local-ontology-demo",
    incidentRefs: [incidentRef],
    citationRefs: [citationRef],
    assessmentRefs: [assessment.assessment.ref],
    gateRefs: [gate.gate.ref],
    generatedAt: fixture.generatedAt,
    title: "Local Ontology Demo Report",
    summary: "Synthetic day fixture projected into local ontology objects, links, and actions.",
    period: buildDailyReportPeriod(runtime.evidenceClips),
    rows: buildDailyReportRows(runtime.evidenceClips),
  })
  return {
    assessmentRef: assessment.assessment.ref,
    responseGateRef: gate.gate.ref,
    reportRef: report.report.ref,
  }
}

export const buildDemoOntologyGraph = (fixture: ScenarioFixture): DemoOntologyGraph => {
  const runtime = buildRuntimeOntologyInput(fixture)
  const sourceObjects = buildLocalOntologyObjects({
    scenario: fixture,
    evidenceClips: runtime.evidenceClips,
    incidents: runtime.incidents,
    responseGateIncidentId: runtime.selectedIncident.id,
    responseGates: runtime.responseGates,
    citations: runtime.citations,
    activityEvents: runtime.activityEvents,
  })
  return {
    fixture,
    sourceObjects,
    graphObjects: graphObjectsFromRuntime(fixture, runtime, executeLocalActions(fixture, runtime)),
    actionTypes: localOntologyActions.map((action) => action.actionType),
  }
}
