import type { AlertTone } from "./copMapBaseData"

// --- Right rail: active incidents -----------------------------------------------

export type Incident = {
  readonly id: string
  readonly tone: "WATCH" | "NORMAL"
  readonly zone: string
  readonly title: string
  readonly meta: string
  readonly time: string
  readonly confidence: number
}

export const INCIDENTS: readonly Incident[] = [
  {
    id: "inc-east",
    tone: "WATCH",
    zone: "PERIMETER EAST",
    title: "Camera Handoff Event",
    meta: "CAM-N-02 → CAM-E-01",
    time: "09:41:02",
    confidence: 72,
  },
  {
    id: "inc-ammo",
    tone: "WATCH",
    zone: "AMMO DEPOT CLUSTER",
    title: "Unusual Activity",
    meta: "AMMO-C-03",
    time: "09:38:47",
    confidence: 68,
  },
  {
    id: "inc-south",
    tone: "NORMAL",
    zone: "SOUTH ZONE",
    title: "Routine Patrol",
    meta: "CAM-S-02",
    time: "09:35:12",
    confidence: 34,
  },
] as const

// --- Right rail: Codex agent summary --------------------------------------------

export type CodexMetric = {
  readonly id: string
  readonly ko: string
  readonly en: string
  readonly value: string
  readonly spark: readonly number[]
  readonly bar?: number
  readonly tone: AlertTone
}

export const CODEX_METRICS: readonly CodexMetric[] = [
  {
    id: "evidence",
    ko: "객관적 근거",
    en: "Objective Evidence",
    value: "128",
    spark: [6, 8, 7, 10, 9, 12, 11, 14],
    tone: "normal",
  },
  {
    id: "anomalies",
    ko: "이상 징후 탐지",
    en: "Anomalies Detected",
    value: "3",
    spark: [1, 2, 1, 3, 2, 2, 3, 3],
    tone: "watch",
  },
  {
    id: "handovers",
    ko: "핸드오프 완료",
    en: "Handovers Completed",
    value: "24",
    spark: [10, 12, 14, 16, 18, 20, 22, 24],
    tone: "normal",
  },
  {
    id: "uptime",
    ko: "커버리지 활용률",
    en: "Coverage Uptime",
    value: "98.6%",
    spark: [95, 96, 97, 98, 98, 99, 98, 99],
    tone: "normal",
  },
  {
    id: "confidence",
    ko: "종합 신뢰도",
    en: "Confidence Overall",
    value: "64%",
    spark: [],
    bar: 64,
    tone: "watch",
  },
] as const

export const CODEX_UPDATED = "09:42:10"

// --- Right rail: citations + recommended action ---------------------------------

export type Citation = {
  readonly id: string
  readonly label: string
  readonly time?: string
}

export const CITATIONS: readonly Citation[] = [
  { id: "cite-e-03", label: "CAM-E-03", time: "09:41:02" },
  { id: "cite-n-02", label: "CAM-N-02", time: "09:41:55" },
  { id: "cite-handoff", label: "HANDOFF-LOG-009" },
  { id: "cite-fence", label: "PERIMETER-FENCE-01" },
  { id: "cite-weather", label: "WEATHER-STATION-01" },
] as const

export const RECOMMENDED_ACTION = {
  ko: "관장 조치",
  en: "Recommended Next Action",
  headline: "사람 확인 후 보고 (운용자 확인 필요)",
  body: "현재 핸드오프 이벤트의 맥락과 누락 데이터를 보완한 후 일일 보고서 생성 권장.",
  cta: "사람 확인 게이트로 이동",
} as const

// --- Right rail: missing context ------------------------------------------------

export type MissingContext = {
  readonly id: string
  readonly camera: string
  readonly reason: string
  readonly since: string
}

export const MISSING_CONTEXT: readonly MissingContext[] = [
  {
    id: "miss-w-02",
    camera: "CAM-W-02",
    reason: "Partial Occlusion (Fence)",
    since: "09:40:11",
  },
  {
    id: "miss-ammo-05",
    camera: "AMMO-05",
    reason: "Low Illumination",
    since: "09:38:22",
  },
] as const

// --- Right rail: response gate --------------------------------------------------

export type ResponseGate = {
  readonly id: string
  readonly label: string
  readonly initial: "PASS" | "PENDING"
}

export const RESPONSE_GATES: readonly ResponseGate[] = [
  { id: "gate-fact", label: "이벤트 사실 확인", initial: "PASS" },
  { id: "gate-context", label: "맥락 검토 완료", initial: "PASS" },
  { id: "gate-data", label: "추가 데이터 검토", initial: "PENDING" },
  { id: "gate-assess", label: "상황 평가 완료", initial: "PENDING" },
] as const

// --- Right rail: daily report ---------------------------------------------------

export const DAILY_REPORT = {
  title: "D4D AI PERIMETER HARNESS",
  subtitle: "DAILY SITUATION REPORT",
  date: "2025-05-20",
  period: "00:00 ~ 24:00",
  rows: [
    { id: "total", label: "TOTAL EVENTS", value: "128" },
    { id: "watch", label: "WATCH EVENTS", value: "12" },
    { id: "alert", label: "ALERT EVENTS", value: "3" },
    { id: "confirmed", label: "CONFIRMED", value: "1" },
  ],
} as const
