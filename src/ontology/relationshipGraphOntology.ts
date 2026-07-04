import type { Citation, EvidenceClip, Incident } from "../cop/copData"
import type { EvidenceRelationshipGraphInput } from "../cop/relationshipGraph"
import {
  type LocalOntologyLink,
  type LocalOntologyLinkKind,
  type LocalOntologyObject,
  type OntologyObjectRef,
  buildLocalOntologyLinks,
  refKey,
} from "./localLinks"

export type RelationshipGraphOntology = {
  readonly links: readonly LocalOntologyLink[]
  readonly evidenceByCamera: ReadonlyMap<string, readonly EvidenceClip[]>
}

export const isRealIncident = (incident: Incident): boolean => incident.id !== "inc-standby"

export const ref = (
  objectType: OntologyObjectRef["objectType"],
  objectId: string,
): OntologyObjectRef => ({
  objectType,
  objectId,
})

export const latestClipFirst = (clips: readonly EvidenceClip[]): readonly EvidenceClip[] =>
  [...clips].sort((left, right) => right.time.localeCompare(left.time))

export const citationForClip = (
  citations: readonly Citation[],
  clip: EvidenceClip,
): Citation | undefined => citations.find((citation) => citation.id === `cite-${clip.id}`)

export const groupEvidenceByCamera = (
  evidence: readonly EvidenceClip[],
): ReadonlyMap<string, readonly EvidenceClip[]> => {
  const grouped = new Map<string, EvidenceClip[]>()
  for (const clip of evidence) {
    const clips = grouped.get(clip.camera) ?? []
    clips.push(clip)
    grouped.set(clip.camera, clips)
  }
  return grouped
}

export const hasOntologyLink = (
  links: readonly LocalOntologyLink[],
  kind: LocalOntologyLinkKind,
  from: OntologyObjectRef,
  to: OntologyObjectRef,
): boolean =>
  links.some(
    (link) =>
      link.kind === kind && refKey(link.from) === refKey(from) && refKey(link.to) === refKey(to),
  )

const addObject = (
  objects: LocalOntologyObject[],
  seen: Set<string>,
  object: LocalOntologyObject,
): void => {
  const key = refKey(object.ref)
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  objects.push(object)
}

const buildOntologyObjects = ({
  incidents,
  citations,
  evidence,
  responseGates,
  selectedIncidentId,
}: EvidenceRelationshipGraphInput): readonly LocalOntologyObject[] => {
  const groupedEvidence = groupEvidenceByCamera(evidence)
  const objects: LocalOntologyObject[] = []
  const seen = new Set<string>()

  for (const incident of incidents) {
    if (!isRealIncident(incident)) {
      continue
    }
    const clips = latestClipFirst(groupedEvidence.get(incident.zone) ?? [])
    if (clips.length === 0) {
      continue
    }

    const incidentRef = ref("Incident", incident.id)
    const sensorRef = ref("Sensor", incident.zone)
    const trackRef = ref("Track", incident.zone)
    const evidenceRefs: OntologyObjectRef[] = []
    const responseGateRefs =
      incident.id === selectedIncidentId
        ? responseGates.map((gate) => ref("ResponseGate", gate.id))
        : []

    addObject(objects, seen, { ref: sensorRef })
    addObject(objects, seen, { ref: trackRef, relations: { incidentRef } })

    for (const clip of clips) {
      const observationRef = ref("Observation", clip.id)
      const evidenceRef = ref("EvidenceClip", clip.id)
      const citation = citationForClip(citations, clip)
      addObject(objects, seen, { ref: observationRef, relations: { sensorRef, trackRef } })
      if (citation === undefined) {
        addObject(objects, seen, { ref: evidenceRef })
      } else {
        const citationRef = ref("Citation", citation.id)
        addObject(objects, seen, { ref: evidenceRef, relations: { citationRefs: [citationRef] } })
        addObject(objects, seen, { ref: citationRef })
      }
      evidenceRefs.push(evidenceRef)
    }

    addObject(objects, seen, {
      ref: incidentRef,
      relations: { evidenceRefs, responseGateRefs },
    })
    for (const responseGateRef of responseGateRefs) {
      addObject(objects, seen, { ref: responseGateRef })
    }
  }

  return objects
}

export const buildRelationshipGraphOntology = (
  input: EvidenceRelationshipGraphInput,
): RelationshipGraphOntology => {
  const objects = buildOntologyObjects(input)
  return {
    evidenceByCamera: groupEvidenceByCamera(input.evidence),
    links: buildLocalOntologyLinks(objects),
  }
}
