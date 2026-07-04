import type { RealtimeAlert } from "./realtimeAlerts"

type CriticalEntryPulseAlertIdsInput = {
  readonly alerts: readonly RealtimeAlert[]
  readonly escalatedEdge: boolean
  readonly previousAlertIds: ReadonlySet<string>
}

export const isEscalationRisingEdge = (
  previousEscalated: boolean,
  currentEscalated: boolean,
): boolean => !previousEscalated && currentEscalated

export const alertIdSet = (alerts: readonly RealtimeAlert[]): ReadonlySet<string> =>
  new Set(alerts.map((alert) => alert.id))

export const criticalEntryPulseAlertIds = ({
  alerts,
  escalatedEdge,
  previousAlertIds,
}: CriticalEntryPulseAlertIdsInput): readonly string[] => {
  if (!escalatedEdge) {
    return []
  }

  return alerts
    .filter((alert) => alert.clip.tone === "alert" && !previousAlertIds.has(alert.id))
    .map((alert) => alert.id)
}
