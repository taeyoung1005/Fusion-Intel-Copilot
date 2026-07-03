import { z } from "zod"
import {
  CameraGroupIdSchema,
  CameraIdSchema,
  CameraZoneSchema,
  ISOTimeSchema,
} from "./primitives"
import { MetadataSchema, OptionalSummarySchema } from "./shared"

export const CameraStatusSchema = z.enum(["online", "degraded", "offline"])
export type CameraStatus = z.infer<typeof CameraStatusSchema>

export const CameraSchema = z
  .object({
    cameraId: CameraIdSchema,
    label: z.string().min(1),
    zone: CameraZoneSchema,
    coverageNote: OptionalSummarySchema,
    status: CameraStatusSchema.default("online"),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type Camera = Readonly<z.infer<typeof CameraSchema>>

export const CameraGroupSchema = z
  .object({
    groupId: CameraGroupIdSchema,
    label: z.string().min(1),
    cameraIds: z.array(CameraIdSchema).min(1).readonly(),
    purpose: OptionalSummarySchema,
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type CameraGroup = Readonly<z.infer<typeof CameraGroupSchema>>

export const CameraTopologyEdgeSchema = z
  .object({
    fromCameraId: CameraIdSchema,
    toCameraId: CameraIdSchema,
    relationship: z.enum(["adjacent", "overlap", "handoff", "shared_approach"]),
    coverageNote: OptionalSummarySchema,
  })
  .strict()
  .readonly()
export type CameraTopologyEdge = Readonly<z.infer<typeof CameraTopologyEdgeSchema>>

export const CameraTopologySchema = z
  .object({
    topologyId: z.string().regex(/^topology-[A-Za-z0-9-]+$/),
    generatedAt: ISOTimeSchema,
    cameras: z.array(CameraSchema).min(1).readonly(),
    cameraGroups: z.array(CameraGroupSchema).min(1).readonly(),
    edges: z.array(CameraTopologyEdgeSchema).readonly(),
    metadata: MetadataSchema.optional(),
  })
  .strict()
  .readonly()
export type CameraTopology = Readonly<z.infer<typeof CameraTopologySchema>>

export const cameraPairKey = (fromCameraId: string, toCameraId: string): string =>
  `${fromCameraId}->${toCameraId}`

export const cameraEdgeKeys = (
  edges: readonly CameraTopologyEdge[],
): ReadonlySet<string> => {
  const keys = new Set<string>()
  for (const edge of edges) {
    keys.add(cameraPairKey(edge.fromCameraId, edge.toCameraId))
    keys.add(cameraPairKey(edge.toCameraId, edge.fromCameraId))
  }
  return keys
}
