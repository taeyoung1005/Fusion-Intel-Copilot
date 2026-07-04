import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  CodexSummary,
  buildCodexSummaryContext,
  buildCodexSummaryRequestKey,
  codexProgressText,
} from "./RightRailCodex"
import type { Citation, EvidenceClip, Incident, MissingContext } from "./copData"

const selectedIncident = {
  id: "inc-test",
  tone: "WATCH",
  zone: "PERIMETER EAST",
  title: "Camera Handoff Event",
  meta: "CAM-N-02 -> CAM-E-01",
  time: "09:41:02",
  confidence: 72,
} satisfies Incident

const selectedClip = {
  id: "clip-test",
  time: "09:41:02",
  camera: "CAM-N-02",
  tone: "watch",
  label: "CAM-N-02 person detected",
  detail: "DETR 82%",
  source: "vision",
  confidencePct: 82,
} satisfies EvidenceClip

const citation = {
  id: "cite-test",
  label: "CAM-N-02 · DETR",
  time: "09:41:02",
} satisfies Citation

const missingContext = {
  id: "miss-test",
  camera: "CAM-E-01",
  reason: "업링크 프레임 대기",
  since: "연결 직후",
} satisfies MissingContext

describe("CodexSummary", () => {
  it("renders the Fusion Intel Copilot product label", () => {
    const markup = renderToStaticMarkup(
      createElement(CodexSummary, {
        selectedClip: undefined,
        selectedIncident,
        metrics: [],
        citations: [],
        missingContext: [],
        recentActivitySummary: undefined,
      }),
    )

    expect(markup).toContain("Fusion Intel Copilot")
  })

  it("renders the initial updated timestamp as an empty live value", () => {
    const markup = renderToStaticMarkup(
      createElement(CodexSummary, {
        selectedClip: undefined,
        selectedIncident,
        metrics: [],
        citations: [],
        missingContext: [],
        recentActivitySummary: undefined,
      }),
    )

    expect(markup).toContain("Updated --:--:--")
    expect(markup).not.toContain("Updated 09:42:10")
  })

  it("uses the posture citation when no evidence citations exist", () => {
    const context = buildCodexSummaryContext({
      selectedClip: undefined,
      selectedIncident,
      citations: [],
      missingContext: [],
      recentActivitySummary: undefined,
    })

    expect(context.citations).toEqual([{ id: "cite-system", label: "SYSTEM-POSTURE" }])
    expect(context.responseOutcome).toBe("사람 확인 게이트 대기 / 선택 클립 없음")
  })

  it("keeps the same request key for equivalent telemetry and changes it for input changes", () => {
    const input = {
      selectedClip,
      selectedIncident,
      citations: [citation],
      missingContext: [missingContext],
      recentActivitySummary: "5분간 2회 탐지",
      telemetryFingerprint: "render-1",
    }
    const stableCopy = {
      selectedClip: { ...selectedClip },
      selectedIncident: { ...selectedIncident },
      citations: [{ ...citation }],
      missingContext: [{ ...missingContext }],
      recentActivitySummary: "5분간 2회 탐지",
      telemetryFingerprint: "render-2",
    }
    const changedInput = {
      ...input,
      selectedClip: { ...selectedClip, label: "CAM-N-02 vehicle detected" },
    }

    expect(buildCodexSummaryRequestKey(stableCopy)).toBe(buildCodexSummaryRequestKey(input))
    expect(buildCodexSummaryRequestKey(changedInput)).not.toBe(buildCodexSummaryRequestKey(input))
  })

  it("surfaces retrying status copy instead of raw timeout text", () => {
    expect(codexProgressText("retrying")).toBe("Codex 판단 재시도 중")
  })
})
