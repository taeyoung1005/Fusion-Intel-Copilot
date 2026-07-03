import { type ReactElement, useEffect, useMemo, useState } from "react"
import { ClipPlayer } from "./ClipPlayer"
import {
  type EvidenceClip,
  TIMELINE_FILTERS,
  TIMELINE_LANES,
  TIMELINE_LANE_LABEL,
  TIMELINE_RANGES,
  type TimelineEvent,
  type TimelineFilter,
  type TimelineLane,
  type TimelineRange,
  timelinePercentIn,
  timelineTicksIn,
  timelineWindow,
} from "./copData"

const LANE_TOP: Record<TimelineLane, string> = {
  alert: "16%",
  watch: "50%",
  normal: "84%",
}

const pad = (value: number): string => String(value).padStart(2, "0")
const nowMinutes = (): number => {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}
const nowClock = (): string => {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

type EventTimelineProps = {
  readonly events: readonly TimelineEvent[]
  readonly evidenceClips: readonly EvidenceClip[]
  readonly selectedEventId: string
  readonly onSelectEvent: (event: TimelineEvent) => void
}

export function EventTimeline({
  events,
  evidenceClips,
  selectedEventId,
  onSelectEvent,
}: EventTimelineProps): ReactElement {
  const [range, setRange] = useState<TimelineRange>("1H")
  const [filter, setFilter] = useState<TimelineFilter>("all")
  // Real current time, ticking so the axis and "now" marker stay live.
  const [clock, setClock] = useState(nowClock)
  const [minute, setMinute] = useState(nowMinutes)
  const [playingClipId, setPlayingClipId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(nowClock())
      setMinute(nowMinutes())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const viewWindow = useMemo(() => timelineWindow(range, minute), [range, minute])
  const ticks = useMemo(() => timelineTicksIn(viewWindow), [viewWindow])
  const nowPercent = timelinePercentIn(clock, viewWindow)

  const clipsById = useMemo(() => {
    const map = new Map<string, EvidenceClip>()
    for (const clip of evidenceClips) {
      map.set(clip.id, clip)
    }
    return map
  }, [evidenceClips])
  const playingClip = playingClipId === null ? undefined : clipsById.get(playingClipId)

  const matches = (tone: string): boolean => filter === "all" || filter === tone

  return (
    <section
      id="cop-timeline-panel"
      className="cop-panel cop-timeline"
      aria-labelledby="cop-timeline-title"
    >
      <div className="cop-timeline-head">
        <h2 id="cop-timeline-title">
          <span className="cop-kicker">EVENT TIMELINE</span>
        </h2>
        <div className="cop-range-group" aria-label="시간 범위">
          {TIMELINE_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={`cop-range${range === option ? " active" : ""}`}
              aria-pressed={range === option}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="cop-filter-group" aria-label="이벤트 필터">
          {TIMELINE_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`cop-filter tone-${option.id}${filter === option.id ? " active" : ""}`}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              <span className="cop-filter-dot" aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cop-timeline-chart">
        <div className="cop-chart-corner" />
        <div className="cop-chart-axis">
          {ticks.map((tick) => (
            <span key={tick.percent} className="cop-axis-tick" style={{ left: `${tick.percent}%` }}>
              {tick.label}
            </span>
          ))}
          <span className="cop-now-pill" style={{ left: `${nowPercent}%` }}>
            {clock}
          </span>
        </div>

        <div className="cop-chart-lanes-labels">
          {TIMELINE_LANES.map((lane) => (
            <span key={lane} style={{ top: LANE_TOP[lane] }}>
              {TIMELINE_LANE_LABEL[lane]}
            </span>
          ))}
        </div>

        <div className="cop-chart-track">
          {TIMELINE_LANES.map((lane) => (
            <span key={lane} className="cop-lane-line" style={{ top: LANE_TOP[lane] }} />
          ))}
          <span className="cop-now-line" style={{ left: `${nowPercent}%` }} />

          {events.length === 0 ? (
            <p className="cop-timeline-empty">
              실시간 이벤트 없음 — CARLA 시뮬레이션 CCTV·DETR 탐지가 수집되면 현재 시각 기준으로
              표시됩니다.
            </p>
          ) : (
            events.map((event) => {
              const clip = clipsById.get(event.id)
              return (
                <button
                  key={event.id}
                  type="button"
                  className={`cop-track-block tone-${event.tone}${
                    event.id === selectedEventId ? " selected" : ""
                  }`}
                  aria-pressed={event.id === selectedEventId}
                  aria-label={`${event.display} 타임라인 이벤트 선택`}
                  onClick={() => {
                    onSelectEvent(event)
                    setPlayingClipId(event.id)
                  }}
                  style={{
                    left: `${timelinePercentIn(event.time, viewWindow)}%`,
                    top: LANE_TOP[event.lane],
                    opacity: matches(event.tone) ? 1 : 0.2,
                  }}
                >
                  <strong>{TIMELINE_LANE_LABEL[event.lane]}</strong>
                  <time>{event.display}</time>
                  {clip !== undefined && (
                    <span className="cop-track-tooltip">
                      <strong>{clip.label}</strong>
                      {clip.time} · {clip.detail}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {playingClip !== undefined && (
        <ClipPlayer clip={playingClip} onClose={() => setPlayingClipId(null)} />
      )}
    </section>
  )
}
