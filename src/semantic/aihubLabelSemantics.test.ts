import { describe, expect, it } from "vitest"
import { buildAihubSemanticReport } from "./aihubLabelSemantics"

const annotation = {
  videos: [
    {
      filename: "sample_c1.mp4",
      width: 1920,
      height: 1080,
      length: 30,
      cctv_distribution: "P1",
      cctv_camera: "CAM-A",
      cctv_angle: "A180",
      view: "c1",
    },
    {
      filename: "sample_c2.mp4",
      width: 1920,
      height: 1080,
      length: 30,
      cctv_distribution: "P1",
      cctv_camera: "CAM-B",
      cctv_angle: "A180",
      view: "c2",
    },
  ],
  annotations: {
    event_class: "신체적 충돌을 동반한 싸움",
    question: "사건 여부를 판별하라.",
    answer: "사건이 존재함.",
    caption: {
      c1: {
        caption_text: "충돌 상황이 관찰됨.",
        cot: {
          "1단계": "사람1이 사람2를 향해 팔을 휘두르고 있음",
          "2단계": "사람2가 화면 우측 방향으로 이동",
        },
      },
      c2: {
        caption_text: "다른 각도에서도 충돌 상황이 관찰됨.",
        cot: {
          "1단계": "사람2가 사람1을 피해 몸이 기울어짐",
          "2단계": "사람1이 사람2에게 발로 차는 동작을 하고 있음",
        },
      },
    },
    evidence: {
      c1: {
        evidence_text: "프레임 범위 100~220에서 객체 1,2번이 연속 추적됨.",
        frame_id: [100, 160, 220],
        obj_id: ["1,2", "1,2", "1,2"],
        obj_bbox: [
          [500, 410, 620, 650],
          [620, 420, 800, 690],
          [760, 430, 980, 730],
        ],
        obj_label: ["human", "human", "human"],
      },
      c2: {
        evidence_text: "프레임 범위 110~230에서 객체 1,2번이 연속 추적됨.",
        frame_id: [110, 170, 230],
        obj_id: ["1,2", "1,2", "1,2"],
        obj_bbox: [
          [900, 500, 1_100, 820],
          [780, 500, 1_000, 810],
          [650, 490, 900, 800],
        ],
        obj_label: ["human", "human", "human"],
      },
    },
  },
} as const

describe("AI Hub lightweight semantic extraction", () => {
  it("extracts camera agreement, motion, interaction, and action candidates", () => {
    const report = buildAihubSemanticReport("ph_test", annotation)

    expect(report.cameraCount).toBe(2)
    expect(report.riskLevel).toBe("high")
    expect(report.sharedMemorySummary).toContain("두 CCTV")
    expect(report.viewSemantics).toHaveLength(2)
    expect(report.viewSemantics[0]).toMatchObject({
      direction: "moving_right",
      distanceTrend: "approaching_camera",
      interaction: "physical_contact_candidate",
    })
    expect(report.viewSemantics[0]?.signals).toEqual(
      expect.arrayContaining([
        "bbox_motion",
        "distance_proxy",
        "interaction_candidate",
        "caption_action",
        "camera_agreement",
      ]),
    )
    expect(report.viewSemantics[0]?.actionCandidates).toContain("strike_or_kick_candidate")
    expect(report.phaseTimeline[0]).toContain("1단계")
  })
})
