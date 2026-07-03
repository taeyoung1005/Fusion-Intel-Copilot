import { describe, expect, it } from "vitest"
import type { EvidenceClip } from "./copData"
import type { Incident } from "./copData"
import { buildDynamicCameraRecord, mobileCameraInput } from "./dynamicMapCamera"
import {
  buildCitations,
  buildCodexMetrics,
  buildDailyReportPeriod,
  buildDailyReportRows,
  buildDetectionMarkers,
  buildIncidents,
  buildMissingContext,
  buildResponseGates,
} from "./operationalTelemetry"

const camera = (id: string, frameCount: number, lastFrameAt: string | null) =>
  buildDynamicCameraRecord(
    mobileCameraInput(id, `${id} 라벨`, 0, frameCount, lastFrameAt, "data:image/jpeg;base64,QQ=="),
  )

const evidence = (
  over: Partial<EvidenceClip> & Pick<EvidenceClip, "camera" | "source">,
): EvidenceClip => ({
  id: `ev-${over.camera}-${over.source}`,
  time: "09:41:02",
  tone: "watch",
  label: "person approaching",
  detail: "CONF 90%",
  confidencePct: 90,
  ...over,
})

describe("buildIncidents", () => {
  it("returns a standby incident when there is no activity", () => {
    const incidents = buildIncidents([], [])
    expect(incidents).toHaveLength(1)
    expect(incidents[0]?.id).toBe("inc-standby")
    expect(incidents[0]?.title).toBe("활성 사건 없음")
  })

  it("derives a real incident per camera and sorts WATCH first", () => {
    const cams = [camera("PHONE-001", 4, "2026-06-30T00:00:04Z")]
    const evid: EvidenceClip[] = [
      evidence({ camera: "PHONE-001", source: "vision", tone: "alert", confidencePct: 91 }),
      evidence({ camera: "PHONE-002", source: "mobile", tone: "uncertain", confidencePct: 60 }),
    ]
    const incidents = buildIncidents(cams, evid)
    expect(incidents).toHaveLength(2)
    expect(incidents[0]?.id).toBe("inc-PHONE-001")
    expect(incidents[0]?.tone).toBe("WATCH")
    expect(incidents[0]?.confidence).toBe(91)
  })
})

describe("buildCodexMetrics", () => {
  it("reports a quiet baseline with nothing connected", () => {
    const metrics = buildCodexMetrics([], [])
    const byId = Object.fromEntries(metrics.map((m) => [m.id, m.value]))
    expect(byId.evidence).toBe("0")
    expect(byId.anomalies).toBe("0")
    expect(byId.nodes).toBe("0")
    expect(byId.uptime).toBe("0%")
    expect(byId.confidence).toBe("0%")
  })

  it("computes real counts from cameras and evidence", () => {
    const cams = [camera("PHONE-001", 10, "2026-06-30T00:00:10Z")]
    const evid = [evidence({ camera: "PHONE-001", source: "vision", confidencePct: 80 })]
    const metrics = buildCodexMetrics(cams, evid)
    const byId = Object.fromEntries(metrics.map((m) => [m.id, m.value]))
    expect(byId.evidence).toBe("11") // 10 frames + 1 vision detection
    expect(byId.anomalies).toBe("1")
    expect(byId.nodes).toBe("1")
    expect(byId.confidence).toBe("80%")
  })
})

describe("buildCitations", () => {
  it("maps each evidence clip to a real citation", () => {
    const citations = buildCitations([
      evidence({ camera: "PHONE-001", source: "vision" }),
      evidence({ camera: "PHONE-002", source: "mobile" }),
    ])
    expect(citations).toHaveLength(2)
    expect(citations[0]?.label).toContain("PHONE-001")
    expect(citations[0]?.label).toContain("DETR")
    expect(citations[1]?.label).toContain("UPLINK")
  })
})

describe("buildMissingContext", () => {
  it("flags only cameras that have not uplinked a frame", () => {
    const streaming = camera("PHONE-001", 5, "2026-06-30T00:00:05Z")
    const silent = buildDynamicCameraRecord(
      mobileCameraInput("PHONE-002", "무프레임", 1, 0, null, null),
    )
    const missing = buildMissingContext([streaming, silent])
    expect(missing).toHaveLength(1)
    expect(missing[0]?.camera).toBe("PHONE-002")
  })
})

describe("buildDailyReportRows", () => {
  it("counts events by tone from real evidence", () => {
    const rows = buildDailyReportRows([
      evidence({ camera: "PHONE-001", source: "vision", tone: "alert" }),
      evidence({ camera: "PHONE-001", source: "mobile", tone: "watch" }),
    ])
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(byLabel["TOTAL EVENTS"]).toBe("2")
    expect(byLabel["WATCH EVENTS"]).toBe("1")
    expect(byLabel["ALERT EVENTS"]).toBe("1")
    expect(byLabel.CONFIRMED).toBe("0")
  })
})

describe("buildResponseGates", () => {
  const incident = (over: Partial<Incident>): Incident => ({
    id: "inc-PHONE-001",
    tone: "WATCH",
    zone: "PHONE-001",
    title: "person",
    meta: "PHONE-001",
    time: "09:41:02",
    confidence: 90,
    ...over,
  })

  it("leaves fact/data PENDING and passes context/assess for a quiet standby incident", () => {
    const gates = buildResponseGates(
      incident({ id: "inc-standby", tone: "NORMAL", zone: "PERIMETER" }),
      [],
      [],
    )
    const byId = Object.fromEntries(gates.map((g) => [g.id, g.initial]))
    expect(byId["gate-fact"]).toBe("PENDING")
    expect(byId["gate-context"]).toBe("PASS")
    expect(byId["gate-data"]).toBe("PENDING")
    expect(byId["gate-assess"]).toBe("PASS")
  })

  it("passes fact/data once the incident's camera has a real DETR detection", () => {
    const gates = buildResponseGates(
      incident({}),
      [evidence({ camera: "PHONE-001", source: "vision", tone: "alert" })],
      [],
    )
    const byId = Object.fromEntries(gates.map((g) => [g.id, g.initial]))
    expect(byId["gate-fact"]).toBe("PASS")
    expect(byId["gate-data"]).toBe("PASS")
    expect(byId["gate-assess"]).toBe("PENDING") // WATCH incident still needs review
  })
})

describe("buildDailyReportPeriod", () => {
  it("spans the real evidence window", () => {
    expect(buildDailyReportPeriod([])).toBe("실시간 대기")
    const period = buildDailyReportPeriod([
      evidence({ camera: "A", source: "vision", time: "09:41:02" }),
      evidence({ camera: "B", source: "mobile", time: "09:38:47" }),
    ])
    expect(period).toBe("09:38:47 ~ 09:41:02")
  })
})

describe("buildDetectionMarkers", () => {
  it("places a marker only for vision detections on known camera nodes", () => {
    const cams = [camera("PHONE-001", 4, "2026-06-30T00:00:04Z")]
    const markers = buildDetectionMarkers(cams, [
      evidence({ camera: "PHONE-001", source: "vision", tone: "alert" }),
      evidence({ camera: "PHONE-001", source: "mobile" }), // not a detection
      evidence({ camera: "PHONE-009", source: "vision" }), // unknown node
    ])
    expect(markers).toHaveLength(1)
    expect(markers[0]?.id).toBe("mk-PHONE-001")
    expect(markers[0]?.tone).toBe("alert")
  })
})
