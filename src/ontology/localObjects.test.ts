import { describe, expect, it } from "vitest"
import type { ActivityEvent } from "../activityEvents"
import type { EvidenceClip } from "../cop/copData"
import { buildCitations, buildIncidents, buildResponseGates } from "../cop/operationalTelemetry"
import { type ScenarioFixture, ScenarioFixtureSchema } from "../domain"
import { syntheticDayScenario } from "../fixtures/syntheticDay"
import {
  DuplicateOntologyObjectIdError,
  type LocalOntologyObject,
  LocalOntologyObjectArraySchema,
  type LocalOntologyObjectInput,
  buildLocalOntologyObjects,
} from "./localObjects"

const runtimeEvidenceClips = [
  {
    id: "clip-road-handoff-001",
    time: "08:00:02",
    camera: "camera-B",
    tone: "watch",
    label: "Synthetic road A/B handoff evidence",
    detail: "DETR 91%",
    source: "vision",
    confidencePct: 91,
  },
  {
    id: "clip-depot-repeat-001",
    time: "12:30:04",
    camera: "camera-E",
    tone: "alert",
    label: "Synthetic depot repeated appearance evidence",
    detail: "DETR 86%",
    source: "vision",
    confidencePct: 86,
  },
] satisfies readonly EvidenceClip[]

const runtimeActivityEvents = [
  {
    ts: "2026-06-29T08:00:02.000Z",
    source: "vision",
    stage: "detr.detected",
    level: "watch",
    message: "Synthetic road handoff detection emitted.",
    detail: { cameraId: "camera-B", clipId: "clip-road-handoff-001" },
  },
  {
    ts: "2026-06-29T12:30:04.000Z",
    source: "codex",
    stage: "incident.review",
    level: "warn",
    message: "Synthetic depot repeat routed for review.",
    detail: { incidentId: "incident-ammo-repeat-001" },
  },
] satisfies readonly ActivityEvent[]

const requireIncident = (
  incidents: readonly ReturnType<typeof buildIncidents>[number][],
  incidentId: string,
): ReturnType<typeof buildIncidents>[number] => {
  const incident = incidents.find((entry) => entry.id === incidentId)
  if (incident === undefined) {
    throw new Error(`missing incident fixture: ${incidentId}`)
  }
  return incident
}

const scenarioCitationIds = (scenario: ScenarioFixture): ReadonlySet<string> =>
  new Set([
    ...scenario.agentFindings.flatMap((finding) =>
      finding.citations.map((citation) => citation.citationId),
    ),
    ...scenario.agentOutputs.flatMap((output) =>
      output.citations.map((citation) => citation.citationId),
    ),
    ...scenario.humanDecisions.flatMap((decision) =>
      decision.citations.map((citation) => citation.citationId),
    ),
    ...scenario.reports.flatMap((report) =>
      report.citations.map((citation) => citation.citationId),
    ),
  ])

const countKind = (
  objects: readonly LocalOntologyObject[],
  kind: LocalOntologyObject["kind"],
): number => objects.filter((object) => object.kind === kind).length

const adapterInput = (): LocalOntologyObjectInput => {
  const scenario = ScenarioFixtureSchema.parse(syntheticDayScenario)
  const incidents = buildIncidents([], runtimeEvidenceClips)
  const selectedIncident = requireIncident(incidents, "inc-camera-E")
  return {
    scenario,
    evidenceClips: runtimeEvidenceClips,
    incidents,
    responseGateIncidentId: selectedIncident.id,
    responseGates: buildResponseGates(selectedIncident, runtimeEvidenceClips, []),
    citations: buildCitations(runtimeEvidenceClips),
    activityEvents: runtimeActivityEvents,
  }
}

describe("buildLocalOntologyObjects", () => {
  it("converts every supported D4D entity when given the parsed synthetic day fixture", () => {
    // Given: the deterministic scenario fixture plus runtime COP panel inputs.
    const input = adapterInput()
    const scenario = input.scenario

    // When: the adapter maps D4D data into local ontology objects.
    const objects = LocalOntologyObjectArraySchema.parse(buildLocalOntologyObjects(input))

    // Then: every Todo 2 entity family is present with traceable source refs.
    expect(countKind(objects, "CameraTopology")).toBe(1)
    expect(countKind(objects, "Camera")).toBe(scenario.topology.cameras.length)
    expect(countKind(objects, "CameraGroup")).toBe(scenario.topology.cameraGroups.length)
    expect(countKind(objects, "Observation")).toBe(scenario.observations.length)
    expect(countKind(objects, "Track")).toBe(scenario.tracks.length)
    expect(countKind(objects, "TrackSession")).toBe(scenario.trackSessions.length)
    expect(countKind(objects, "Incident")).toBe(
      scenario.facilityIncidents.length + input.incidents.length,
    )
    expect(countKind(objects, "EvidenceClip")).toBe(input.evidenceClips.length)
    expect(countKind(objects, "ResponseGate")).toBe(input.responseGates.length)
    expect(countKind(objects, "Citation")).toBe(
      scenarioCitationIds(scenario).size + input.citations.length,
    )
    expect(countKind(objects, "ActivityEvent")).toBe(input.activityEvents.length)

    expect(objects.find((object) => object.id === "camera:camera-A")?.sourceRef).toMatchObject({
      system: "d4d",
      sourceType: "Camera",
      sourceId: "camera-A",
      sourcePath: "scenario.topology.cameras",
      fixtureId: scenario.fixtureId,
    })
    expect(
      objects.find((object) => object.id === "response-gate:inc-camera-E:gate-data")?.sourceRef,
    ).toMatchObject({
      system: "d4d",
      sourceType: "ResponseGate",
      sourceId: "inc-camera-E:gate-data",
      sourcePath: "runtime.responseGates",
      parentId: "inc-camera-E",
    })
  })

  it("returns deterministically sorted ontology objects for the same input", () => {
    // Given: the same parsed scenario and runtime data.
    const input = adapterInput()

    // When: callers build the ontology object list more than once.
    const firstIds = buildLocalOntologyObjects(input).map((object) => object.id)
    const secondIds = buildLocalOntologyObjects(input).map((object) => object.id)

    // Then: the output order is stable and lexically sorted by ontology id.
    expect(secondIds).toEqual(firstIds)
    expect(firstIds).toEqual([...firstIds].sort((left, right) => left.localeCompare(right)))
  })

  it("rejects duplicate ontology IDs with a typed duplicate error", () => {
    // Given: two runtime evidence clips that intentionally map to the same ontology id.
    const input = adapterInput()
    const duplicateEvidence = [
      input.evidenceClips[0],
      {
        ...input.evidenceClips[0],
        label: "Duplicate source id should be rejected.",
      },
    ]

    // When/Then: duplicate ontology ids are explicitly refused.
    expect(() =>
      buildLocalOntologyObjects({
        ...input,
        evidenceClips: duplicateEvidence,
      }),
    ).toThrow(DuplicateOntologyObjectIdError)
  })

  it("does not mutate source fixtures or runtime inputs", () => {
    // Given: source objects cloned before adapter execution.
    const input = adapterInput()
    const before = structuredClone(input)

    // When: the ontology objects are built.
    buildLocalOntologyObjects(input)

    // Then: the original parsed fixture and runtime arrays remain unchanged.
    expect(input).toEqual(before)
    expect(syntheticDayScenario).toEqual(before.scenario)
  })
})
