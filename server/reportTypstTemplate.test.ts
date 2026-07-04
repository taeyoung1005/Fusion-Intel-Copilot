import { describe, expect, it } from "vitest"
import type { CommanderReportArtifact } from "../src/cop/reportArtifact"
import { buildReportTypstSource } from "./reportTypstTemplate"

const reportArtifact = {
  reportId: "RPT-20260705-INC-CARLA-N-01-140305",
  exportReceiptId: "EXP-20260705-INC-CARLA-N-01-140305",
  generatedAtIso: "2026-07-05T05:06:07.000Z",
  date: "2026-07-05",
  title: "FUSION INTEL COPILOT DAILY SITUATION REPORT",
  period: "14:03:05 ~ 14:03:35",
  incident: {
    id: "inc-CARLA-N-01",
    tone: "watch",
    zone: "CARLA-N-01",
    title: "CARLA-N-01 person approaching",
    meta: "북측 CARLA CCTV",
    time: "14:03:05",
    confidence: 91,
  },
  selectedClipId: "ev-carla-vision-CARLA-N-01-7",
  summary: "inc-CARLA-N-01 / CARLA-N-01 person approaching / 2개 증거 이벤트",
  rows: [
    { id: "total", label: "TOTAL EVENTS", value: "2" },
    { id: "alert", label: "ALERT EVENTS", value: "1" },
  ],
  timeline: [
    {
      clipId: "ev-carla-vision-CARLA-N-01-7",
      time: "14:03:05",
      camera: "CARLA-N-01",
      tone: "alert",
      source: "vision",
      label: "북측 CARLA CCTV · person 접근",
      detail: "CONF 91%",
      confidencePct: 91,
      detectionClass: "person",
      cooldownKey: "CARLA-N-01:person",
      trackId: "detr-person-007",
      promotedAtMs: 1_720_170_185_000,
    },
  ],
  perCameraFindings: [
    {
      camera: "CARLA-N-01",
      eventCount: 2,
      highestConfidencePct: 91,
      latestTime: "14:03:05",
      detectionClasses: ["person", "vehicle"],
    },
  ],
  responseActions: [{ gateId: "gate-data", label: "추가 데이터 검토", status: "PASS" }],
  unresolved: ["CARLA-E-02: 업링크 프레임 대기 (No Uplink Frame)"],
  citations: [
    {
      id: "cite-ev-carla-vision-CARLA-N-01-7",
      label: "CARLA-N-01 · DETR",
      time: "14:03:05",
    },
  ],
} satisfies CommanderReportArtifact

describe("buildReportTypstSource", () => {
  it("renders a Korean military daily report with approval, findings, timeline, citations, actions, and footer metadata", () => {
    // Given: a commander report artifact with every PDF section populated.
    const artifact = reportArtifact

    // When: the server builds Typst source for the artifact.
    const source = buildReportTypstSource(artifact)

    // Then: the Typst document contains the military report contract fields.
    expect(source).toContain('#set text(font: "Apple SD Gothic Neo")')
    expect(source).toContain("경계구역 일일 상황보고")
    expect(source).toContain(
      '#text("inc-CARLA-N-01 / CARLA-N-01 person approaching / 2개 증거 이벤트")',
    )
    for (const approvalLabel of ["작성", "상황실장", "경계대대장", "지휘관"]) {
      expect(source).toContain(approvalLabel)
    }
    for (const section of [
      "경계 근무 현황",
      "탐지 및 조치 내역",
      "증거 인용",
      "사람 확인 게이트 결과",
      "특이사항 및 관장 조치",
    ]) {
      expect(source).toContain(section)
    }
    for (const artifactField of [
      "RPT-20260705-INC-CARLA-N-01-140305",
      "2026-07-05",
      "CARLA-N-01",
      "91%",
      "person, vehicle",
      "14:03:05",
      "alert",
      "북측 CARLA CCTV · person 접근",
      "cite-ev-carla-vision-CARLA-N-01-7",
      "CARLA-N-01 · DETR",
      "추가 데이터 검토",
      "PASS",
      "inc-CARLA-N-01 / CARLA-N-01 person approaching / 2개 증거 이벤트",
      "CARLA-E-02: 업링크 프레임 대기 (No Uplink Frame)",
      "2026-07-05T05:06:07.000Z",
      "EXP-20260705-INC-CARLA-N-01-140305",
    ]) {
      expect(source).toContain(artifactField)
    }
  })
})
