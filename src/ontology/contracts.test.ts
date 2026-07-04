import { describe, expect, it } from "vitest"
import {
  ONTOLOGY_ACTION_TYPES,
  ONTOLOGY_LINK_TYPES,
  ONTOLOGY_OBJECT_TYPES,
  OntologyActionPayloadSchema,
  OntologyActionTypeSchema,
  OntologyLinkPayloadSchema,
  OntologyObjectPayloadSchema,
  OntologyObjectTypeSchema,
} from "./contracts"

const capturedAt = "2026-07-04T00:00:00.000Z"

describe("ontology contract schemas", () => {
  it("parses every canonical object payload when the object ids match their kind", () => {
    // Given: one valid payload for every canonical ontology object type.
    const payloads: readonly unknown[] = [
      {
        objectType: "Sensor",
        objectId: "camera-A",
        properties: {
          label: "North road camera",
          zone: "구역 Alpha",
          status: "online",
        },
      },
      {
        objectType: "SensorGroup",
        objectId: "group-road",
        properties: {
          label: "Road approach",
          sensorIds: ["camera-A", "camera-B"],
          purpose: "handoff corridor",
        },
      },
      {
        objectType: "Observation",
        objectId: "obs-road-001",
        properties: {
          observedAt: capturedAt,
          sensorId: "camera-A",
          objectLabel: "person",
          confidence: 0.86,
          distanceBand: "30m",
          summary: "road approach observed",
        },
      },
      {
        objectType: "Track",
        objectId: "track-road-001",
        properties: {
          sensorId: "camera-A",
          firstSeen: capturedAt,
          lastSeen: capturedAt,
          confidence: 0.82,
          observationIds: ["obs-road-001"],
          summary: "single pedestrian track",
        },
      },
      {
        objectType: "TrackSession",
        objectId: "session-road-001",
        properties: {
          trackIds: ["track-road-001"],
          sensorIds: ["camera-A", "camera-B"],
          startedAt: capturedAt,
          currentStage: "watch",
          summary: "camera handoff review",
        },
      },
      {
        objectType: "Incident",
        objectId: "incident-road-001",
        properties: {
          openedAt: capturedAt,
          stage: "commander_review",
          sensorIds: ["camera-A", "camera-B"],
          trackSessionIds: ["session-road-001"],
          eventIds: ["obs-road-001"],
          summary: "restricted road approach",
        },
      },
      {
        objectType: "EvidenceClip",
        objectId: "evidence-road-001",
        properties: {
          capturedAt,
          sensorId: "camera-A",
          label: "person approaching",
          source: "vision",
          confidence: 0.9,
          uri: "local://evidence-road-001",
        },
      },
      {
        objectType: "Citation",
        objectId: "cite-road-001",
        properties: {
          label: "CAM-A frame 001",
          citedAt: capturedAt,
          evidenceClipId: "evidence-road-001",
        },
      },
      {
        objectType: "Assessment",
        objectId: "assessment-road-001",
        properties: {
          incidentId: "incident-road-001",
          assessedAt: capturedAt,
          assessor: "agent-watch",
          finding: "needs_human_review",
          confidence: 0.76,
          citationIds: ["cite-road-001"],
          summary: "operator review required",
        },
      },
      {
        objectType: "ResponseGate",
        objectId: "gate-road-001",
        properties: {
          incidentId: "incident-road-001",
          label: "상황 평가 완료",
          status: "PENDING",
        },
      },
      {
        objectType: "CommanderReport",
        objectId: "report-road-001",
        properties: {
          incidentId: "incident-road-001",
          generatedAt: capturedAt,
          title: "Road handoff report",
          summary: "restricted approach reviewed",
          citationIds: ["cite-road-001"],
        },
      },
      {
        objectType: "Asset",
        objectId: "asset-road-001",
        properties: {
          label: "Road gate",
          assetType: "perimeter_zone",
          zone: "구역 Alpha",
        },
      },
    ]

    // When: every payload is parsed through the boundary schema.
    const parsed = payloads.map((payload) => OntologyObjectPayloadSchema.parse(payload))

    // Then: the canonical object list is represented exactly once.
    expect(parsed.map((payload) => payload.objectType)).toEqual(ONTOLOGY_OBJECT_TYPES)
  })

  it("parses every canonical link payload when endpoints match the link type", () => {
    // Given: one valid payload for every canonical ontology link type.
    const payloads: readonly unknown[] = [
      {
        linkType: "sensor_observed_observation",
        linkId: "link-sensor-observed-observation-001",
        from: { objectType: "Sensor", objectId: "camera-A" },
        to: { objectType: "Observation", objectId: "obs-road-001" },
        properties: { observedAt: capturedAt },
      },
      {
        linkType: "observation_supports_track",
        linkId: "link-observation-supports-track-001",
        from: { objectType: "Observation", objectId: "obs-road-001" },
        to: { objectType: "Track", objectId: "track-road-001" },
        properties: { confidence: 0.82 },
      },
      {
        linkType: "track_raised_incident",
        linkId: "link-track-raised-incident-001",
        from: { objectType: "Track", objectId: "track-road-001" },
        to: { objectType: "Incident", objectId: "incident-road-001" },
      },
      {
        linkType: "incident_has_evidence",
        linkId: "link-incident-has-evidence-001",
        from: { objectType: "Incident", objectId: "incident-road-001" },
        to: { objectType: "EvidenceClip", objectId: "evidence-road-001" },
      },
      {
        linkType: "incident_has_assessment",
        linkId: "link-incident-has-assessment-001",
        from: { objectType: "Incident", objectId: "incident-road-001" },
        to: { objectType: "Assessment", objectId: "assessment-road-001" },
      },
      {
        linkType: "incident_has_response_gate",
        linkId: "link-incident-has-response-gate-001",
        from: { objectType: "Incident", objectId: "incident-road-001" },
        to: { objectType: "ResponseGate", objectId: "gate-road-001" },
      },
      {
        linkType: "report_summarizes_incident",
        linkId: "link-report-summarizes-incident-001",
        from: { objectType: "CommanderReport", objectId: "report-road-001" },
        to: { objectType: "Incident", objectId: "incident-road-001" },
      },
    ]

    // When: every link is parsed through the boundary schema.
    const parsed = payloads.map((payload) => OntologyLinkPayloadSchema.parse(payload))

    // Then: the canonical link list is represented exactly once.
    expect(parsed.map((payload) => payload.linkType)).toEqual(ONTOLOGY_LINK_TYPES)
  })

  it("parses every canonical action payload", () => {
    // Given: one local payload for every canonical action type.
    const payloads: readonly unknown[] = [
      {
        actionType: "recordAssessment",
        actionId: "action-record-assessment-001",
        target: { objectType: "Incident", objectId: "incident-road-001" },
        input: {
          assessmentId: "assessment-road-001",
          assessedAt: capturedAt,
          assessor: "agent-watch",
          finding: "needs_human_review",
          confidence: 0.76,
          citationIds: ["cite-road-001"],
          summary: "operator review required",
        },
      },
      {
        actionType: "submitResponseGate",
        actionId: "action-submit-response-gate-001",
        target: { objectType: "ResponseGate", objectId: "gate-road-001" },
        input: {
          submittedAt: capturedAt,
          submittedBy: "operator-east",
          status: "PASS",
          rationale: "facts checked",
        },
      },
      {
        actionType: "generateCommanderReport",
        actionId: "action-generate-commander-report-001",
        target: { objectType: "Incident", objectId: "incident-road-001" },
        input: {
          reportId: "report-road-001",
          generatedAt: capturedAt,
          title: "Road handoff report",
          summary: "restricted approach reviewed",
          citationIds: ["cite-road-001"],
        },
      },
    ]

    // When: every action is parsed through the boundary schema.
    const parsed = payloads.map((payload) => OntologyActionPayloadSchema.parse(payload))

    // Then: the canonical action list is represented exactly once.
    expect(parsed.map((payload) => payload.actionType)).toEqual(ONTOLOGY_ACTION_TYPES)
  })

  it("rejects object ids that do not match the object kind", () => {
    // Given: a Sensor payload with an Incident-shaped id.
    const payload = {
      objectType: "Sensor",
      objectId: "incident-road-001",
      properties: {
        label: "North road camera",
        zone: "구역 Alpha",
        status: "online",
      },
    }

    // When: the payload is parsed.
    const result = OntologyObjectPayloadSchema.safeParse(payload)

    // Then: validation rejects the mismatched branded id.
    expect(result.success).toBe(false)
  })

  it("rejects link endpoints that do not match the canonical link definition", () => {
    // Given: a sensor_observed_observation link pointing at a Track instead of an Observation.
    const payload = {
      linkType: "sensor_observed_observation",
      linkId: "link-sensor-observed-observation-001",
      from: { objectType: "Sensor", objectId: "camera-A" },
      to: { objectType: "Track", objectId: "track-road-001" },
    }

    // When: the payload is parsed.
    const result = OntologyLinkPayloadSchema.safeParse(payload)

    // Then: validation rejects the wrong endpoint pair.
    expect(result.success).toBe(false)
  })

  it("rejects unknown object and action names", () => {
    // Given: object and action names outside the canonical contract.
    const unknownObjectName = "UnknownObject"
    const unknownActionName = "unknownAction"

    // When: each name is parsed by its canonical name schema.
    const objectResult = OntologyObjectTypeSchema.safeParse(unknownObjectName)
    const actionResult = OntologyActionTypeSchema.safeParse(unknownActionName)

    // Then: both names are rejected.
    expect(objectResult.success).toBe(false)
    expect(actionResult.success).toBe(false)
  })
})
