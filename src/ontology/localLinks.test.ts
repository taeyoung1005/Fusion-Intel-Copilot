import { describe, expect, it } from "vitest"
import {
  type LocalOntologyLinkKind,
  type LocalOntologyObject,
  OntologyLinkError,
  type OntologyObjectRef,
  buildLocalOntologyLinkId,
  buildLocalOntologyLinks,
  refKey,
} from "./localLinks"

const ref = (objectType: OntologyObjectRef["objectType"], objectId: string): OntologyObjectRef => ({
  objectType,
  objectId,
})

const completeGraphObjects = (): readonly LocalOntologyObject[] => {
  const asset = ref("Asset", "asset-north-gate")
  const sensor = ref("Sensor", "camera-CARLA-01")
  const observation = ref("Observation", "obs-CARLA-01-094411")
  const track = ref("Track", "track-CARLA-01")
  const incident = ref("Incident", "inc-CARLA-01")
  const evidence = ref("EvidenceClip", "ev-carla-vision-CARLA-01-3")
  const citation = ref("Citation", "cite-ev-carla-vision-CARLA-01-3")
  const assessment = ref("Assessment", "assessment-inc-CARLA-01")
  const gate = ref("ResponseGate", "gate-inc-CARLA-01")
  const report = ref("CommanderReport", "report-shift-2026-07-04")

  return [
    { ref: asset },
    { ref: sensor, relations: { assetRef: asset } },
    { ref: observation, relations: { sensorRef: sensor, trackRef: track } },
    { ref: track, relations: { incidentRef: incident } },
    {
      ref: incident,
      relations: {
        evidenceRefs: [evidence],
        assessmentRefs: [assessment],
        responseGateRefs: [gate],
      },
    },
    { ref: evidence, relations: { citationRefs: [citation] } },
    { ref: citation },
    { ref: assessment },
    { ref: gate, relations: { reportRef: report } },
    { ref: report, relations: { incidentRefs: [incident], assetRefs: [asset] } },
  ]
}

describe("buildLocalOntologyLinks", () => {
  it("creates the expected canonical link kinds when a complete ontology graph is provided", () => {
    // Given
    const objects = completeGraphObjects()

    // When
    const links = buildLocalOntologyLinks(objects)

    // Then
    const expectedKinds: readonly LocalOntologyLinkKind[] = [
      "asset_has_sensor",
      "sensor_observed_observation",
      "observation_supports_track",
      "track_raised_incident",
      "incident_has_evidence",
      "evidence_has_citation",
      "incident_has_assessment",
      "incident_has_response_gate",
      "response_gate_included_in_report",
      "report_summarizes_incident",
      "report_mentions_asset",
    ]
    expect(links.map((link) => link.kind)).toEqual(expectedKinds)
  })

  it("uses deterministic link IDs when the same ontology refs are linked", () => {
    // Given
    const objects = completeGraphObjects()
    const sensor = ref("Sensor", "camera-CARLA-01")
    const observation = ref("Observation", "obs-CARLA-01-094411")

    // When
    const firstRun = buildLocalOntologyLinks(objects)
    const secondRun = buildLocalOntologyLinks(objects)

    // Then
    expect(firstRun.map((link) => link.id)).toEqual(secondRun.map((link) => link.id))
    expect(firstRun[1]?.id).toBe(
      buildLocalOntologyLinkId("sensor_observed_observation", sensor, observation),
    )
    expect(firstRun[1]?.id).toBe(
      "sensor_observed_observation:Sensor:camera-CARLA-01->Observation:obs-CARLA-01-094411",
    )
  })

  it("rejects dangling links by requiring every from and to ref to exist in the same graph", () => {
    // Given
    const graphRefs = new Set(completeGraphObjects().map((object) => refKey(object.ref)))

    // When
    const links = buildLocalOntologyLinks(completeGraphObjects())

    // Then
    expect(links).toHaveLength(11)
    expect(
      links.filter((link) => !graphRefs.has(refKey(link.from)) || !graphRefs.has(refKey(link.to))),
    ).toEqual([])
  })

  it("fails explicitly when a required endpoint is missing from the ontology object graph", () => {
    // Given
    const objectsWithoutSensor = completeGraphObjects().filter(
      (object) => object.ref.objectType !== "Sensor",
    )

    // When
    const buildWithoutSensor = (): void => {
      buildLocalOntologyLinks(objectsWithoutSensor)
    }

    // Then
    expect(buildWithoutSensor).toThrow(OntologyLinkError)
    expect(buildWithoutSensor).toThrow(/missing endpoint.*Sensor:camera-CARLA-01/)
  })
})
