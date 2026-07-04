import { describe, expect, it } from "vitest"
import type { EvidenceClip } from "./copData"
import type { Incident } from "./copData"
import { buildDynamicCameraRecord, carlaCameraInput } from "./dynamicMapCamera"
import type { WindowEntry } from "./evidenceWindowSummary"
import {
  buildCitations,
  buildCodexMetrics,
  buildDailyReportPeriod,
  buildDailyReportRows,
  buildDetectionMarkers,
  buildEvidenceRelationshipGraph,
  buildIncidents,
  buildMissingContext,
  buildOperationalMetricTiles,
  buildRecommendedAction,
  buildResponseGates,
} from "./operationalTelemetry"

const camera = (id: string, frameCount: number, lastFrameAt: string | null) =>
  buildDynamicCameraRecord(
    carlaCameraInput(id, `${id} 라벨`, 0, frameCount, lastFrameAt, "data:image/jpeg;base64,QQ=="),
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

  it("computes objective evidence from real vision detections, not frame counts", () => {
    const cams = [camera("PHONE-001", 10, "2026-06-30T00:00:10Z")]
    const evid = [evidence({ camera: "PHONE-001", source: "vision", confidencePct: 80 })]
    const metrics = buildCodexMetrics(cams, evid)
    const byId = Object.fromEntries(metrics.map((m) => [m.id, m.value]))
    expect(byId.evidence).toBe("1") // 1 real vision detection; frames do not count as evidence
    expect(byId.anomalies).toBe("1")
    expect(byId.nodes).toBe("1")
    expect(byId.confidence).toBe("80%")
  })

  it("keeps objective evidence at zero when only frame counts increase", () => {
    const cams = [
      camera("PHONE-001", 10, "2026-06-30T00:00:10Z"),
      camera("PHONE-002", 24, "2026-06-30T00:00:24Z"),
    ]
    const metrics = buildCodexMetrics(cams, [])
    const byId = Object.fromEntries(metrics.map((m) => [m.id, m.value]))
    expect(byId.evidence).toBe("0")
  })
})

