import { Settings2, X } from "lucide-react"
import { type ReactElement, useEffect, useRef, useState } from "react"
import {
  alertIdSet,
  criticalEntryPulseAlertIds,
  isEscalationRisingEdge,
} from "./alertEscalationPulse"
import { carlaCameraStreamSrc } from "./carlaCameraClient"
import {
  type RealtimeAlertStackDepth,
  realtimeAlertStackPlacements,
} from "./realtimeAlertStackOrder"
import type { RealtimeAlert } from "./realtimeAlerts"
import { useCarlaWebrtcVideo } from "./useCarlaWebrtcVideo"

const CRITICAL_ENTRY_PULSE_MS = 1_800

type AlertSettings = { readonly autoClose: boolean; readonly autoCloseMs: number }

type RealtimeAlertStackProps = {
  readonly alerts: readonly RealtimeAlert[]
  readonly escalated: boolean
  readonly onDismiss: (id: string) => void
  readonly onUpdateSettings: (id: string, settings: AlertSettings) => void
}

export function RealtimeAlertStack({
  alerts,
  escalated,
  onDismiss,
  onUpdateSettings,
}: RealtimeAlertStackProps): ReactElement {
  const previousEscalatedRef = useRef(escalated)
  const previousAlertIdsRef = useRef<ReadonlySet<string>>(alertIdSet(alerts))
  const pulseTimersRef = useRef<Map<string, number>>(new Map())
  const [pulsingAlertIds, setPulsingAlertIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const pulseIds = criticalEntryPulseAlertIds({
      alerts,
      escalatedEdge: isEscalationRisingEdge(previousEscalatedRef.current, escalated),
      previousAlertIds: previousAlertIdsRef.current,
    })

    previousEscalatedRef.current = escalated
    previousAlertIdsRef.current = alertIdSet(alerts)

    if (pulseIds.length === 0) {
      return
    }

    setPulsingAlertIds((previous) => {
      const next = new Set(previous)
      for (const id of pulseIds) {
        next.add(id)
      }
      return next
    })

    for (const id of pulseIds) {
      const previousTimer = pulseTimersRef.current.get(id)
      if (previousTimer !== undefined) {
        window.clearTimeout(previousTimer)
      }
      const timer = window.setTimeout(() => {
        pulseTimersRef.current.delete(id)
        setPulsingAlertIds((previous) => {
          const next = new Set(previous)
          next.delete(id)
          return next
        })
      }, CRITICAL_ENTRY_PULSE_MS)
      pulseTimersRef.current.set(id, timer)
    }
  }, [alerts, escalated])

  useEffect(
    () => () => {
      for (const timer of pulseTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      pulseTimersRef.current.clear()
    },
    [],
  )

  const completePulse = (id: string): void => {
    const timer = pulseTimersRef.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      pulseTimersRef.current.delete(id)
    }
    setPulsingAlertIds((previous) => {
      const next = new Set(previous)
      next.delete(id)
      return next
    })
  }

  const placements = realtimeAlertStackPlacements(alerts)

  return (
    <div className="cop-realtime-alert-stack" aria-live="polite">
      {placements.map((placement) => (
        <RealtimeAlertCard
          key={placement.stackKey}
          alert={placement.alert}
          depth={placement.depth}
          isTop={placement.isTop}
          pulseCriticalEntry={pulsingAlertIds.has(placement.alert.id)}
          onPulseComplete={completePulse}
          onDismiss={onDismiss}
          onUpdateSettings={onUpdateSettings}
        />
      ))}
    </div>
  )
}

type RealtimeAlertCardProps = {
  readonly alert: RealtimeAlert
  readonly depth: RealtimeAlertStackDepth
  readonly isTop: boolean
  readonly pulseCriticalEntry: boolean
  readonly onPulseComplete: (id: string) => void
  readonly onDismiss: (id: string) => void
  readonly onUpdateSettings: (id: string, settings: AlertSettings) => void
}

function RealtimeAlertCard({
  alert,
  depth,
  isTop,
  pulseCriticalEntry,
  onPulseComplete,
  onDismiss,
  onUpdateSettings,
}: RealtimeAlertCardProps): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const onDismissRef = useRef(onDismiss)
  const webrtc = useCarlaWebrtcVideo(alert.cameraId, true)
  const webrtcLive = webrtc.state === "live"
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!alert.autoClose) {
      return
    }
    const timer = window.setTimeout(() => onDismissRef.current(alert.id), alert.autoCloseMs)
    return () => window.clearTimeout(timer)
  }, [alert.id, alert.autoClose, alert.autoCloseMs])

  const isCorrelation = alert.kind === "correlation"

  return (
    <div
      className={`cop-realtime-alert tone-${alert.clip.tone}${isCorrelation ? " kind-correlation" : ""}${pulseCriticalEntry ? " is-critical-entry-pulse" : ""}`}
      data-stack-depth={depth}
      data-stack-active={isTop ? "true" : "false"}
      role="alert"
      aria-hidden={isTop ? undefined : true}
      onAnimationEnd={(event) => {
        if (pulseCriticalEntry && event.currentTarget === event.target) {
          onPulseComplete(alert.id)
        }
      }}
      style={
        isCorrelation ? { borderColor: "#f4c430", boxShadow: "0 0 0 1px #f4c430 inset" } : undefined
      }
    >
      <header className="cop-realtime-alert-head">
        <strong>{isCorrelation ? `⚠ ${alert.cameraId}` : alert.cameraId}</strong>
        <div className="cop-realtime-alert-actions">
          <button
            type="button"
            className="cop-icon-btn"
            aria-label={`${alert.cameraId} 알림 설정`}
            tabIndex={isTop ? undefined : -1}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <Settings2 size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="cop-icon-btn"
            aria-label={`${alert.cameraId} 알림 닫기`}
            tabIndex={isTop ? undefined : -1}
            onClick={() => onDismiss(alert.id)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div className="cop-realtime-alert-settings">
          <label>
            <input
              type="checkbox"
              checked={alert.autoClose}
              tabIndex={isTop ? undefined : -1}
              onChange={(event) =>
                onUpdateSettings(alert.id, {
                  autoClose: event.currentTarget.checked,
                  autoCloseMs: alert.autoCloseMs,
                })
              }
            />
            자동 닫힘
          </label>
          <label>
            <input
              type="number"
              min={1}
              value={Math.round(alert.autoCloseMs / 1000)}
              tabIndex={isTop ? undefined : -1}
              onChange={(event) => {
                const seconds = Number(event.currentTarget.value)
                if (Number.isNaN(seconds) || seconds <= 0) {
                  return
                }
                onUpdateSettings(alert.id, {
                  autoClose: alert.autoClose,
                  autoCloseMs: seconds * 1000,
                })
              }}
            />
            초
          </label>
        </div>
      )}

      <div className="cop-realtime-alert-media">
        <video
          ref={webrtc.videoRef}
          className={webrtcLive ? undefined : "pending"}
          aria-label={`${alert.cameraId} WebRTC 실시간 탐지 영상`}
          autoPlay
          muted
          playsInline
        />
        <img
          className={webrtcLive ? "fallback" : undefined}
          src={carlaCameraStreamSrc(alert.cameraId)}
          alt={`${alert.cameraId} 실시간 탐지 영상`}
        />
      </div>
      <p className="cop-realtime-alert-detail">
        {alert.clip.label} · {alert.clip.detail}
      </p>
    </div>
  )
}
