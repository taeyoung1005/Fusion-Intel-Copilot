import { useEffect, useRef, useState } from "react"
import type { EvidenceClip } from "./copData"
import {
  DEFAULT_AUTO_CLOSE,
  DEFAULT_AUTO_CLOSE_MS,
  REALTIME_ALERT_GAP_MS,
  type RealtimeAlert,
  isCarlaVisionClip,
  shouldOpenNewAlert,
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
  const lastAlertAtRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const newClips = evidenceClips.filter(
      (clip) => isCarlaVisionClip(clip) && !seenClipIdsRef.current.has(clip.id),
    )
    if (newClips.length === 0) {
      return
    }
    const now = Date.now()
    const toOpen: RealtimeAlert[] = []
    for (const clip of newClips) {
      seenClipIdsRef.current.add(clip.id)
      const cameraId = clip.camera
      if (shouldOpenNewAlert(lastAlertAtRef.current.get(cameraId), now, REALTIME_ALERT_GAP_MS)) {
        toOpen.push({
          id: clip.id,
          cameraId,
          clip,
          autoClose: DEFAULT_AUTO_CLOSE,
          autoCloseMs: DEFAULT_AUTO_CLOSE_MS,
        })
      }
      lastAlertAtRef.current.set(cameraId, now)
    }
    if (toOpen.length > 0) {
      setAlerts((previous) => [...previous, ...toOpen])
    }
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
