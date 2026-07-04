import type { EvidenceClip } from "./copData"

export const CARLA_VISION_ID_PREFIX = "ev-carla-vision-"
export const REALTIME_ALERT_GAP_MS = 8_000
export const REALTIME_ALERT_DEDUPE_WINDOW_MS = 4_000
export const DEFAULT_AUTO_CLOSE = true
export const DEFAULT_AUTO_CLOSE_MS = 10_000

export type RealtimeAlert = {
  readonly id: string
  readonly kind: "detection" | "correlation"
  readonly cameraId: string
  readonly clip: EvidenceClip
  readonly autoClose: boolean
  readonly autoCloseMs: number
  readonly dedupeKey?: string
  readonly duplicateCount?: number
  readonly firstSeenAtMs?: number
  readonly lastSeenAtMs?: number
  readonly mergedClipIds?: readonly string[]
}
export type RealtimeAlertMergeResult =
  | {
      readonly kind: "opened"
      readonly alertId: string
      readonly alerts: readonly RealtimeAlert[]
    }
  | {
      readonly kind: "merged"
      readonly alertId: string
      readonly alerts: readonly RealtimeAlert[]
    }
export type RealtimeAlertMergeOptions = {
  readonly nowMs: number
  readonly dedupeWindowMs?: number
}
type RealtimeAlertBuildInput = {
  readonly dedupeKey: string
  readonly nowMs: number
}

export const isCarlaVisionClip = (clip: EvidenceClip): boolean =>
  clip.id.startsWith(CARLA_VISION_ID_PREFIX)

export const shouldOpenNewAlert = (
  lastAlertAt: number | undefined,
  now: number,
  gapMs: number = REALTIME_ALERT_GAP_MS,
): boolean => lastAlertAt === undefined || now - lastAlertAt >= gapMs

const normalizeAlertClass = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "object"

const alertDedupeKey = (clip: EvidenceClip): string =>
  clip.cooldownKey ?? `${clip.camera}:${normalizeAlertClass(clip.detectionClass ?? clip.label)}`

const appendUniqueClipId = (clipIds: readonly string[], clipId: string): readonly string[] =>
  clipIds.includes(clipId) ? clipIds : [...clipIds, clipId]

const buildDetectionAlert = (
  clip: EvidenceClip,
  input: RealtimeAlertBuildInput,
): RealtimeAlert => ({
  id: clip.id,
  kind: "detection",
  cameraId: clip.camera,
  clip,
  autoClose: DEFAULT_AUTO_CLOSE,
  autoCloseMs: DEFAULT_AUTO_CLOSE_MS,
  dedupeKey: input.dedupeKey,
  duplicateCount: 1,
  firstSeenAtMs: input.nowMs,
  lastSeenAtMs: input.nowMs,
  mergedClipIds: [clip.id],
})

const mergeDetectionAlert = (
  alert: RealtimeAlert,
  clip: EvidenceClip,
  input: RealtimeAlertBuildInput,
): RealtimeAlert => {
  const mergedClipIds = appendUniqueClipId(alert.mergedClipIds ?? [alert.clip.id], clip.id)
  return {
    ...alert,
    clip,
    dedupeKey: input.dedupeKey,
    duplicateCount: mergedClipIds.length,
    firstSeenAtMs: alert.firstSeenAtMs ?? input.nowMs,
    lastSeenAtMs: input.nowMs,
    mergedClipIds,
  }
}

export const mergeRealtimeDetectionAlert = (
  previous: readonly RealtimeAlert[],
  clip: EvidenceClip,
  options: RealtimeAlertMergeOptions,
): RealtimeAlertMergeResult => {
  const dedupeKey = alertDedupeKey(clip)
  const dedupeWindowMs = options.dedupeWindowMs ?? REALTIME_ALERT_DEDUPE_WINDOW_MS
  const duplicateIndex = previous.findIndex((alert) => {
    const lastSeenAtMs = alert.lastSeenAtMs
    return (
      alert.kind === "detection" &&
      alert.dedupeKey === dedupeKey &&
      lastSeenAtMs !== undefined &&
      options.nowMs - lastSeenAtMs <= dedupeWindowMs
    )
  })
  if (duplicateIndex === -1) {
    const alert = buildDetectionAlert(clip, { dedupeKey, nowMs: options.nowMs })
    return { kind: "opened", alertId: alert.id, alerts: [...previous, alert] }
  }

  const duplicate = previous[duplicateIndex]
  if (duplicate === undefined) {
    const alert = buildDetectionAlert(clip, { dedupeKey, nowMs: options.nowMs })
    return { kind: "opened", alertId: alert.id, alerts: [...previous, alert] }
  }
  const merged = mergeDetectionAlert(duplicate, clip, { dedupeKey, nowMs: options.nowMs })
  return {
    kind: "merged",
    alertId: merged.id,
    alerts: previous.map((alert, index) => (index === duplicateIndex ? merged : alert)),
  }
}
