import type { IncomingMessage, ServerResponse } from "node:http"
import {
  type ActivityEvent,
  type ActivityEventInput,
  ActivityEventInputSchema,
  ActivityEventSchema,
} from "../src/activityEvents"

type ActivitySubscriber = (event: ActivityEvent) => void

type ActivityEventBusOptions = {
  readonly bufferLimit?: number
}

type ActivitySubscriptionOptions = {
  readonly replay?: boolean
}

type BodyReadResult =
  | { readonly kind: "ok"; readonly body: string }
  | { readonly kind: "too-large" }

const maxBufferedActivityEvents = 200
const maxActivityPostBytes = 32 * 1024

export class ActivityEventBus {
  private readonly bufferLimit: number
  private readonly buffer: ActivityEvent[] = []
  private readonly subscribers = new Set<ActivitySubscriber>()

  constructor(options: ActivityEventBusOptions = {}) {
    this.bufferLimit = options.bufferLimit ?? maxBufferedActivityEvents
  }

  publish(event: ActivityEvent): ActivityEvent {
    const parsed = ActivityEventSchema.parse(event)
    this.buffer.push(parsed)
    const overflow = this.buffer.length - this.bufferLimit
    if (overflow > 0) {
      this.buffer.splice(0, overflow)
    }
    for (const subscriber of Array.from(this.subscribers)) {
      subscriber(parsed)
    }
    return parsed
  }

  publishInput(input: ActivityEventInput): ActivityEvent {
    return this.publish({
      ...input,
      ts: input.ts ?? new Date().toISOString(),
    })
  }

  subscribe(subscriber: ActivitySubscriber, options: ActivitySubscriptionOptions = {}): () => void {
    this.subscribers.add(subscriber)
    if (options.replay ?? true) {
      for (const event of this.buffer) {
        subscriber(event)
      }
    }
    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  snapshot(): readonly ActivityEvent[] {
    return [...this.buffer]
  }

  subscriberCount(): number {
    return this.subscribers.size
  }

  clear(): void {
    this.buffer.length = 0
    this.subscribers.clear()
  }
}

export const activityStream = new ActivityEventBus()

export const emitActivityEvent = (input: ActivityEventInput): ActivityEvent => {
  return activityStream.publishInput(input)
}

export const subscribeActivityEvents = (subscriber: ActivitySubscriber): (() => void) => {
  return activityStream.subscribe(subscriber, { replay: false })
}

export const snapshotActivityEvents = (): readonly ActivityEvent[] => activityStream.snapshot()

export const activitySubscriberCount = (): number => activityStream.subscriberCount()

export const resetActivityStreamForTest = (): void => {
  activityStream.clear()
}

export const isActivityStreamRequest = (
  method: string | undefined,
  url: string | undefined,
): boolean => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  return method === "GET" && pathname === "/api/activity-stream"
}

export const isActivityEventPost = (
  method: string | undefined,
  url: string | undefined,
): boolean => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  return method === "POST" && pathname === "/api/activity-events"
}

export const handleActivityStreamRequest = (
  request: IncomingMessage,
  response: ServerResponse,
): void => {
  response.writeHead(200, {
    "cache-control": "no-store, no-cache, must-revalidate",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    pragma: "no-cache",
    "x-accel-buffering": "no",
  })
  response.write(": connected\n\n")

  let unsubscribe: (() => void) | undefined
  const cleanup = (): void => {
    if (unsubscribe !== undefined) {
      unsubscribe()
      unsubscribe = undefined
    }
  }
  const subscriber: ActivitySubscriber = (event) => {
    if (!writeActivitySseEvent(response, event)) {
      cleanup()
    }
  }

  unsubscribe = activityStream.subscribe(subscriber)
  request.on("close", cleanup)
  response.on("close", cleanup)
}

export const handleActivityEventPost = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const result = await collectBody(request)
  if (result.kind === "too-large") {
    writeJson(response, 413, { error: "활동 이벤트 요청이 너무 큽니다." })
    return
  }
  const parsed = ActivityEventInputSchema.safeParse(parseJsonBody(result.body))
  if (!parsed.success) {
    writeJson(response, 400, { error: "잘못된 활동 이벤트입니다." })
    return
  }
  const event = emitActivityEvent(parsed.data)
  writeJson(response, 202, { event })
}

const writeActivitySseEvent = (response: ServerResponse, event: ActivityEvent): boolean => {
  if (response.destroyed || response.writableEnded) {
    return false
  }
  response.write("event: activity\n")
  response.write(`data: ${JSON.stringify(event)}\n\n`)
  return true
}

const collectBody = (request: IncomingMessage): Promise<BodyReadResult> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let tooLarge = false
    request.on("data", (chunk: Buffer | string) => {
      if (tooLarge) {
        return
      }
      const buffer = Buffer.from(chunk)
      totalBytes += buffer.byteLength
      if (totalBytes > maxActivityPostBytes) {
        tooLarge = true
        chunks.length = 0
        resolve({ kind: "too-large" })
        return
      }
      chunks.push(buffer)
    })
    request.on("end", () => {
      if (!tooLarge) {
        resolve({ kind: "ok", body: Buffer.concat(chunks).toString("utf8") })
      }
    })
    request.on("error", (error) => {
      if (!tooLarge) {
        reject(error)
      }
    })
  })

const parseJsonBody = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  payload: { readonly error: string } | { readonly event: ActivityEvent },
): void => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(payload))
}
