import type { Citation, EvidenceClip, Incident, MissingContext, ResponseGate } from "./copData"
import type { DailyReportRow } from "./operationalTelemetry"

export type CommanderReportArtifactInput = {
  readonly selectedIncident: Incident
  readonly selectedClip: EvidenceClip | undefined
  readonly evidenceClips: readonly EvidenceClip[]
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly responseGates: readonly ResponseGate[]
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
  readonly generatedAt: Date
}

export type ReportTimelineEntry = {
  readonly clipId: string
  readonly time: string
  readonly camera: string
  readonly tone: EvidenceClip["tone"]
  readonly source: EvidenceClip["source"]
  readonly label: string
  readonly detail: string
  readonly confidencePct: number
  readonly detectionClass?: string
  readonly cooldownKey?: string
  readonly trackId?: string
  readonly promotedAtMs?: number
}

export type ReportCameraFinding = {
  readonly camera: string
  readonly eventCount: number
  readonly highestConfidencePct: number
  readonly latestTime: string
  readonly detectionClasses: readonly string[]
}

export type ReportResponseAction = {
  readonly gateId: string
  readonly label: string
  readonly status: ResponseGate["initial"]
}

export type CommanderReportArtifact = {
  readonly reportId: string
  readonly exportReceiptId: string
  readonly generatedAtIso: string
  readonly date: string
  readonly title: string
  readonly period: string
  readonly incident: Incident
  readonly selectedClipId?: string
  readonly summary: string
  readonly rows: readonly DailyReportRow[]
  readonly timeline: readonly ReportTimelineEntry[]
  readonly perCameraFindings: readonly ReportCameraFinding[]
  readonly responseActions: readonly ReportResponseAction[]
  readonly unresolved: readonly string[]
  readonly citations: readonly Citation[]
}

export type ReportFile = {
  readonly fileName: string
  readonly mimeType: string
  readonly content: string
}

const DAILY_REPORT_TITLE = "FUSION INTEL COPILOT DAILY SITUATION REPORT"

const eventClockFor = (incident: Incident, generatedAt: Date): string => {
  if (/^\d{2}:\d{2}:\d{2}$/.test(incident.time)) {
    return incident.time
  }
  const hours = String(generatedAt.getHours()).padStart(2, "0")
  const minutes = String(generatedAt.getMinutes()).padStart(2, "0")
  const seconds = String(generatedAt.getSeconds()).padStart(2, "0")
  return `${hours}:${minutes}:${seconds}`
}

const safeIdSegment = (value: string): string => {
  const segment = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return segment.length > 0 ? segment : "NO-INCIDENT"
}

