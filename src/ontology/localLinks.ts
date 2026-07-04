export type OntologyObjectType =
  | "Asset"
  | "Sensor"
  | "Observation"
  | "Track"
  | "Incident"
  | "EvidenceClip"
  | "Citation"
  | "Assessment"
  | "ResponseGate"
  | "CommanderReport"

export type OntologyObjectRef = {
  readonly objectType: OntologyObjectType
  readonly objectId: string
}

export type LocalOntologyLinkKind =
  | "asset_has_sensor"
  | "sensor_observed_observation"
  | "observation_supports_track"
  | "track_raised_incident"
  | "incident_has_evidence"
  | "evidence_has_citation"
  | "incident_has_assessment"
  | "incident_has_response_gate"
  | "response_gate_included_in_report"
  | "report_summarizes_incident"
  | "report_mentions_asset"

type LocalOntologyRelations = {
  readonly assetRef?: OntologyObjectRef
  readonly sensorRef?: OntologyObjectRef
  readonly trackRef?: OntologyObjectRef
  readonly incidentRef?: OntologyObjectRef
  readonly evidenceRefs?: readonly OntologyObjectRef[]
  readonly citationRefs?: readonly OntologyObjectRef[]
  readonly assessmentRefs?: readonly OntologyObjectRef[]
  readonly responseGateRefs?: readonly OntologyObjectRef[]
  readonly reportRef?: OntologyObjectRef
  readonly incidentRefs?: readonly OntologyObjectRef[]
  readonly assetRefs?: readonly OntologyObjectRef[]
}

export type LocalOntologyObject = {
  readonly ref: OntologyObjectRef
  readonly relations?: LocalOntologyRelations
}

export type LocalOntologyLink = {
  readonly id: string
  readonly kind: LocalOntologyLinkKind
  readonly from: OntologyObjectRef
  readonly to: OntologyObjectRef
}

const LINK_KIND_ORDER: Readonly<Record<LocalOntologyLinkKind, number>> = {
  asset_has_sensor: 0,
  sensor_observed_observation: 1,
  observation_supports_track: 2,
  track_raised_incident: 3,
  incident_has_evidence: 4,
  evidence_has_citation: 5,
  incident_has_assessment: 6,
  incident_has_response_gate: 7,
  response_gate_included_in_report: 8,
  report_summarizes_incident: 9,
  report_mentions_asset: 10,
} as const

export class OntologyLinkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OntologyLinkError"
  }
}

export const refKey = (ref: OntologyObjectRef): string => `${ref.objectType}:${ref.objectId}`

export const buildLocalOntologyLinkId = (
  kind: LocalOntologyLinkKind,
  from: OntologyObjectRef,
  to: OntologyObjectRef,
): string => `${kind}:${refKey(from)}->${refKey(to)}`

const validateEndpoint = (refs: ReadonlySet<string>, ref: OntologyObjectRef): void => {
  const key = refKey(ref)
  if (!refs.has(key)) {
    throw new OntologyLinkError(`missing endpoint for ontology link: ${key}`)
  }
}

const createLink = (
  kind: LocalOntologyLinkKind,
  from: OntologyObjectRef,
  to: OntologyObjectRef,
): LocalOntologyLink => ({
  id: buildLocalOntologyLinkId(kind, from, to),
  kind,
  from,
  to,
})

const compareLinks = (left: LocalOntologyLink, right: LocalOntologyLink): number => {
  const kindOrder = LINK_KIND_ORDER[left.kind] - LINK_KIND_ORDER[right.kind]
  return kindOrder === 0 ? left.id.localeCompare(right.id) : kindOrder
}

const pushLink = (
  links: LocalOntologyLink[],
  refs: ReadonlySet<string>,
  kind: LocalOntologyLinkKind,
  from: OntologyObjectRef,
  to: OntologyObjectRef,
): void => {
  validateEndpoint(refs, from)
  validateEndpoint(refs, to)
  links.push(createLink(kind, from, to))
}

export const buildLocalOntologyLinks = (
  objects: readonly LocalOntologyObject[],
): readonly LocalOntologyLink[] => {
  const refs = new Set(objects.map((object) => refKey(object.ref)))
  const links: LocalOntologyLink[] = []

  for (const object of objects) {
    const relations = object.relations
    if (relations === undefined) {
      continue
    }

    if (object.ref.objectType === "Sensor" && relations.assetRef !== undefined) {
      pushLink(links, refs, "asset_has_sensor", relations.assetRef, object.ref)
    }
    if (object.ref.objectType === "Observation" && relations.sensorRef !== undefined) {
      pushLink(links, refs, "sensor_observed_observation", relations.sensorRef, object.ref)
    }
    if (object.ref.objectType === "Observation" && relations.trackRef !== undefined) {
      pushLink(links, refs, "observation_supports_track", object.ref, relations.trackRef)
    }
    if (object.ref.objectType === "Track" && relations.incidentRef !== undefined) {
      pushLink(links, refs, "track_raised_incident", object.ref, relations.incidentRef)
    }
    if (object.ref.objectType === "Incident") {
      for (const evidenceRef of relations.evidenceRefs ?? []) {
        pushLink(links, refs, "incident_has_evidence", object.ref, evidenceRef)
      }
      for (const assessmentRef of relations.assessmentRefs ?? []) {
        pushLink(links, refs, "incident_has_assessment", object.ref, assessmentRef)
      }
      for (const responseGateRef of relations.responseGateRefs ?? []) {
        pushLink(links, refs, "incident_has_response_gate", object.ref, responseGateRef)
      }
    }
    if (object.ref.objectType === "EvidenceClip") {
      for (const citationRef of relations.citationRefs ?? []) {
        pushLink(links, refs, "evidence_has_citation", object.ref, citationRef)
      }
    }
    if (object.ref.objectType === "ResponseGate" && relations.reportRef !== undefined) {
      pushLink(links, refs, "response_gate_included_in_report", object.ref, relations.reportRef)
    }
    if (object.ref.objectType === "CommanderReport") {
      for (const incidentRef of relations.incidentRefs ?? []) {
        pushLink(links, refs, "report_summarizes_incident", object.ref, incidentRef)
      }
      for (const assetRef of relations.assetRefs ?? []) {
        pushLink(links, refs, "report_mentions_asset", object.ref, assetRef)
      }
    }
  }

  return links.sort(compareLinks)
}
