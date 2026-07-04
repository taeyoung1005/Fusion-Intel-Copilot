import type { AlertTone, EvidenceClip, Incident } from "../cop/copData"
import type { WindowEntry } from "../cop/evidenceWindowSummary"
import type {
  EvidenceRelationshipGraph,
  EvidenceRelationshipGraphInput,
  RelationshipGraphEdge,
  RelationshipGraphNode,
  RelationshipGraphNodeKind,
} from "../cop/relationshipGraph"
import type { OntologyObjectRef } from "./localLinks"
import {
  buildRelationshipGraphOntology,
  citationForClip,
  hasOntologyLink,
  isRealIncident,
  latestClipFirst,
  ref,
} from "./relationshipGraphOntology"

const SOURCE_LABEL: Record<EvidenceClip["source"], string> = {
  mobile: "UPLINK",
  vision: "DETR",
  correlation: "CORR",
} as const

const incidentTone = (incident: Incident): AlertTone =>
  incident.tone === "WATCH" ? "watch" : "normal"

const graphId = (kind: RelationshipGraphNodeKind, id: string): string => `${kind}:${id}`

const edgeId = (from: string, to: string): string => `${from}->${to}`

const trackDetail = (
  cameraId: string,
  clips: readonly EvidenceClip[],
  entries: readonly WindowEntry[] | undefined,
): string => {
  const firstTime = entries?.[0]?.clip.time ?? clips.at(-1)?.time ?? "--:--:--"
  const lastTime = entries?.at(-1)?.clip.time ?? clips[0]?.time ?? "--:--:--"
  const count = entries?.length ?? clips.length
  return `${cameraId} · ${count}건 · ${firstTime}~${lastTime}`
}

const addNode = (
  nodes: RelationshipGraphNode[],
  seenNodes: Set<string>,
  node: RelationshipGraphNode,
): void => {
  if (seenNodes.has(node.id)) {
    return
  }
  seenNodes.add(node.id)
  nodes.push(node)
}

const addEdge = (
  edges: RelationshipGraphEdge[],
  seenEdges: Set<string>,
  from: string,
  to: string,
  label: string,
): void => {
  const id = edgeId(from, to)
  if (seenEdges.has(id)) {
    return
  }
  seenEdges.add(id)
  edges.push({ id, from, to, label })
}

const hasCameraTrackPath = (
  links: Parameters<typeof hasOntologyLink>[0],
  sensorRef: OntologyObjectRef,
  observationRef: OntologyObjectRef,
  trackRef: OntologyObjectRef,
): boolean =>
  hasOntologyLink(links, "sensor_observed_observation", sensorRef, observationRef) &&
  hasOntologyLink(links, "observation_supports_track", observationRef, trackRef)

