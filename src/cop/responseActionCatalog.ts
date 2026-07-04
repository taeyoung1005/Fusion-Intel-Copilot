import type { AlertTone } from "./copData"
import type { DailyReportRow } from "./operationalTelemetry"

export type ResponseActionKind = "auto" | "manual"

export type ResponseAction = {
  readonly id: string
  readonly kind: ResponseActionKind
  readonly label: string
  readonly confirmedText: string
}

export type TakenResponseAction = {
  readonly actionId: string
  readonly label: string
  readonly takenAtMs: number
}

// Normal/uncertain tiers are handled by Codex automatically (dashboard
// display only, no simulated actuation); watch/alert/confirmed require an
// operator to click a dispatch button, escalating in severity.
export const RESPONSE_ACTION_BY_TONE: Record<AlertTone, ResponseAction> = {
  normal: {
    id: "routine-monitoring",
    kind: "auto",
    label: "정상 감시 유지",
    confirmedText: "정상 감시 유지",
  },
  uncertain: {
    id: "auto-priority-watch",
    kind: "auto",
    label: "Codex 자동 조치: 인접 카메라 우선 감시 전환",
    confirmedText: "Codex 자동 조치: 인접 카메라 우선 감시 전환",
  },
  watch: {
    id: "patrol-reinforce",
    kind: "manual",
    label: "순찰 강화 지시",
    confirmedText: "순찰 강화 지시됨",
  },
  alert: {
    id: "qrf-dispatch",
    kind: "manual",
    label: "번개조 출동 지시",
    confirmedText: "번개조 출동 지시됨",
  },
  confirmed: {
    id: "standby-vulcan-ready",
    kind: "manual",
    label: "5분대기조 출동 + 발칸 사격 준비",
    confirmedText: "5분대기조 출동 + 발칸 사격 준비 지시됨",
  },
}

export const formatTakenAtClock = (ms: number): string => {
  const date = new Date(ms)
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const responseActionReportRow = (
  action: TakenResponseAction | undefined,
): DailyReportRow => ({
  id: "response-action",
  label: "대응 조치",
  value:
    action === undefined ? "없음" : `${action.label} · ${formatTakenAtClock(action.takenAtMs)}`,
})
