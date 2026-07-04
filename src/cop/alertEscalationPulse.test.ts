import { describe, expect, it } from "vitest"
import { criticalEntryPulseAlertIds, isEscalationRisingEdge } from "./alertEscalationPulse"
import type { EvidenceClip } from "./copTimelineData"
import type { RealtimeAlert } from "./realtimeAlerts"

const clip = (id: string, tone: EvidenceClip["tone"]): EvidenceClip => ({
  id,
  time: "09:10:00",
  camera: "CARLA-01",
  tone,
  label: `${tone} 탐지`,
  detail: "CONF 91%",
  source: "vision",
  confidencePct: 91,
})

const alert = (id: string, tone: EvidenceClip["tone"]): RealtimeAlert => ({
  id,
  kind: "detection",
  cameraId: "CARLA-01",
  clip: clip(id, tone),
  autoClose: true,
  autoCloseMs: 10_000,
})

describe("isEscalationRisingEdge", () => {
  it("triggers once when escalated changes from false to true", () => {
    expect(isEscalationRisingEdge(false, true)).toBe(true)
  })

  it("does not trigger while escalated stays true", () => {
    expect(isEscalationRisingEdge(true, true)).toBe(false)
  })

  it("triggers again after escalated returns to false before true", () => {
    const states = [false, true, true, false, true] as const
    const triggers = states
      .slice(1)
      .map((current, index) => isEscalationRisingEdge(states[index] ?? false, current))

    expect(triggers).toEqual([true, false, false, true])
  })
})

describe("criticalEntryPulseAlertIds", () => {
  it("selects only newly entered top-tone alerts during an escalation edge", () => {
    const alerts = [
      alert("existing-critical", "alert"),
      alert("new-watch", "watch"),
      alert("new-critical", "alert"),
    ]

    const pulseIds = criticalEntryPulseAlertIds({
      alerts,
      escalatedEdge: true,
      previousAlertIds: new Set(["existing-critical"]),
    })

    expect(pulseIds).toEqual(["new-critical"])
  })

  it("does not select alerts when there is no escalation edge", () => {
    const pulseIds = criticalEntryPulseAlertIds({
      alerts: [alert("new-critical", "alert")],
      escalatedEdge: false,
      previousAlertIds: new Set(),
    })

    expect(pulseIds).toEqual([])
  })
})
