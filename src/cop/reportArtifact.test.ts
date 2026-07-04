import { describe, expect, it } from "vitest"
import type { Citation, EvidenceClip, Incident, MissingContext, ResponseGate } from "./copData"
import type { DailyReportRow } from "./operationalTelemetry"
import {
  buildCommanderReportArtifact,
  buildReportExportFile,
  buildReportPdfFile,
} from "./reportArtifact"

const incident = {
  id: "inc-CARLA-N-01",
  tone: "WATCH",
  zone: "CARLA-N-01",
  title: "CARLA-N-01 person approaching",
  meta: "북측 CARLA CCTV",
  time: "14:03:05",
  confidence: 91,
} satisfies Incident

const selectedClip = {
  id: "ev-carla-vision-CARLA-N-01-7",
  time: "14:03:05",
  camera: "CARLA-N-01",
  tone: "alert",
  label: "북측 CARLA CCTV · person 접근",
  detail: "CONF 91%",
  source: "vision",
  confidencePct: 91,
  detectionClass: "person",
  cooldownKey: "CARLA-N-01:person",
  trackId: "detr-person-007",
  promotedAtMs: 1_720_170_185_000,
} satisfies EvidenceClip

const citation = {
  id: "cite-ev-carla-vision-CARLA-N-01-7",
  label: "CARLA-N-01 · DETR",
  time: "14:03:05",
} satisfies Citation

const missingContext = {
  id: "miss-CARLA-E-02",
  camera: "CARLA-E-02",
  reason: "업링크 프레임 대기 (No Uplink Frame)",
  since: "연결 직후",
} satisfies MissingContext

const responseGate = {
  id: "gate-data",
  label: "추가 데이터 검토",
  initial: "PASS",
} satisfies ResponseGate

const reportRows = [
  { id: "total", label: "TOTAL EVENTS", value: "1" },
  { id: "alert", label: "ALERT EVENTS", value: "1" },
] satisfies readonly DailyReportRow[]

describe("buildCommanderReportArtifact", () => {
  it("derives report identifiers from the actual incident and event time", () => {
    const artifact = buildCommanderReportArtifact({
      selectedIncident: incident,
      selectedClip,
      evidenceClips: [selectedClip],
      citations: [citation],
      missingContext: [missingContext],
      responseGates: [responseGate],
      reportRows,
      reportPeriod: "14:03:05 ~ 14:03:35",
      generatedAt: new Date("2026-07-05T05:06:07.000Z"),
    })

    expect(artifact.reportId).toBe("RPT-20260705-INC-CARLA-N-01-140305")
    expect(artifact.exportReceiptId).toBe("EXP-20260705-INC-CARLA-N-01-140305")
    expect(artifact.date).toBe("2026-07-05")
    expect(artifact.reportId).not.toContain("2025-05-20")
    expect(artifact.summary).toContain("inc-CARLA-N-01")
    expect(artifact.timeline[0]).toMatchObject({
      clipId: "ev-carla-vision-CARLA-N-01-7",
      detectionClass: "person",
      cooldownKey: "CARLA-N-01:person",
      trackId: "detr-person-007",
    })
    expect(artifact.unresolved).toContain("CARLA-E-02: 업링크 프레임 대기 (No Uplink Frame)")
  })
})

describe("report files", () => {
  it("creates JSON export and PDF preview payloads", () => {
    const artifact = buildCommanderReportArtifact({
      selectedIncident: incident,
      selectedClip,
      evidenceClips: [selectedClip],
      citations: [citation],
      missingContext: [],
      responseGates: [responseGate],
      reportRows,
      reportPeriod: "14:03:05 ~ 14:03:35",
      generatedAt: new Date("2026-07-05T05:06:07.000Z"),
    })

    const exported = buildReportExportFile(artifact)
    expect(exported.fileName).toBe("d4d-report-RPT-20260705-INC-CARLA-N-01-140305.json")
    expect(exported.mimeType).toBe("application/json")
    expect(JSON.parse(exported.content)).toMatchObject({
      reportId: "RPT-20260705-INC-CARLA-N-01-140305",
      exportReceiptId: "EXP-20260705-INC-CARLA-N-01-140305",
    })

    const pdf = buildReportPdfFile(artifact)
    expect(pdf.fileName).toBe("d4d-report-RPT-20260705-INC-CARLA-N-01-140305.pdf")
    expect(pdf.mimeType).toBe("application/pdf")
    expect(pdf.content.startsWith("%PDF-1.4")).toBe(true)
    expect(pdf.content).toContain("/Type /Catalog")
  })
})
