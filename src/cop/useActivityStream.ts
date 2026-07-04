import { useEffect, useState } from "react"
import {
  type ActivityStreamEvent,
  ActivityStreamParseError,
  appendActivityEvent,
  parseActivityStreamEvent,
} from "./activityStream"

const ACTIVITY_STREAM_URL = "/api/activity-stream"
const ACTIVITY_STREAM_LIMIT = 80
const ACTIVITY_STREAM_RECONNECT_MS = 1_500

export type ActivityStreamStatus = "connecting" | "open" | "reconnecting" | "unsupported"

type UseActivityStreamOptions = {
  readonly url?: string
  readonly limit?: number
  readonly reconnectMs?: number
}

type ActivityStreamState = {
  readonly events: readonly ActivityStreamEvent[]
  readonly status: ActivityStreamStatus
  readonly lastError: string | undefined
}

export const useActivityStream = ({
  url = ACTIVITY_STREAM_URL,
  limit = ACTIVITY_STREAM_LIMIT,
  reconnectMs = ACTIVITY_STREAM_RECONNECT_MS,
}: UseActivityStreamOptions = {}): ActivityStreamState => {
  const [events, setEvents] = useState<readonly ActivityStreamEvent[]>([])
  const [status, setStatus] = useState<ActivityStreamStatus>("connecting")
  const [lastError, setLastError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    let reconnectTimer: number | undefined
    let stream: EventSource | undefined

    const scheduleReconnect = (): void => {
      if (!active) {
        return
      }
      setStatus("reconnecting")
      setLastError("activity-event-backend SSE 재연결 대기")
      reconnectTimer = window.setTimeout(connect, reconnectMs)
    }

    const connect = (): void => {
      if (!active) {
        return
      }
      if (!("EventSource" in window)) {
        setStatus("unsupported")
        setLastError("이 브라우저는 EventSource를 지원하지 않습니다.")
        return
      }

      setStatus("connecting")
      stream = new window.EventSource(url)
      stream.onopen = () => {
        if (!active) {
          return
        }
        setStatus("open")
        setLastError(undefined)
      }
      stream.addEventListener("activity", (event) => {
        if (!active) {
          return
        }
        try {
          const parsed = parseActivityStreamEvent(event.data)
          setEvents((previous) => appendActivityEvent(previous, parsed, limit))
        } catch (error) {
          if (error instanceof ActivityStreamParseError) {
            setLastError(error.message)
            return
          }
          throw error
        }
      })
      stream.onerror = () => {
        stream?.close()
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      active = false
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer)
      }
      stream?.close()
    }
  }, [url, limit, reconnectMs])

  return { events, status, lastError }
}
