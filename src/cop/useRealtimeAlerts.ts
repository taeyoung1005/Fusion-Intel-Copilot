import { useEffect, useRef, useState } from "react"
import type { EvidenceClip } from "./copData"
import {
  type RealtimeAlert,
  isCarlaVisionClip,
  mergeRealtimeDetectionAlert,
} from "./realtimeAlerts"

type UseRealtimeAlertsResult = {
  readonly alerts: readonly RealtimeAlert[]
  readonly dismissAlert: (id: string) => void
  readonly updateAlertSettings: (
    id: string,
    settings: { readonly autoClose: boolean; readonly autoCloseMs: number },
  ) => void
}

export const useRealtimeAlerts = (
  evidenceClips: readonly EvidenceClip[],
): UseRealtimeAlertsResult => {
  const [alerts, setAlerts] = useState<readonly RealtimeAlert[]>([])
  const seenClipIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const newClips = evidenceClips.filter(
      (clip) => isCarlaVisionClip(clip) && !seenClipIdsRef.current.has(clip.id),
    )
    if (newClips.length === 0) {
      return
    }
    const now = Date.now()
    for (const clip of newClips) {
      seenClipIdsRef.current.add(clip.id)
    }
    setAlerts((previous) =>
      newClips.reduce(
        (nextAlerts, clip) => mergeRealtimeDetectionAlert(nextAlerts, clip, { nowMs: now }).alerts,
        previous,
      ),
    )
  }, [evidenceClips])

  const dismissAlert = (id: string): void => {
    setAlerts((previous) => previous.filter((alert) => alert.id !== id))
  }

  const updateAlertSettings = (
    id: string,
    settings: { readonly autoClose: boolean; readonly autoCloseMs: number },
  ): void => {
    setAlerts((previous) =>
      previous.map((alert) => (alert.id === id ? { ...alert, ...settings } : alert)),
    )
  }

  return { alerts, dismissAlert, updateAlertSettings }
}
