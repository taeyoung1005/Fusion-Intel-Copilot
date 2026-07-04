import { describe, expect, it } from "vitest"
import {
  EVIDENCE_CLIP_WINDOW_MS,
  evidenceClipWindowFor,
  timelinePercentIn,
  timelineTicksIn,
  timelineWindow,
  toneToLane,
} from "./copTimelineData"

// A fixed "now" (13:01) so tests are deterministic regardless of the real clock.
const NOW = 13 * 60 + 1

describe("timelineWindow", () => {
  it("is centered on the supplied current minute", () => {
    const oneHour = timelineWindow("1H", NOW)
    expect(oneHour.spanMin).toBe(60)
    expect(oneHour.startMin).toBe(NOW - 30)

    expect(timelineWindow("24H", NOW).spanMin).toBe(1440)
  })
})

describe("timelinePercentIn", () => {
  it("puts an event at 'now' near the centered 50% and zooms with range", () => {
    const nowClock = "13:01"
    expect(timelinePercentIn(nowClock, timelineWindow("1H", NOW))).toBeCloseTo(50, 0)

    const earlier = "12:40"
    const at1H = timelinePercentIn(earlier, timelineWindow("1H", NOW))
    const at24H = timelinePercentIn(earlier, timelineWindow("24H", NOW))
    expect(at24H).toBeGreaterThan(at1H) // zooming out pulls it toward center
  })

  it("clamps out-of-window times into [0,100]", () => {
    const tight = timelineWindow("CUSTOM", NOW)
    expect(timelinePercentIn("00:00", tight)).toBe(0)
    expect(timelinePercentIn("23:59", tight)).toBe(100)
  })
})

describe("timelineTicksIn", () => {
  it("produces 7 ordered HH:MM labels across the window", () => {
    const ticks = timelineTicksIn(timelineWindow("1H", NOW))
    expect(ticks).toHaveLength(7)
    expect(ticks[0]?.label).toBe("12:31")
    expect(ticks[6]?.label).toBe("13:31")
    expect(ticks.every((t) => /^\d{2}:\d{2}$/.test(t.label))).toBe(true)
  })

  it("keeps midnight-crossing endpoints at distinct positions (no key collision)", () => {
    const ticks = timelineTicksIn(timelineWindow("24H", NOW))
    expect(ticks[0]?.label).toBe(ticks[6]?.label)
    expect(ticks[0]?.percent).toBe(0)
    expect(ticks[6]?.percent).toBe(100)
    expect(new Set(ticks.map((t) => t.percent)).size).toBe(7)
  })
})

describe("toneToLane", () => {
  it("maps tone to a severity lane", () => {
    expect(toneToLane("alert")).toBe("alert")
    expect(toneToLane("confirmed")).toBe("alert")
    expect(toneToLane("watch")).toBe("watch")
    expect(toneToLane("uncertain")).toBe("watch")
    expect(toneToLane("normal")).toBe("normal")
  })
})

describe("evidenceClipWindowFor", () => {
  it("builds a 30 second post-event window from the event timestamp", () => {
    expect(EVIDENCE_CLIP_WINDOW_MS).toBe(30_000)
    expect(evidenceClipWindowFor("13:01:05")).toEqual({
      startTime: "13:01:05",
      endTime: "13:01:35",
      durationMs: 30_000,
    })
  })

  it("keeps the window after the event when the end wraps past midnight", () => {
    expect(evidenceClipWindowFor("23:59:45")).toEqual({
      startTime: "23:59:45",
      endTime: "00:00:15",
      durationMs: 30_000,
    })
  })
})
