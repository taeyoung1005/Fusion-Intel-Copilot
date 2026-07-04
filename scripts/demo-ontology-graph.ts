import type { ScenarioFixture } from "../src/domain/index.ts"
import {
  type LocalOntologyObject as GraphOntologyObject,
  type OntologyObjectRef,
  refKey,
} from "../src/ontology/localLinks.ts"
import type { ExecutedActions, RuntimeOntologyInput } from "./demo-ontology-runtime.ts"

const ref = (objectType: OntologyObjectRef["objectType"], objectId: string): OntologyObjectRef => ({
  objectType,
  objectId,
})

const addGraphObject = (
  objects: GraphOntologyObject[],
  seen: Set<string>,
  object: GraphOntologyObject,
): void => {
  const key = refKey(object.ref)
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  objects.push(object)
}

const addSensors = (
  fixture: ScenarioFixture,
  objects: GraphOntologyObject[],
  seen: Set<string>,
): void => {
  for (const camera of fixture.topology.cameras) {
    const assetRef = ref("Asset", `asset-${camera.cameraId}`)
    addGraphObject(objects, seen, { ref: assetRef })
    addGraphObject(objects, seen, { ref: ref("Sensor", camera.cameraId), relations: { assetRef } })
  }
}

const addTracks = (
  fixture: ScenarioFixture,
  runtime: RuntimeOntologyInput,
  objects: GraphOntologyObject[],
  seen: Set<string>,
): void => {
  const incidentByCamera = new Map(runtime.incidents.map((incident) => [incident.zone, incident]))
  for (const track of fixture.tracks) {
    const incident = incidentByCamera.get(track.cameraId)
    const relations =
      incident === undefined ? undefined : { incidentRef: ref("Incident", incident.id) }
    addGraphObject(objects, seen, {
      ref: ref("Track", track.trackId),
      ...(relations === undefined ? {} : { relations }),
    })
  }
}

const addEvidence = (
  fixture: ScenarioFixture,
  runtime: RuntimeOntologyInput,
  objects: GraphOntologyObject[],
  seen: Set<string>,
): void => {
  const citationByClip = new Map(
    runtime.citations.map((citation) => [citation.id.slice(5), citation]),
  )
  for (const clip of runtime.evidenceClips) {
    const citation = citationByClip.get(clip.id)
    const citationRef = citation === undefined ? undefined : ref("Citation", citation.id)
    const trackId = fixture.observations.find(
      (observation) => observation.eventId === clip.id,
    )?.trackId
    addGraphObject(objects, seen, {
      ref: ref("Observation", clip.id),
      relations: {
        sensorRef: ref("Sensor", clip.camera),
        ...(trackId === undefined ? {} : { trackRef: ref("Track", trackId) }),
      },
    })
    addGraphObject(objects, seen, {
      ref: ref("EvidenceClip", clip.id),
      ...(citationRef === undefined ? {} : { relations: { citationRefs: [citationRef] } }),
    })
    if (citationRef !== undefined) {
      addGraphObject(objects, seen, { ref: citationRef })
    }
  }
}

const addIncidents = (
  runtime: RuntimeOntologyInput,
  actions: ExecutedActions,
  objects: GraphOntologyObject[],
  seen: Set<string>,
): void => {
  for (const incident of runtime.incidents) {
    if (incident.id === "inc-standby") {
      continue
    }
    const evidenceRefs = runtime.evidenceClips
      .filter((clip) => clip.camera === incident.zone)
      .map((clip) => ref("EvidenceClip", clip.id))
    const selectedRelations =
      incident.id === runtime.selectedIncident.id
        ? { assessmentRefs: [actions.assessmentRef], responseGateRefs: [actions.responseGateRef] }
        : {}
    addGraphObject(objects, seen, {
      ref: ref("Incident", incident.id),
      relations: { evidenceRefs, ...selectedRelations },
    })
  }
}

export const graphObjectsFromRuntime = (
  fixture: ScenarioFixture,
  runtime: RuntimeOntologyInput,
  actions: ExecutedActions,
): readonly GraphOntologyObject[] => {
  const objects: GraphOntologyObject[] = []
  const seen = new Set<string>()
  addSensors(fixture, objects, seen)
  addTracks(fixture, runtime, objects, seen)
  addEvidence(fixture, runtime, objects, seen)
  addIncidents(runtime, actions, objects, seen)
  addGraphObject(objects, seen, { ref: actions.assessmentRef })
  addGraphObject(objects, seen, {
    ref: actions.responseGateRef,
    relations: { reportRef: actions.reportRef },
  })
  addGraphObject(objects, seen, {
    ref: actions.reportRef,
    relations: {
      incidentRefs: [ref("Incident", runtime.selectedIncident.id)],
      assetRefs: [ref("Asset", `asset-${runtime.selectedIncident.zone}`)],
    },
  })
  return objects.sort((left, right) => refKey(left.ref).localeCompare(refKey(right.ref)))
}
