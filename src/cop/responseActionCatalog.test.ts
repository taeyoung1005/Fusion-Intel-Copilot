import { describe, expect, it } from "vitest"
import {
  RESPONSE_ACTION_BY_TONE,
  formatTakenAtClock,
  responseActionReportRow,
} from "./responseActionCatalog"

describe("RESPONSE_ACTION_BY_TONE", () => {
  it("treats normal and uncertain as automatic Codex-handled tiers", () => {
    expect(RESPONSE_ACTION_BY_TONE.normal.kind).toBe("auto")
    expect(RESPONSE_ACTION_BY_TONE.uncertain.kind).toBe("auto")
  })

  it("treats watch, alert, and confirmed as manual dispatch tiers with distinct labels", () => {
    expect(RESPONSE_ACTION_BY_TONE.watch.kind).toBe("manual")
    expect(RESPONSE_ACTION_BY_TONE.watch.label).toBe("순찰 강화 지시")
    expect(RESPONSE_ACTION_BY_TONE.alert.kind).toBe("manual")
    expect(RESPONSE_ACTION_BY_TONE.alert.label).toBe("번개조 출동 지시")
    expect(RESPONSE_ACTION_BY_TONE.confirmed.kind).toBe("manual")
    expect(RESPONSE_ACTION_BY_TONE.confirmed.label).toBe("5분대기조 출동 + 발칸 사격 준비")
  })
})

describe("responseActionReportRow", () => {
  it("reports 없음 when no action has been taken", () => {
    const row = responseActionReportRow(undefined)
    expect(row).toEqual({ id: "response-action", label: "대응 조치", value: "없음" })
  })

  it("reports the taken action's label and formatted time", () => {
    const takenAtMs = new Date("2026-07-05T00:00:00").setHours(14, 3, 5, 0)
    const row = responseActionReportRow({
      actionId: "qrf-dispatch",
      label: "번개조 출동 지시",
      takenAtMs,
    })
    expect(row.value).toBe(`번개조 출동 지시 · ${formatTakenAtClock(takenAtMs)}`)
    expect(row.value).toContain("14:03:05")
  })
})
