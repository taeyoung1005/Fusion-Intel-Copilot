import { describe, expect, it } from "vitest"
import type { Citation, EvidenceClip, Incident, ResponseGate } from "../cop/copData"
import type { WindowEntry } from "../cop/evidenceWindowSummary"
import { buildEvidenceRelationshipGraphFromOntology } from "./relationshipGraphAdapter"

const clip = {
  id: "ev-carla-vision-CARLA-01-3",
  camera: "CARLA-01",
  confidencePct: 88,
  detail: "person 88%",
  label: "DETR person",
  source: "vision",
  time: "09:44:11",
  tone: "alert",
} satisfies EvidenceClip

const incident = {
  id: "inc-CARLA-01",
  confidence: 88,
  meta: "CARLA gate camera",
  time: "09:44:11",
  title: "DETR person",
  tone: "watch",
  zone: "CARLA-01",
} satisfies Incident

const citation = {
  id: "cite-ev-carla-vision-CARLA-01-3",
  label: "CARLA-01 · DETR",
  time: "09:44:11",
} satisfies Citation

const responseGates = [
  { id: "gate-fact", label: "이벤트 사실 확인", initial: "PASS" },
  { id: "gate-data", label: "추가 데이터 검토", initial: "PENDING" },
] satisfies readonly ResponseGate[]

describe("buildEvidenceRelationshipGraphFromOntology", () => {
  it("preserves COP graph ids and labels when ontology links back the selected incident", () => {
    // Given: a real incident backed by evidence, a citation, a window entry, and response gates.
    const windowBuffer = new Map<string, readonly WindowEntry[]>([
      ["CARLA-01", [{ clip, observedAtMs: Date.parse("2026-06-30T00:00:14Z") }]],
    ])

    // When: the compatibility adapter derives the graph from ontology objects and links.
    const graph = buildEvidenceRelationshipGraphFromOntology({
      citations: [citation],
      evidence: [clip],
      incidents: [incident],
      responseGates,
      selectedIncidentId: incident.id,
      windowBuffer,
    })

    // Then: the RightRail-facing relationship graph contract stays stable.
    expect(graph.nodes.map((node) => `${node.kind}:${node.id}:${node.label}`)).toEqual([
      "incident:incident:inc-CARLA-01:inc-CARLA-01",
      "camera:camera:CARLA-01:CARLA-01",
      "track:track:CARLA-01:track-CARLA-01",
      "detection:detection:ev-carla-vision-CARLA-01-3:ev-carla-vision-CARLA-01-3",
      "citation:citation:cite-ev-carla-vision-CARLA-01-3:cite-ev-carla-vision-CARLA-01-3",
      "response:response:inc-CARLA-01:response-inc-CARLA-01",
    ])
    expect(graph.edges.map((edge) => `${edge.from}->${edge.to}:${edge.label}`)).toEqual([
      "incident:inc-CARLA-01->camera:CARLA-01:incident-camera",
      "camera:CARLA-01->track:CARLA-01:camera-track",
      "track:CARLA-01->detection:ev-carla-vision-CARLA-01-3:track-detection",
      "detection:ev-carla-vision-CARLA-01-3->citation:cite-ev-carla-vision-CARLA-01-3:detection-citation",
      "incident:inc-CARLA-01->response:inc-CARLA-01:incident-response",
    ])
  })

  it("does not fabricate graph nodes when an incident has no evidence links", () => {
    // Given: a real incident without evidence, citation, or ontology evidence links.
    const unsupportedIncident = {
      ...incident,
      id: "inc-CARLA-02",
      zone: "CARLA-02",
    } satisfies Incident

    // When: the adapter attempts to build the relationship graph.
    const graph = buildEvidenceRelationshipGraphFromOntology({
      citations: [],
      evidence: [],
      incidents: [unsupportedIncident],
      responseGates: [],
      selectedIncidentId: unsupportedIncident.id,
      windowBuffer: new Map(),
    })

    // Then: no incident, camera, track, response, or evidence nodes are invented.
    expect(graph).toEqual({ edges: [], nodes: [] })
  })
})
