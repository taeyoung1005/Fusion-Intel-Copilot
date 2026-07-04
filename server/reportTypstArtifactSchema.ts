import { z } from "zod"
import type { CommanderReportArtifact } from "../src/cop/reportArtifact"

const alertToneSchema = z.union([
  z.literal("normal"),
  z.literal("watch"),
  z.literal("alert"),
  z.literal("confirmed"),
  z.literal("uncertain"),
])

const dailyReportRowSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    value: z.string(),
  })
  .strict()
  .readonly()

const incidentSchema = z
  .object({
    id: z.string().min(1),
    tone: alertToneSchema,
    zone: z.string().min(1),
    title: z.string().min(1),
    meta: z.string(),
    time: z.string(),
    confidence: z.number(),
  })
  .strict()
  .readonly()

const timelineEntrySchema = z
  .object({
    clipId: z.string().min(1),
    time: z.string(),
    camera: z.string(),
    tone: alertToneSchema,
    source: z.union([z.literal("mobile"), z.literal("vision"), z.literal("correlation")]),
    label: z.string(),
    detail: z.string(),
    confidencePct: z.number(),
    detectionClass: z.string().optional(),
    cooldownKey: z.string().optional(),
    trackId: z.string().optional(),
    promotedAtMs: z.number().optional(),
  })
  .strict()
  .readonly()

const cameraFindingSchema = z
  .object({
    camera: z.string(),
    eventCount: z.number(),
    highestConfidencePct: z.number(),
    latestTime: z.string(),
    detectionClasses: z.array(z.string()).readonly(),
  })
  .strict()
  .readonly()

const responseActionSchema = z
  .object({
    gateId: z.string(),
    label: z.string(),
    status: z.union([z.literal("PASS"), z.literal("PENDING")]),
  })
  .strict()
  .readonly()

const citationSchema = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    time: z.string().optional(),
  })
  .strict()
  .readonly()

const commanderReportArtifactSchema = z
  .object({
    reportId: z.string().min(1),
    exportReceiptId: z.string().min(1),
    generatedAtIso: z.string().min(1),
    date: z.string().min(1),
    title: z.string(),
    period: z.string(),
    incident: incidentSchema,
    selectedClipId: z.string().optional(),
    summary: z.string(),
    rows: z.array(dailyReportRowSchema).readonly(),
    timeline: z.array(timelineEntrySchema).readonly(),
    perCameraFindings: z.array(cameraFindingSchema).readonly(),
    responseActions: z.array(responseActionSchema).readonly(),
    unresolved: z.array(z.string()).readonly(),
    citations: z.array(citationSchema).readonly(),
  })
  .strict()
  .readonly()

type ParsedCommanderReportArtifact = z.infer<typeof commanderReportArtifactSchema>

const toCommanderReportArtifact = (
  artifact: ParsedCommanderReportArtifact,
): CommanderReportArtifact => ({
  reportId: artifact.reportId,
  exportReceiptId: artifact.exportReceiptId,
  generatedAtIso: artifact.generatedAtIso,
  date: artifact.date,
  title: artifact.title,
  period: artifact.period,
  incident: artifact.incident,
  ...(artifact.selectedClipId === undefined ? {} : { selectedClipId: artifact.selectedClipId }),
  summary: artifact.summary,
  rows: artifact.rows,
  timeline: artifact.timeline.map((entry) => ({
    clipId: entry.clipId,
    time: entry.time,
    camera: entry.camera,
    tone: entry.tone,
    source: entry.source,
    label: entry.label,
    detail: entry.detail,
    confidencePct: entry.confidencePct,
    ...(entry.detectionClass === undefined ? {} : { detectionClass: entry.detectionClass }),
    ...(entry.cooldownKey === undefined ? {} : { cooldownKey: entry.cooldownKey }),
    ...(entry.trackId === undefined ? {} : { trackId: entry.trackId }),
    ...(entry.promotedAtMs === undefined ? {} : { promotedAtMs: entry.promotedAtMs }),
  })),
  perCameraFindings: artifact.perCameraFindings,
  responseActions: artifact.responseActions,
  unresolved: artifact.unresolved,
  citations: artifact.citations.map((citation) => ({
    id: citation.id,
    label: citation.label,
    ...(citation.time === undefined ? {} : { time: citation.time }),
  })),
})

export const parseCommanderReportArtifact = (value: unknown): CommanderReportArtifact | null => {
  const parsed = commanderReportArtifactSchema.safeParse(value)
  return parsed.success ? toCommanderReportArtifact(parsed.data) : null
}
