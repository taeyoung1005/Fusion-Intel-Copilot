import type { EvidenceClip } from "./copData"

export const CARLA_VISION_ID_PREFIX = "ev-carla-vision-"
export const REALTIME_ALERT_GAP_MS = 8_000
export const DEFAULT_AUTO_CLOSE = true
export const DEFAULT_AUTO_CLOSE_MS = 10_000

export type RealtimeAlert = {
  readonly id: string
  readonly kind: "detection" | "correlation"
  readonly cameraId: string
  readonly clip: EvidenceClip
  readonly autoClose: boolean
  readonly autoCloseMs: number
}

export const isCarlaVisionClip = (clip: EvidenceClip): boolean =>
  clip.id.startsWith(CARLA_VISION_ID_PREFIX)

export const shouldOpenNewAlert = (
  lastAlertAt: number | undefined,
  now: number,
  gapMs: number = REALTIME_ALERT_GAP_MS,
): boolean => lastAlertAt === undefined || now - lastAlertAt >= gapMs
