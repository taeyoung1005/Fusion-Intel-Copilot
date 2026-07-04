import type { RealtimeAlert } from "./realtimeAlerts"

export type RealtimeAlertStackDepth = 0 | 1 | 2 | 3 | "overflow"

export type RealtimeAlertStackPlacement = {
  readonly alert: RealtimeAlert
  readonly depth: RealtimeAlertStackDepth
  readonly isTop: boolean
  readonly stackKey: string
}

type AlertOrderCandidate = {
  readonly alert: RealtimeAlert
  readonly originalIndex: number
  readonly recencyMs: number
}

const visibleDepths = [0, 1, 2, 3] as const

const alertRecencyMs = (alert: RealtimeAlert, originalIndex: number): number =>
  alert.lastSeenAtMs ?? alert.firstSeenAtMs ?? originalIndex

const stackDepthAt = (index: number): RealtimeAlertStackDepth => visibleDepths[index] ?? "overflow"

export const realtimeAlertStackPlacements = (
  alerts: readonly RealtimeAlert[],
): readonly RealtimeAlertStackPlacement[] =>
  alerts
    .map(
      (alert, originalIndex): AlertOrderCandidate => ({
        alert,
        originalIndex,
        recencyMs: alertRecencyMs(alert, originalIndex),
      }),
    )
    .sort(
      (left, right) => right.recencyMs - left.recencyMs || right.originalIndex - left.originalIndex,
    )
    .map(({ alert }, index): RealtimeAlertStackPlacement => {
      const depth = stackDepthAt(index)
      return {
        alert,
        depth,
        isTop: index === 0,
        stackKey: `${alert.kind}:${alert.id}`,
      }
    })
