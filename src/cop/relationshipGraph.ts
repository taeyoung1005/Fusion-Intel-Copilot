import { buildEvidenceRelationshipGraphFromOntology } from "../ontology/relationshipGraphAdapter"
import type { AlertTone, Citation, EvidenceClip, Incident, ResponseGate } from "./copData"
import type { WindowEntry } from "./evidenceWindowSummary"

export type RelationshipGraphNodeKind =
  | "incident"
  | "camera"
  | "track"
  | "detection"
  | "citation"
  | "response"

export type RelationshipGraphNode = {
  readonly id: string
  readonly kind: RelationshipGraphNodeKind
  readonly label: string
  readonly detail: string
  readonly tone: AlertTone
  readonly incidentId?: string
  readonly cameraId?: string
  readonly clipId?: string
  readonly citationId?: string
  readonly responseGateId?: string
}

export type RelationshipGraphEdge = {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly label: string
}

export type EvidenceRelationshipGraph = {
  readonly nodes: readonly RelationshipGraphNode[]
  readonly edges: readonly RelationshipGraphEdge[]
}

export type EvidenceRelationshipGraphInput = {
  readonly incidents: readonly Incident[]
  readonly citations: readonly Citation[]
  readonly evidence: readonly EvidenceClip[]
  readonly windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>
  readonly responseGates: readonly ResponseGate[]
  readonly selectedIncidentId: string
}

export const buildEvidenceRelationshipGraph = buildEvidenceRelationshipGraphFromOntology
