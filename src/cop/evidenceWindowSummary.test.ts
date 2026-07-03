import { describe, expect, it } from "vitest"
import type { EvidenceClip } from "./copTimelineData"
import {
  MAX_WINDOW_MS,
  type WindowEntry,
  summarizeWindow,
  windowMsForTone,
} from "./evidenceWindowSummary"

const clip = (id: string, tone: EvidenceClip["tone"], time: string): EvidenceClip => ({
  id,
  time,
  camera: "CARLA-01",
  tone,
  label: `CARLA-01 ${tone} 탐지`,
  detail: "CONF 90%",
  source: "vision",
  confidencePct: 90,
})

const entry = (
  id: string,
  tone: EvidenceClip["tone"],
  time: string,
  observedAtMs: number,
): WindowEntry => ({
  clip: clip(id, tone, time),
  observedAtMs,
})

describe("windowMsForTone", () => {
  it("returns 2 minutes for alert", () => {
    expect(windowMsForTone("alert")).toBe(120_000)
  })

  it("returns 5 minutes for watch", () => {
    expect(windowMsForTone("watch")).toBe(300_000)
  })

  it("returns 10 minutes for normal", () => {
    expect(windowMsForTone("normal")).toBe(600_000)
  })

  it("returns 10 minutes for confirmed and uncertain (fallback)", () => {
    expect(windowMsForTone("confirmed")).toBe(MAX_WINDOW_MS)
    expect(windowMsForTone("uncertain")).toBe(MAX_WINDOW_MS)
  })
})

describe("summarizeWindow", () => {
  it("returns undefined for an empty entry list", () => {
    expect(summarizeWindow([], 10_000, 300_000)).toBeUndefined()
  })

  it("returns undefined when every entry falls outside the window", () => {
    const entries = [entry("c1", "normal", "09:00:00", 0)]
    expect(summarizeWindow(entries, 400_000, 300_000)).toBeUndefined()
  })

  it("summarizes a single in-window entry as steady (not escalated)", () => {
    const entries = [entry("c1", "watch", "09:10:00", 100_000)]
    const summary = summarizeWindow(entries, 150_000, 300_000)
    expect(summary).toEqual({
      count: 1,
      firstObservedAtMs: 100_000,
      lastObservedAtMs: 100_000,
      worstTone: "watch",
      escalated: false,
      text: "5분간 1회 탐지, 09:10:00~09:10:00 지속, 위험도 유지",
    })
  })

  it("marks escalated when the worst tone outranks the first tone", () => {
    const entries = [
      entry("c1", "normal", "09:10:00", 100_000),
      entry("c2", "watch", "09:11:00", 160_000),
      entry("c3", "alert", "09:12:00", 220_000),
    ]
    const summary = summarizeWindow(entries, 300_000, 300_000)
    expect(summary?.count).toBe(3)
    expect(summary?.worstTone).toBe("alert")
    expect(summary?.escalated).toBe(true)
    expect(summary?.text).toBe("5분간 3회 탐지, 09:10:00~09:12:00 지속, 위험도 상승(normal→alert)")
  })

  it("excludes entries older than the window relative to nowMs", () => {
    const entries = [
      entry("old", "alert", "08:00:00", 0),
      entry("recent", "normal", "09:14:00", 280_000),
    ]
    const summary = summarizeWindow(entries, 300_001, 300_000)
    expect(summary?.count).toBe(1)
    expect(summary?.worstTone).toBe("normal")
  })
})
