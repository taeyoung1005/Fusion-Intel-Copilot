import { z } from "zod"
import type { ActivityEvent } from "../activityEvents"
import type { Citation, EvidenceClip, Incident, ResponseGate } from "../cop/copData"
import type { ScenarioFixture } from "../domain"
import { createLocalOntologyObjectDrafts } from "./localObjectSources"

const LOCAL_ONTOLOGY_OBJECT_KINDS = [
  "CameraTopology",
  "Camera",
  "CameraGroup",
  "Observation",
  "Track",
  "TrackSession",
  "Incident",
  "EvidenceClip",
  "ResponseGate",
  "Citation",
  "ActivityEvent",
] as const

const LocalOntologyObjectKindSchema = z.enum(LOCAL_ONTOLOGY_OBJECT_KINDS)

const LocalOntologySourceRefSchema = z
  .object({
    system: z.literal("d4d"),
    sourceType: z.string().min(1),
    sourceId: z.string().min(1),
    sourcePath: z.string().min(1),
    fixtureId: z.string().min(1).optional(),
    parentId: z.string().min(1).optional(),
  })
  .strict()
  .readonly()

export const LocalOntologyObjectSchema = z
  .object({
    kind: LocalOntologyObjectKindSchema,
    id: z.string().min(1),
    sourceRef: LocalOntologySourceRefSchema,
  })
  .strict()
  .readonly()

export const LocalOntologyObjectArraySchema = z.array(LocalOntologyObjectSchema).readonly()

export type LocalOntologyObject = Readonly<z.infer<typeof LocalOntologyObjectSchema>>

export type LocalOntologyObjectInput = {
  readonly scenario: ScenarioFixture
  readonly evidenceClips: readonly EvidenceClip[]
  readonly incidents: readonly Incident[]
  readonly responseGateIncidentId: string
  readonly responseGates: readonly ResponseGate[]
  readonly citations: readonly Citation[]
  readonly activityEvents: readonly ActivityEvent[]
}

export class DuplicateOntologyObjectIdError extends Error {
  readonly name = "DuplicateOntologyObjectIdError"

  constructor(readonly duplicateId: string) {
    super(`duplicate ontology object id: ${duplicateId}`)
  }
}

const assertUniqueOntologyObjectIds = (objects: readonly LocalOntologyObject[]): void => {
  const ids = new Set<string>()
  for (const object of objects) {
    if (ids.has(object.id)) {
      throw new DuplicateOntologyObjectIdError(object.id)
    }
    ids.add(object.id)
  }
}

export const buildLocalOntologyObjects = (
  input: LocalOntologyObjectInput,
): readonly LocalOntologyObject[] => {
  const objects = createLocalOntologyObjectDrafts(input)
  assertUniqueOntologyObjectIds(objects)
  return [...objects].sort((left, right) => left.id.localeCompare(right.id))
}
