import type { AlertTone } from "./copMapBaseData"
import { EVIDENCE_CLIP_WINDOW_MS, type EvidenceClip } from "./copTimelineData"

export const ALERT_WINDOW_MS = EVIDENCE_CLIP_WINDOW_MS
export const WATCH_WINDOW_MS = EVIDENCE_CLIP_WINDOW_MS
export const MAX_WINDOW_MS = EVIDENCE_CLIP_WINDOW_MS

export type WindowEntry = {
  readonly clip: EvidenceClip
  readonly observedAtMs: number
}

export type WindowSummary = {
  readonly count: number
  readonly firstObservedAtMs: number
  readonly lastObservedAtMs: number
  readonly worstTone: AlertTone
  readonly escalated: boolean
  readonly text: string
}

export const windowMsForTone = (tone: AlertTone): number => {
  if (tone === "alert") {
    return ALERT_WINDOW_MS
  }
  if (tone === "watch") {
    return WATCH_WINDOW_MS
  }
  return MAX_WINDOW_MS
}

const TONE_SEVERITY: Record<AlertTone, number> = {
  normal: 0,
  uncertain: 1,
  watch: 2,
  alert: 3,
  confirmed: 4,
}

const toneRank = (tone: AlertTone): number => TONE_SEVERITY[tone]

const formatWindowDuration = (windowMs: number): string => {
  if (windowMs < 60_000) {
    return `${Math.round(windowMs / 1000)}초`
  }
  return `${Math.round(windowMs / 60_000)}분`
}

export const summarizeWindow = (
  entries: readonly WindowEntry[],
  nowMs: number,
  windowMs: number,
): WindowSummary | undefined => {
  const inWindow = entries.filter((entry) => nowMs - entry.observedAtMs <= windowMs)
  if (inWindow.length === 0) {
    return undefined
  }

  const sorted = [...inWindow].sort((a, b) => a.observedAtMs - b.observedAtMs)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) {
    return undefined
  }

  const worst = sorted.reduce(
    (max, entry) => (toneRank(entry.clip.tone) > toneRank(max.clip.tone) ? entry : max),
    first,
  )
  const escalated = toneRank(worst.clip.tone) > toneRank(first.clip.tone)
  const duration = formatWindowDuration(windowMs)
  const trendText = escalated ? `위험도 상승(${first.clip.tone}→${worst.clip.tone})` : "위험도 유지"
  const text = `${duration}간 ${sorted.length}회 탐지, ${first.clip.time}~${last.clip.time} 지속, ${trendText}`

  return {
    count: sorted.length,
    firstObservedAtMs: first.observedAtMs,
    lastObservedAtMs: last.observedAtMs,
    worstTone: worst.clip.tone,
    escalated,
    text,
  }
}
