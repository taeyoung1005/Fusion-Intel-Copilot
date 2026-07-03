import type { PersonAttributes } from "./attributeClassifier"
import type { AlertTone } from "./copMapBaseData"

// --- Center: event timeline -----------------------------------------------------

export type TimelineRange = "1H" | "6H" | "12H" | "24H" | "CUSTOM"
export const TIMELINE_RANGES: readonly TimelineRange[] = ["1H", "6H", "12H", "24H", "CUSTOM"]

export type TimelineFilter = "all" | "normal" | "watch" | "alert" | "confirmed"
export type TimelineFilterOption = { readonly id: TimelineFilter; readonly label: string }
export const TIMELINE_FILTERS: readonly TimelineFilterOption[] = [
  { id: "all", label: "All" },
  { id: "normal", label: "Normal" },
  { id: "watch", label: "Watch" },
  { id: "alert", label: "Alert" },
  { id: "confirmed", label: "Confirmed" },
]

// Severity lanes (closest-to-camera urgency), driven by real event tone.
export const TIMELINE_LANES = ["alert", "watch", "normal"] as const
export type TimelineLane = (typeof TIMELINE_LANES)[number]

export const TIMELINE_LANE_LABEL: Record<TimelineLane, string> = {
  alert: "ALERT",
  watch: "WATCH",
  normal: "NORMAL",
}

export const toneToLane = (tone: AlertTone): TimelineLane => {
  if (tone === "alert" || tone === "confirmed") {
    return "alert"
  }
  if (tone === "watch" || tone === "uncertain") {
    return "watch"
  }
  return "normal"
}

const minutesOf = (clock: string): number => {
  const [hh, mm] = clock.split(":")
  return Number(hh) * 60 + Number(mm)
}

const clockOf = (totalMinutes: number): string => {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  const hh = Math.floor(normalized / 60)
  const mm = normalized % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

// Each range is a real time window centered on the ACTUAL current time, so the
// axis and "now" marker always track the real clock. 1H spreads recent events;
// 24H pulls them into a tight cluster around the current minute.
const RANGE_SPAN_MIN: Record<TimelineRange, number> = {
  "1H": 60,
  "6H": 360,
  "12H": 720,
  "24H": 1440,
  CUSTOM: 30,
}

export type TimelineWindow = { readonly startMin: number; readonly spanMin: number }

export const timelineWindow = (range: TimelineRange, nowMin: number): TimelineWindow => {
  const spanMin = RANGE_SPAN_MIN[range]
  return { startMin: nowMin - spanMin / 2, spanMin }
}

export const timelinePercentIn = (clock: string, window: TimelineWindow): number => {
  const offset = minutesOf(clock) - window.startMin
  return Math.max(0, Math.min(100, (offset / window.spanMin) * 100))
}

export type TimelineTick = { readonly label: string; readonly percent: number }

// Returns labels with their precomputed positions. Positions must come from the
// absolute minute (not by re-parsing the wrapped HH:MM label), so windows that
// cross midnight keep their endpoints distinct (e.g. 24H: 0% and 100%).
export const timelineTicksIn = (window: TimelineWindow): readonly TimelineTick[] => {
  const ticks: TimelineTick[] = []
  for (let index = 0; index <= 6; index += 1) {
    ticks.push({
      label: clockOf(window.startMin + (window.spanMin * index) / 6),
      percent: (index / 6) * 100,
    })
  }
  return ticks
}

export type TimelineEvent = {
  readonly id: string
  readonly time: string
  readonly display: string
  readonly lane: TimelineLane
  readonly tone: AlertTone
}

// --- Bottom: evidence clips -----------------------------------------------------

// Evidence clips are derived from REAL sources only — live mobile CCTV frames and
// real-time DETR detections — never from a static demo list. `detail` carries the
// source-appropriate metric (uplink frame count for mobile, detection confidence
// for vision); `frameDataUrl` is the actual captured frame when available.
export type EvidenceClipSource = "mobile" | "vision"

export type EvidenceClip = {
  readonly id: string
  readonly time: string
  readonly camera: string
  readonly tone: AlertTone
  readonly label: string
  readonly detail: string
  readonly source: EvidenceClipSource
  readonly confidencePct: number
  readonly frameDataUrl?: string | null
  readonly attributes?: PersonAttributes
}

export const LEGEND_ITEMS = [
  { id: "camera", label: "Camera" },
  { id: "handoff", label: "Handoff Path" },
  { id: "event", label: "Event" },
  { id: "blind", label: "Blind Spot" },
  { id: "cone", label: "Coverage Cone" },
  { id: "bands", label: "Distance Bands" },
] as const
