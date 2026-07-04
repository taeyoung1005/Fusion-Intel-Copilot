import { Radio, Terminal } from "lucide-react"
import type { ReactElement } from "react"
import {
  ACTIVITY_STREAM_STAGES,
  type ActivityStreamEvent,
  type ActivityStreamLevel,
  type ActivityStreamSource,
  type ActivityStreamStage,
  activityPipelineStageOf,
} from "./activityStream"
import { type ActivityStreamStatus, useActivityStream } from "./useActivityStream"

type ActivityVisualTone = "normal" | "watch" | "warn" | "critical" | "uncertain"

const STAGE_LABELS: Record<ActivityStreamStage, string> = {
  receive: "수신",
  decode: "디코드",
  detect: "검출",
  classify: "분류",
  decide: "판단",
}

const SOURCE_LABELS: Record<ActivityStreamSource, string> = {
  vision: "VISION",
  codex: "CODEX",
  carla: "CARLA",
}

const STATUS_LABELS: Record<ActivityStreamStatus, string> = {
  connecting: "CONNECT",
  open: "LIVE",
  reconnecting: "RETRY",
  unsupported: "NO SSE",
}

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) {
    return timestamp
  }
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0")
  return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

const statusTone = (status: ActivityStreamStatus): ActivityVisualTone => {
  switch (status) {
    case "connecting":
    case "reconnecting":
      return "warn"
    case "open":
      return "normal"
    case "unsupported":
      return "critical"
  }
}

const visualToneForLevel = (level: ActivityStreamLevel): ActivityVisualTone => {
  switch (level) {
    case "info":
      return "normal"
    case "watch":
      return "watch"
    case "warn":
      return "warn"
    case "error":
      return "critical"
  }
}

export function ActivityStreamPanel(): ReactElement {
  const { events, status, lastError } = useActivityStream()
  const latestEvent = events.at(-1)
  const visibleEvents = [...events].reverse()
  const stageLevels = new Map<ActivityStreamStage, ActivityVisualTone>()
  for (const event of events) {
    const pipelineStage = activityPipelineStageOf(event.stage)
    if (pipelineStage !== null) {
      stageLevels.set(pipelineStage, visualToneForLevel(event.level))
    }
  }
  const latestStage = latestEvent === undefined ? null : activityPipelineStageOf(latestEvent.stage)

  return (
    <section className="cop-panel cop-activity-stream" aria-labelledby="cop-activity-stream-title">
      <div className="cop-panel-head">
        <h2 id="cop-activity-stream-title">
          <Terminal size={13} aria-hidden="true" />
          시스템 처리 로그 <small>(ACTIVITY STREAM)</small>
        </h2>
        <span className={`cop-activity-status tone-${statusTone(status)}`}>
          <Radio size={12} aria-hidden="true" />
          {STATUS_LABELS[status]}
        </span>
      </div>
      <ol className="cop-activity-pipeline" aria-label="비전 분석 처리 단계">
        {ACTIVITY_STREAM_STAGES.map((stage) => {
          const level = stageLevels.get(stage) ?? "normal"
          const current = latestStage === stage
          const observed = stageLevels.has(stage)
          return (
            <li
              key={stage}
              className={`cop-activity-stage tone-${level}${observed ? " observed" : ""}${
                current ? " current" : ""
              }`}
            >
              {STAGE_LABELS[stage]}
            </li>
          )
        })}
      </ol>
      <div className="cop-activity-log" aria-live="polite">
        {visibleEvents.length === 0 ? (
          <p className="cop-activity-empty">
            수신된 시스템 처리 이벤트 없음, DETR 비전 분석이 시작되면 백엔드 처리 단계가 표시됩니다.
          </p>
        ) : (
          <ol>
            {visibleEvents.map((event, index) => (
              <ActivityLogRow key={activityEventKey(event, index)} event={event} />
            ))}
          </ol>
        )}
      </div>
      {lastError !== undefined && <p className="cop-activity-error">{lastError}</p>}
    </section>
  )
}

function ActivityLogRow({ event }: { readonly event: ActivityStreamEvent }): ReactElement {
  const tone = visualToneForLevel(event.level)
  return (
    <li className={`cop-activity-line tone-${tone}`}>
      <time dateTime={event.ts}>{formatTimestamp(event.ts)}</time>
      <span className={`cop-activity-source source-${event.source}`}>
        {SOURCE_LABELS[event.source]}
      </span>
      <span className={`cop-activity-level tone-${tone}`}>{event.level}</span>
      <span className="cop-activity-stage-label">{activityStageLabel(event.stage)}</span>
      <strong>{event.message}</strong>
      <span className="cop-activity-machine">{formatActivityDetail(event.detail)}</span>
    </li>
  )
}

const activityEventKey = (event: ActivityStreamEvent, index: number): string =>
  `${event.ts}:${event.source}:${event.stage}:${index}`

const activityStageLabel = (stage: string): string => {
  const pipelineStage = activityPipelineStageOf(stage)
  if (pipelineStage !== null) {
    return STAGE_LABELS[pipelineStage]
  }
  switch (stage) {
    case "request:send":
      return "요청"
    case "response:received":
      return "응답"
    case "frame-upload:start":
      return "업링크"
    case "frame-upload:end":
      return "완료"
    default:
      return stage
  }
}

const formatActivityDetail = (detail: ActivityStreamEvent["detail"]): string => {
  if (detail === undefined) {
    return "detail 없음"
  }
  return Object.entries(detail)
    .map(([key, value]) => `${key}=${formatActivityDetailValue(value)}`)
    .join(" · ")
}

const formatActivityDetailValue = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (value === null) {
    return "null"
  }
  return JSON.stringify(value) ?? String(value)
}
