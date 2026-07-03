import { useEffect, useRef, useState } from "react"
import type { EvidenceClip } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import {
  type CorrelationCandidate,
  type CorrelationEntry,
  MAX_TRAVEL_WINDOW_MS,
  findCorrelationCandidates,
  pairKey,
} from "./personCorrelation"
import {
  DEFAULT_AUTO_CLOSE,
  DEFAULT_AUTO_CLOSE_MS,
  type RealtimeAlert,
  isCarlaVisionClip,
} from "./realtimeAlerts"

export const CORRELATION_CLIP_PREFIX = "ev-correlation-"

type AlertSettings = { readonly autoClose: boolean; readonly autoCloseMs: number }

type UseCorrelationAlertsResult = {
  readonly alerts: readonly RealtimeAlert[]
  readonly dismissAlert: (id: string) => void
  readonly updateAlertSettings: (id: string, settings: AlertSettings) => void
}

const nowClock = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

const elapsedMinutes = (candidate: CorrelationCandidate): number =>
  Math.round((candidate.observedAtMsB - candidate.observedAtMsA) / 60_000)

const labelFor = (cameras: readonly DynamicCameraRecord[], cameraId: string): string =>
  cameras.find((camera) => camera.id === cameraId)?.label ?? cameraId

// The confirmed synthetic clip carries the LATER clip's attributes and camera so
// it lands on that camera's incident (buildIncidents → Codex evidence.summary).
const buildConfirmedClip = (
  candidate: CorrelationCandidate,
  cameras: readonly DynamicCameraRecord[],
): EvidenceClip => {
  const laterLabel = labelFor(cameras, candidate.clipB.camera)
  const minutes = elapsedMinutes(candidate)
  return {
    id: `${CORRELATION_CLIP_PREFIX}${pairKey(candidate.clipA.id, candidate.clipB.id)}`,
    time: nowClock(),
    camera: candidate.clipB.camera,
    tone: "watch",
    label: `${laterLabel} · ⚠️ ${candidate.clipA.camera}에서 ${minutes}분 전 동일 인물 가능성 ${candidate.score}%`,
    detail: `CORR ${candidate.score}%`,
    source: "correlation",
    confidencePct: candidate.score,
    ...(candidate.clipB.attributes !== undefined ? { attributes: candidate.clipB.attributes } : {}),
  }
}

const buildCorrelationAlert = (
  candidate: CorrelationCandidate,
  clip: EvidenceClip,
): RealtimeAlert => ({
  id: `corr-${pairKey(candidate.clipA.id, candidate.clipB.id)}`,
  kind: "correlation",
  cameraId: candidate.clipB.camera,
  clip,
  autoClose: DEFAULT_AUTO_CLOSE,
  autoCloseMs: DEFAULT_AUTO_CLOSE_MS,
})

export const useCorrelationAlerts = (
  evidenceClips: readonly EvidenceClip[],
  cameras: readonly DynamicCameraRecord[],
  onCorrelationEvidence: (clip: EvidenceClip) => void,
): UseCorrelationAlertsResult => {
  const [alerts, setAlerts] = useState<readonly RealtimeAlert[]>([])
  const bufferRef = useRef<readonly CorrelationEntry[]>([])
  const seenPairsRef = useRef<Set<string>>(new Set())
  const onCorrelationEvidenceRef = useRef(onCorrelationEvidence)
  onCorrelationEvidenceRef.current = onCorrelationEvidence
  const camerasRef = useRef(cameras)
  camerasRef.current = cameras

  useEffect(() => {
    const now = Date.now()

    // 1) Ingest new, attribute-bearing CARLA detections into the private buffer.
    const additions: CorrelationEntry[] = []
    for (const clip of evidenceClips) {
      if (!isCarlaVisionClip(clip) || clip.attributes === undefined) {
        continue
      }
      if (bufferRef.current.some((existing) => existing.clip.id === clip.id)) {
        continue
      }
      const record = camerasRef.current.find((camera) => camera.id === clip.camera)
      if (record === undefined) {
        continue
      }
      additions.push({
        clip,
        cameraId: clip.camera,
        observedAtMs: now,
        node: record.camera.node,
      })
    }

    // 2) Prune entries older than the maximum travel window (own buffer, not the
    //    6-item display cap).
    const pruned = [...bufferRef.current, ...additions].filter(
      (entry) => now - entry.observedAtMs <= MAX_TRAVEL_WINDOW_MS,
    )
    bufferRef.current = pruned

    // 3) Find fresh candidates and act on the confirmed band.
    const candidates = findCorrelationCandidates(pruned, now, seenPairsRef.current)
    for (const candidate of candidates) {
      seenPairsRef.current.add(pairKey(candidate.clipA.id, candidate.clipB.id))
      if (candidate.band === "confirmed") {
        const clip = buildConfirmedClip(candidate, camerasRef.current)
        onCorrelationEvidenceRef.current(clip)
        setAlerts((previous) => [...previous, buildCorrelationAlert(candidate, clip)])
      }
      // Ambiguous band handled in Task 4.
    }
  }, [evidenceClips])

  const dismissAlert = (id: string): void => {
    setAlerts((previous) => previous.filter((alert) => alert.id !== id))
  }

  const updateAlertSettings = (id: string, settings: AlertSettings): void => {
    setAlerts((previous) =>
      previous.map((alert) => (alert.id === id ? { ...alert, ...settings } : alert)),
    )
  }

  return { alerts, dismissAlert, updateAlertSettings }
}
