import { Settings2, X } from "lucide-react"
import { type ReactElement, useEffect, useState } from "react"
import { carlaCameraStreamSrc } from "./carlaCameraClient"
import type { RealtimeAlert } from "./realtimeAlerts"

type AlertSettings = { readonly autoClose: boolean; readonly autoCloseMs: number }

type RealtimeAlertStackProps = {
  readonly alerts: readonly RealtimeAlert[]
  readonly onDismiss: (id: string) => void
  readonly onUpdateSettings: (id: string, settings: AlertSettings) => void
}

export function RealtimeAlertStack({
  alerts,
  onDismiss,
  onUpdateSettings,
}: RealtimeAlertStackProps): ReactElement {
  return (
    <div className="cop-realtime-alert-stack" aria-live="polite">
      {alerts.map((alert) => (
        <RealtimeAlertCard
          key={alert.id}
          alert={alert}
          onDismiss={onDismiss}
          onUpdateSettings={onUpdateSettings}
        />
      ))}
    </div>
  )
}

type RealtimeAlertCardProps = {
  readonly alert: RealtimeAlert
  readonly onDismiss: (id: string) => void
  readonly onUpdateSettings: (id: string, settings: AlertSettings) => void
}

function RealtimeAlertCard({
  alert,
  onDismiss,
  onUpdateSettings,
}: RealtimeAlertCardProps): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (!alert.autoClose) {
      return
    }
    const timer = window.setTimeout(() => onDismiss(alert.id), alert.autoCloseMs)
    return () => window.clearTimeout(timer)
  }, [alert.id, alert.autoClose, alert.autoCloseMs, onDismiss])

  return (
    <div className={`cop-realtime-alert tone-${alert.clip.tone}`} role="alert">
      <header className="cop-realtime-alert-head">
        <strong>{alert.cameraId}</strong>
        <div className="cop-realtime-alert-actions">
          <button
            type="button"
            className="cop-icon-btn"
            aria-label={`${alert.cameraId} 알림 설정`}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <Settings2 size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="cop-icon-btn"
            aria-label={`${alert.cameraId} 알림 닫기`}
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
        <img
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