export const buildEvidenceRelationshipGraphFromOntology = (
  input: EvidenceRelationshipGraphInput,
): EvidenceRelationshipGraph => {
  const { incidents, citations, evidence, windowBuffer, responseGates, selectedIncidentId } = input
  if (evidence.length === 0 || incidents.every((incident) => !isRealIncident(incident))) {
    return { nodes: [], edges: [] }
  }

  const ontology = buildRelationshipGraphOntology(input)
  const links = ontology.links
  const groupedEvidence = ontology.evidenceByCamera
  const nodes: RelationshipGraphNode[] = []
  const edges: RelationshipGraphEdge[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()

  for (const incident of incidents) {
    if (!isRealIncident(incident)) {
      continue
    }
    const clips = latestClipFirst(groupedEvidence.get(incident.zone) ?? [])
    const firstClip = clips[0]
    if (firstClip === undefined) {
      continue
    }

    const incidentRef = ref("Incident", incident.id)
    const sensorRef = ref("Sensor", incident.zone)
    const trackRef = ref("Track", incident.zone)
    const firstObservationRef = ref("Observation", firstClip.id)
    if (!hasCameraTrackPath(links, sensorRef, firstObservationRef, trackRef)) {
      continue
    }

    const incidentId = graphId("incident", incident.id)
    const cameraId = graphId("camera", incident.zone)
    const trackId = graphId("track", incident.zone)
    addNode(nodes, seenNodes, {
      id: incidentId,
      kind: "incident",
      label: incident.id,
      detail: `${incident.time} · ${incident.title}`,
      tone: incidentTone(incident),
      incidentId: incident.id,
      cameraId: incident.zone,
    })
    addNode(nodes, seenNodes, {
      id: cameraId,
      kind: "camera",
      label: incident.zone,
      detail: incident.meta,
      tone: incidentTone(incident),
      incidentId: incident.id,
      cameraId: incident.zone,
    })
    addEdge(edges, seenEdges, incidentId, cameraId, "incident-camera")
    addNode(nodes, seenNodes, {
      id: trackId,
      kind: "track",
      label: `track-${incident.zone}`,
      detail: trackDetail(incident.zone, clips, windowBuffer.get(incident.zone)),
      tone: incidentTone(incident),
      incidentId: incident.id,
      cameraId: incident.zone,
      clipId: firstClip.id,
    })
    addEdge(edges, seenEdges, cameraId, trackId, "camera-track")

    for (const clip of clips) {
      const observationRef = ref("Observation", clip.id)
      const evidenceRef = ref("EvidenceClip", clip.id)
      if (
        !hasOntologyLink(links, "observation_supports_track", observationRef, trackRef) ||
        !hasOntologyLink(links, "incident_has_evidence", incidentRef, evidenceRef)
      ) {
        continue
      }

      const detectionId = graphId("detection", clip.id)
      const citation = citationForClip(citations, clip)
      addNode(nodes, seenNodes, {
        id: detectionId,
        kind: "detection",
        label: clip.id,
        detail: `${SOURCE_LABEL[clip.source]} · ${clip.time} · ${clip.detail}`,
        tone: clip.tone,
        incidentId: incident.id,
        cameraId: clip.camera,
        clipId: clip.id,
        ...(citation !== undefined ? { citationId: citation.id } : {}),
      })
      addEdge(edges, seenEdges, trackId, detectionId, "track-detection")

      if (citation !== undefined) {
        const citationRef = ref("Citation", citation.id)
        if (!hasOntologyLink(links, "evidence_has_citation", evidenceRef, citationRef)) {
          continue
        }
        const citationId = graphId("citation", citation.id)
        addNode(nodes, seenNodes, {
          id: citationId,
          kind: "citation",
          label: citation.id,
          detail: citation.label,
          tone: clip.tone,
          incidentId: incident.id,
          cameraId: clip.camera,
          clipId: clip.id,
          citationId: citation.id,
        })
        addEdge(edges, seenEdges, detectionId, citationId, "detection-citation")
      }
    }

    if (incident.id === selectedIncidentId && responseGates.length > 0) {
      const linkedResponseGate = responseGates.find((gate) =>
        hasOntologyLink(
          links,
          "incident_has_response_gate",
          incidentRef,
          ref("ResponseGate", gate.id),
        ),
      )
      if (linkedResponseGate === undefined) {
        continue
      }
      const responseId = graphId("response", incident.id)
      const pendingCount = responseGates.filter((gate) => gate.initial === "PENDING").length
      const passCount = responseGates.length - pendingCount
      const activeGate =
        responseGates.find((gate) => gate.initial === "PENDING") ?? responseGates[0]
      addNode(nodes, seenNodes, {
        id: responseId,
        kind: "response",
        label: `response-${incident.id}`,
        detail: `${passCount} PASS · ${pendingCount} PENDING`,
        tone: pendingCount > 0 ? "watch" : "normal",
        incidentId: incident.id,
        cameraId: incident.zone,
        responseGateId: activeGate?.id ?? linkedResponseGate.id,
      })
      addEdge(edges, seenEdges, incidentId, responseId, "incident-response")
    }
  }

  return { nodes, edges }
}