describe("buildOperationalMetricTiles", () => {
  it("computes coverage, false-positive proxy, latency, and confidence from live inputs", () => {
    const cams = [
      camera("PHONE-001", 10, "2026-06-30T00:00:01.000Z"),
      buildDynamicCameraRecord(carlaCameraInput("PHONE-002", "무프레임", 1, 0, null, null)),
    ]
    const visionOne = evidence({
      camera: "PHONE-001",
      source: "vision",
      tone: "watch",
      confidencePct: 80,
    })
    const visionTwo = evidence({
      camera: "PHONE-001",
      source: "vision",
      tone: "uncertain",
      confidencePct: 60,
    })
    const mobile = evidence({ camera: "PHONE-002", source: "mobile", tone: "watch" })
    const windowBuffer = new Map<string, readonly WindowEntry[]>([
      [
        "PHONE-001",
        [
          { clip: visionOne, observedAtMs: Date.parse("2026-06-30T00:00:02.200Z") },
          { clip: visionTwo, observedAtMs: Date.parse("2026-06-30T00:00:04.800Z") },
        ],
      ],
    ])

    const tiles = buildOperationalMetricTiles({
      cameras: cams,
      evidence: [visionOne, visionTwo, mobile],
      windowBuffer,
    })
    const byId = Object.fromEntries(tiles.map((tile) => [tile.id, tile]))

    expect(byId.coverage?.value).toBe("50%")
    expect(byId.coverage?.detail).toBe("프레임 업링크 1/2")
    expect(byId.falsePositive?.value).toBe("50%")
    expect(byId.falsePositive?.detail).toBe("불확실 1/2")
    expect(byId.detectionLatency?.value).toBe("2.5s")
    expect(byId.detectionLatency?.detail).toBe("수신→탐지 평균")
    expect(byId.averageConfidence?.value).toBe("70%")
    expect(byId.averageConfidence?.detail).toBe("DETR 2건 평균")
  })

  it("marks unavailable metrics with an explicit dash empty state", () => {
    const tiles = buildOperationalMetricTiles({
      cameras: [],
      evidence: [],
      windowBuffer: new Map(),
    })
    const byId = Object.fromEntries(tiles.map((tile) => [tile.id, tile]))

    expect(byId.coverage?.value).toBe("—")
    expect(byId.coverage?.detail).toBe("카메라 없음")
    expect(byId.falsePositive?.value).toBe("—")
    expect(byId.detectionLatency?.value).toBe("—")
    expect(byId.averageConfidence?.value).toBe("—")
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
      carlaCameraInput("PHONE-002", "무프레임", 1, 0, null, null),
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

describe("buildRecommendedAction", () => {
  const incident = {
    id: "inc-PHONE-001",
    tone: "WATCH",
    zone: "PHONE-001",
    title: "person",
    meta: "PHONE-001",
    time: "09:41:02",
    confidence: 90,
  } satisfies Incident

  it("returns missing-data copy when context gaps exist", () => {
    const action = buildRecommendedAction(
      incident,
      [{ id: "miss-PHONE-001", camera: "PHONE-001", reason: "No frame", since: "연결 직후" }],
      [],
    )

    expect(action.headline).toBe("누락 데이터 보완 필요")
    expect(action.body).toContain("PHONE-001")
    expect(action.body).toContain("누락 맥락 1건 보완 후 보고서 생성 가능")
  })

  it("returns report-ready copy when every gate has passed and context is complete", () => {
    const action = buildRecommendedAction(
      incident,
      [],
      [
        { id: "gate-fact", label: "이벤트 사실 확인", initial: "PASS" },
        { id: "gate-context", label: "맥락 검토 완료", initial: "PASS" },
      ],
    )

    expect(action.headline).toBe("보고서 생성 가능")
    expect(action.cta).toBe("보고서 생성 게이트로 이동")
  })

  it("returns human-review copy when any gate is pending", () => {
    const action = buildRecommendedAction(
      incident,
      [],
      [
        { id: "gate-fact", label: "이벤트 사실 확인", initial: "PASS" },
        { id: "gate-data", label: "추가 데이터 검토", initial: "PENDING" },
      ],
    )

    expect(action.headline).toBe("사람 확인 게이트 검토 필요")
    expect(action.cta).toBe("사람 확인 게이트로 이동")
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

describe("buildEvidenceRelationshipGraph", () => {
  it("returns an empty graph when the telemetry only has the standby incident", () => {
    const graph = buildEvidenceRelationshipGraph({
      incidents: buildIncidents([], []),
      citations: buildCitations([]),
      evidence: [],
      windowBuffer: new Map(),
      responseGates: [],
      selectedIncidentId: "inc-standby",
    })

    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
  })

  it("connects a real incident to camera, track, DETR detection, citation, and response nodes", () => {
    const clip = evidence({
      id: "ev-carla-vision-CARLA-01-3",
      camera: "CARLA-01",
      source: "vision",
      tone: "alert",
      confidencePct: 88,
      time: "09:44:11",
    })
    const incidents = buildIncidents([camera("CARLA-01", 12, "2026-06-30T00:00:12Z")], [clip])
    const selectedIncident = incidents[0]
    if (selectedIncident === undefined) {
      throw new Error("expected incident fixture")
    }
    const citations = buildCitations([clip])
    const responseGates = buildResponseGates(selectedIncident, [clip], [])
    const graph = buildEvidenceRelationshipGraph({
      incidents,
      citations,
      evidence: [clip],
      windowBuffer: new Map<string, readonly WindowEntry[]>([
        ["CARLA-01", [{ clip, observedAtMs: Date.parse("2026-06-30T00:00:14Z") }]],
      ]),
      responseGates,
      selectedIncidentId: selectedIncident.id,
    })

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "incident:inc-CARLA-01",
      "camera:CARLA-01",
      "track:CARLA-01",
      "detection:ev-carla-vision-CARLA-01-3",
      "citation:cite-ev-carla-vision-CARLA-01-3",
      "response:inc-CARLA-01",
    ])
    expect(graph.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual([
      "incident:inc-CARLA-01->camera:CARLA-01",
      "camera:CARLA-01->track:CARLA-01",
      "track:CARLA-01->detection:ev-carla-vision-CARLA-01-3",
      "detection:ev-carla-vision-CARLA-01-3->citation:cite-ev-carla-vision-CARLA-01-3",
      "incident:inc-CARLA-01->response:inc-CARLA-01",
    ])
    expect(graph.nodes.find((node) => node.kind === "detection")?.clipId).toBe(clip.id)
    expect(graph.nodes.find((node) => node.kind === "citation")?.citationId).toBe(
      "cite-ev-carla-vision-CARLA-01-3",
    )
  })
})
