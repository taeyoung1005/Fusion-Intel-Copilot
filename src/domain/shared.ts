import { z } from "zod"

export const MetadataSchema = z.record(z.string(), z.unknown()).readonly()
export type Metadata = Readonly<Record<string, unknown>>

export const ConfidenceSchema = z.number().min(0).max(1)
export type Confidence = z.infer<typeof ConfidenceSchema>

export const SummarySchema = z.string().min(1)
export const OptionalSummarySchema = SummarySchema.optional()
