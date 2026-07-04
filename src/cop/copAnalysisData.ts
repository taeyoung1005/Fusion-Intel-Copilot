import type { AlertTone } from "./copMapBaseData"

export type Incident = {
  readonly id: string
  readonly tone: "WATCH" | "NORMAL"
  readonly zone: string
  readonly title: string
  readonly meta: string
  readonly time: string
  readonly confidence: number
}

export type CodexMetric = {
  readonly id: string
  readonly ko: string
  readonly en: string
  readonly value: string
  readonly spark: readonly number[]
  readonly bar?: number
  readonly tone: AlertTone
}

export type Citation = {
  readonly id: string
  readonly label: string
  readonly time?: string
}

export type MissingContext = {
  readonly id: string
  readonly camera: string
  readonly reason: string
  readonly since: string
}

export type ResponseGate = {
  readonly id: string
  readonly label: string
  readonly initial: "PASS" | "PENDING"
}

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