const dateStamp = (generatedAt: Date): string => {
  const year = generatedAt.getFullYear()
  const month = String(generatedAt.getMonth() + 1).padStart(2, "0")
  const day = String(generatedAt.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const reportIdFor = (input: CommanderReportArtifactInput): string => {
  const date = dateStamp(input.generatedAt).replace(/-/g, "")
  const incident = safeIdSegment(input.selectedIncident.id)
  const clock = eventClockFor(input.selectedIncident, input.generatedAt).replace(/:/g, "")
  return `RPT-${date}-${incident}-${clock}`
}

const exportReceiptIdFor = (input: CommanderReportArtifactInput): string =>
  reportIdFor(input).replace(/^RPT-/, "EXP-")

const timelineEntryFor = (clip: EvidenceClip): ReportTimelineEntry => ({
  clipId: clip.id,
  time: clip.time,
  camera: clip.camera,
  tone: clip.tone,
  source: clip.source,
  label: clip.label,
  detail: clip.detail,
  confidencePct: clip.confidencePct,
  ...(clip.detectionClass === undefined ? {} : { detectionClass: clip.detectionClass }),
  ...(clip.cooldownKey === undefined ? {} : { cooldownKey: clip.cooldownKey }),
  ...(clip.trackId === undefined ? {} : { trackId: clip.trackId }),
  ...(clip.promotedAtMs === undefined ? {} : { promotedAtMs: clip.promotedAtMs }),
})

const perCameraFindingsFor = (
  evidenceClips: readonly EvidenceClip[],
): readonly ReportCameraFinding[] => {
  const byCamera = new Map<string, EvidenceClip[]>()
  for (const clip of evidenceClips) {
    const bucket = byCamera.get(clip.camera) ?? []
    bucket.push(clip)
    byCamera.set(clip.camera, bucket)
  }

  return [...byCamera.entries()]
    .map(([camera, clips]) => {
      const classes = new Set(
        clips.map((clip) => clip.detectionClass ?? clip.source).filter((value) => value.length > 0),
      )
      return {
        camera,
        eventCount: clips.length,
        highestConfidencePct: Math.max(...clips.map((clip) => clip.confidencePct)),
        latestTime: clips[0]?.time ?? "--:--:--",
        detectionClasses: [...classes].sort(),
      }
    })
    .sort((left, right) => right.highestConfidencePct - left.highestConfidencePct)
}

const unresolvedFor = (missingContext: readonly MissingContext[]): readonly string[] =>
  missingContext.map((item) => `${item.camera}: ${item.reason}`)

export const buildCommanderReportArtifact = (
  input: CommanderReportArtifactInput,
): CommanderReportArtifact => {
  const reportId = reportIdFor(input)
  const selectedClipId = input.selectedClip?.id
  const timeline = input.evidenceClips.map(timelineEntryFor)
  return {
    reportId,
    exportReceiptId: exportReceiptIdFor(input),
    generatedAtIso: input.generatedAt.toISOString(),
    date: dateStamp(input.generatedAt),
    title: DAILY_REPORT_TITLE,
    period: input.reportPeriod,
    incident: input.selectedIncident,
    ...(selectedClipId === undefined ? {} : { selectedClipId }),
    summary: `${input.selectedIncident.id} / ${input.selectedIncident.title} / ${timeline.length}개 증거 이벤트`,
    rows: input.reportRows.map((row) => ({ ...row })),
    timeline,
    perCameraFindings: perCameraFindingsFor(input.evidenceClips),
    responseActions: input.responseGates.map((gate) => ({
      gateId: gate.id,
      label: gate.label,
      status: gate.initial,
    })),
    unresolved: unresolvedFor(input.missingContext),
    citations: input.citations.map((citation) => ({ ...citation })),
  }
}

export const buildReportExportFile = (artifact: CommanderReportArtifact): ReportFile => ({
  fileName: `d4d-report-${artifact.reportId}.json`,
  mimeType: "application/json",
  content: `${JSON.stringify(artifact, null, 2)}\n`,
})

const escapePdfText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")

const buildPdfContentStream = (artifact: CommanderReportArtifact): string => {
  const lines = [
    "FUSION INTEL COPILOT",
    `Report: ${artifact.reportId}`,
    `Receipt: ${artifact.exportReceiptId}`,
    `Generated: ${artifact.generatedAtIso}`,
    `Incident: ${artifact.incident.id}`,
    `Period: ${artifact.period}`,
    `Events: ${artifact.timeline.length}`,
    `Citations: ${artifact.citations.length}`,
    `Unresolved: ${artifact.unresolved.length}`,
  ]
  const text = lines
    .map((line, index) => `1 0 0 1 44 ${760 - index * 18} Tm (${escapePdfText(line)}) Tj`)
    .join("\n")
  return `BT\n/F1 11 Tf\n${text}\nET`
}

export const buildReportPdfFile = (artifact: CommanderReportArtifact): ReportFile => {
  const stream = buildPdfContentStream(artifact)
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]

  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  for (const object of objects) {
    offsets.push(body.length)
    body += `${offsets.length} 0 obj\n${object}\nendobj\n`
  }

  const xrefOffset = body.length
  body += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`
  }
  body += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return {
    fileName: `d4d-report-${artifact.reportId}.pdf`,
    mimeType: "application/pdf",
    content: body,
  }
}
