import {
  type OntologyObjectRef,
  buildLocalOntologyLinks,
  refKey,
} from "../src/ontology/localLinks.ts"
import type { DemoOntologyGraph } from "./demo-ontology-runtime.ts"

type CountLine = {
  readonly label: string
  readonly count: number
}

type SamplePath = {
  readonly sensor: OntologyObjectRef
  readonly observation: OntologyObjectRef
  readonly track: OntologyObjectRef
  readonly incident: OntologyObjectRef
  readonly responseGate: OntologyObjectRef
  readonly linkIds: readonly string[]
}

const incrementCount = (counts: Map<string, number>, label: string): void => {
  counts.set(label, (counts.get(label) ?? 0) + 1)
}

const countLabels = (labels: readonly string[]): readonly CountLine[] => {
  const counts = new Map<string, number>()
  for (const label of labels) {
    incrementCount(counts, label)
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => ({ label, count }))
}

const formatCountSection = (title: string, counts: readonly CountLine[]): readonly string[] => [
  title,
  ...counts.map((entry) => `  ${entry.label}: ${entry.count}`),
]

const findSamplePath = (links: ReturnType<typeof buildLocalOntologyLinks>): SamplePath => {
  for (const sensorToObservation of links.filter(
    (link) => link.kind === "sensor_observed_observation",
  )) {
    const observationToTrack = links.find(
      (link) =>
        link.kind === "observation_supports_track" &&
        refKey(link.from) === refKey(sensorToObservation.to),
    )
    if (observationToTrack === undefined) {
      continue
    }
    const trackToIncident = links.find(
      (link) =>
        link.kind === "track_raised_incident" &&
        refKey(link.from) === refKey(observationToTrack.to),
    )
    if (trackToIncident === undefined) {
      continue
    }
    const incidentToGate = links.find(
      (link) =>
        link.kind === "incident_has_response_gate" &&
        refKey(link.from) === refKey(trackToIncident.to),
    )
    if (incidentToGate === undefined) {
      continue
    }
    return {
      sensor: sensorToObservation.from,
      observation: sensorToObservation.to,
      track: observationToTrack.to,
      incident: trackToIncident.to,
      responseGate: incidentToGate.to,
      linkIds: [
        sensorToObservation.id,
        observationToTrack.id,
        trackToIncident.id,
        incidentToGate.id,
      ],
    }
  }
  throw new Error("synthetic ontology demo has no sensor->incident->response-gate path")
}

const formatRef = (objectRef: OntologyObjectRef): string =>
  `${objectRef.objectType}:${objectRef.objectId}`

const formatSamplePath = (path: SamplePath): readonly string[] => [
  "Sample path (sensor->incident->response-gate)",
  `  Sensor: ${formatRef(path.sensor)}`,
  `  Observation: ${formatRef(path.observation)}`,
  `  Track: ${formatRef(path.track)}`,
  `  Incident: ${formatRef(path.incident)}`,
  `  ResponseGate: ${formatRef(path.responseGate)}`,
  "  Links:",
  ...path.linkIds.map((linkId) => `    ${linkId}`),
]

export const formatDemoOntologySummary = (graph: DemoOntologyGraph): string => {
  const links = buildLocalOntologyLinks(graph.graphObjects)
  const sections = [
    "Local ontology graph summary",
    `fixtureId: ${graph.fixture.fixtureId}`,
    `sourceObjects: ${graph.sourceObjects.length}`,
    `graphObjects: ${graph.graphObjects.length}`,
    `links: ${links.length}`,
    "",
    ...formatCountSection(
      "Source object kind counts",
      countLabels(graph.sourceObjects.map((object) => object.kind)),
    ),
    "",
    ...formatCountSection(
      "Object kind counts",
      countLabels(graph.graphObjects.map((object) => object.ref.objectType)),
    ),
    "",
    ...formatCountSection("Link type counts", countLabels(links.map((link) => link.kind))),
    "",
    ...formatCountSection("Action type counts", countLabels(graph.actionTypes)),
    "",
    ...formatSamplePath(findSamplePath(links)),
  ]
  return sections.join("\n")
}
