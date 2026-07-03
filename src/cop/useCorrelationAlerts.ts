import { useEffect, useRef, useState } from "react"
import { type CodexAgentContext, requestCodexAgent } from "./codexAgentClient"
import type { Citation, EvidenceClip, Incident } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import { type WindowEntry, summarizeWindow, windowMsForTone } from "./evidenceWindowSummary"
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

const summaryForCamera = (
  windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>,
  cameraId: string,
  nowMs: number,
): string | undefined => {
  const entries = windowBuffer.get(cameraId)
  if (entries === undefined || entries.length === 0) {
    return undefined
  }
  const latestTone = entries[entries.length - 1]?.clip.tone ?? "normal"
  const windowMs = windowMsForTone(latestTone)
  return summarizeWindow(entries, nowMs, windowMs)?.text
}

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

// Ambiguous clips are emitted once, when Codex resolves. `summary` is Codex's
// decision text on success, or undefined on any failure (rule-based fallback).
const buildAmbiguousClip = (
  candidate: CorrelationCandidate,
  cameras: readonly DynamicCameraRecord[],
  summary: string | undefined,
): EvidenceClip => {
  const laterLabel = labelFor(cameras, candidate.clipB.camera)
  const verdict =
    summary === undefined ? `유사도 ${candidate.score}% (규칙 기반)` : `Codex 판단: ${summary}`
  return {
    id: `${CORRELATION_CLIP_PREFIX}${pairKey(candidate.clipA.id, candidate.clipB.id)}`,
    time: nowClock(),
    camera: candidate.clipB.camera,
    tone: "watch",
    label: `${laterLabel} · ⚠️ ${candidate.clipA.camera} 동일 인물 가능성 ${candidate.score}% · ${verdict}`,
    detail: `CORR ${candidate.score}%`,
    source: "correlation",
    confidencePct: candidate.score,
    ...(candidate.clipB.attributes !== undefined ? { attributes: candidate.clipB.attributes } : {}),
  }
}

const buildJudgingClip = (
  candidate: CorrelationCandidate,
  cameras: readonly DynamicCameraRecord[],
): EvidenceClip => {
  const laterLabel = labelFor(cameras, candidate.clipB.camera)
  return {
    id: `${CORRELATION_CLIP_PREFIX}judging-${pairKey(candidate.clipA.id, candidate.clipB.id)}`,
    time: nowClock(),
    camera: candidate.clipB.camera,
    tone: "watch",
    label: `${laterLabel} · ⚠️ ${candidate.clipA.camera} 동일 인물 판단 중... 유사도 ${candidate.score}%`,
    detail: `CORR ${candidate.score}%`,
    source: "correlation",
    confidencePct: candidate.score,
    ...(candidate.clipB.attributes !== undefined ? { attributes: candidate.clipB.attributes } : {}),
  }
}

const buildCodexContext = (
  candidate: CorrelationCandidate,
  recentActivitySummary: string | undefined,
): CodexAgentContext => {
  const key = pairKey(candidate.clipA.id, candidate.clipB.id)
  const incident: Incident = {
    id: `inc-corr-${key}`,
    tone: "WATCH",
    // All CARLA cameras ring the single AMMO DEPOT cluster (see design §3); the
    // DynamicCameraRecord has no zone field, so this fixed value is sufficient.
    zone: "AMMO DEPOT CLUSTER",
    title: `${candidate.clipA.camera} → ${candidate.clipB.camera} 동일 인물 가능성 검토`,
    meta: `유사도 ${candidate.score}%`,
    time: nowClock(),
    confidence: candidate.score,
  }
  const citations: readonly Citation[] = [
    {
      id: `cite-corr-a-${candidate.clipA.id}`,
      label: candidate.clipA.camera,
      time: candidate.clipA.time,
    },
    {
      id: `cite-corr-b-${candidate.clipB.id}`,
      label: candidate.clipB.camera,
      time: candidate.clipB.time,
    },
  ]
  return {
    incident,
    citations,
    missingContext: [],
    responseOutcome: "상관관계 자동 판단",
    ...(recentActivitySummary !== undefined ? { recentActivitySummary } : {}),
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
  windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>,
): UseCorrelationAlertsResult => {
  const [alerts, setAlerts] = useState<readonly RealtimeAlert[]>([])
  const bufferRef = useRef<readonly CorrelationEntry[]>([])
  const seenPairsRef = useRef<Set<string>>(new Set())
  const onCorrelationEvidenceRef = useRef(onCorrelationEvidence)
  onCorrelationEvidenceRef.current = onCorrelationEvidence
  const camerasRef = useRef(cameras)
  camerasRef.current = cameras
  const windowBufferRef = useRef(windowBuffer)
  windowBufferRef.current = windowBuffer

  const resolveAmbiguous = async (
    candidate: CorrelationCandidate,
    alertId: string,
  ): Promise<void> => {
    let summary: string | undefined
    try {
      const recentActivitySummary = summaryForCamera(
        windowBufferRef.current,
        candidate.clipB.camera,
        Date.now(),
      )
      const decision = await requestCodexAgent(buildCodexContext(candidate, recentActivitySummary))
      summary = decision.decision.summary
    } catch {
      // Never block evidence/alert emission on a Codex failure — fall back to
      // the rule-based text below.
      summary = undefined
    }
    const finalClip = buildAmbiguousClip(candidate, camerasRef.current, summary)
    onCorrelationEvidenceRef.current(finalClip)
    setAlerts((previous) =>
      previous.map((alert) => (alert.id === alertId ? { ...alert, clip: finalClip } : alert)),
    )
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: resolveAmbiguous is a stable closure over refs/setAlerts; the effect intentionally keys only on evidenceClips and must not re-run per render.
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
        continue
      }
      // Ambiguous: show a local "judging" alert immediately, then consult Codex.
      const judgingClip = buildJudgingClip(candidate, camerasRef.current)
      const alert = buildCorrelationAlert(candidate, judgingClip)
      setAlerts((previous) => [...previous, alert])
      void resolveAmbiguous(candidate, alert.id)
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
