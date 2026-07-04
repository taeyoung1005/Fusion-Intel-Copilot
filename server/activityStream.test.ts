import { type Server, createServer } from "node:http"
import { type ViteDevServer, createServer as createViteServer } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { type ActivityEvent, ActivityEventSchema } from "../src/activityEvents"
import { ActivityEventBus, activityStream } from "./activityStream"
import { codexAgentPlugin } from "./viteCodexAgentPlugin"

type StartedActivityServer = {
  readonly app: ViteDevServer
  readonly server: Server
  readonly url: string
}

type StreamReadResult = Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]>>

const startedServers: StartedActivityServer[] = []

beforeEach(() => {
  activityStream.clear()
})

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map(stopActivityServer))
  activityStream.clear()
})

describe("activity event schema", () => {
  it("parses structured activity events and rejects unknown sources", () => {
    // Given: a structured backend activity event.
    const event = {
      ts: "2026-07-04T00:00:00.000Z",
      source: "vision",
      stage: "detect:end",
      level: "watch",
      message: "비전 탐지가 완료되었습니다.",
      detail: { durationMs: 12, detectionCount: 3 },
    }

    // When: the shared schema parses the boundary payload.
    const parsed = ActivityEventSchema.parse(event)

    // Then: the frontend and server share the same event shape.
    expect(parsed).toMatchObject({
      source: "vision",
      stage: "detect:end",
      detail: { detectionCount: 3 },
    })
    expect(() =>
      ActivityEventSchema.parse({
        ...event,
        source: "demo",
      }),
    ).toThrow()
  })
})

describe("activity event bus", () => {
  it("keeps a bounded ring buffer and removes unsubscribed listeners", () => {
    // Given: a two-item activity bus and three real events.
    const bus = new ActivityEventBus({ bufferLimit: 2 })
    const first = event("vision", "receive:end", "first")
    const second = event("vision", "decode:end", "second")
    const third = event("vision", "detect:end", "third")

    // When: more events are published than the buffer can hold.
    bus.publish(first)
    bus.publish(second)
    bus.publish(third)
    const received: ActivityEvent[] = []
    const unsubscribe = bus.subscribe((activityEvent) => received.push(activityEvent))
    bus.publish(event("vision", "classify:end", "fourth"))
    unsubscribe()
    bus.publish(event("vision", "decide:end", "fifth"))

    // Then: old events are evicted and the unsubscribed listener is not retained.
    expect(bus.snapshot().map((activityEvent) => activityEvent.message)).toEqual([
      "fourth",
      "fifth",
    ])
    expect(received.map((activityEvent) => activityEvent.message)).toEqual([
      "second",
      "third",
      "fourth",
    ])
    expect(bus.subscriberCount()).toBe(0)
  })
})

describe("activity stream HTTP boundary", () => {
  it("streams posted CARLA bridge events over SSE", async () => {
    // Given: an activity stream subscriber is connected to the Vite middleware.
    const server = await startActivityServer()
    const response = await fetch(`${server.url}/api/activity-stream`)
    const reader = sseReader(response)

    try {
      // When: the CARLA bridge posts a structured event into the server boundary.
      const posted = await fetch(`${server.url}/api/activity-events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          event("carla", "frame-upload", "CARLA frame uploaded", {
            cameraId: "CAM-CARLA-01",
            frameNumber: 42,
          }),
        ),
      })

      // Then: the same real event is fanned out to the subscriber.
      expect(posted.status).toBe(202)
      const activityEvent = await readUntilActivityEvent(
        reader,
        (candidate) => candidate.source === "carla" && candidate.stage === "frame-upload",
      )
      expect(activityEvent.detail).toMatchObject({ cameraId: "CAM-CARLA-01", frameNumber: 42 })
    } finally {
      await reader.cancel()
    }
  })
})

const event = (
  source: ActivityEvent["source"],
  stage: string,
  message: string,
  detail?: ActivityEvent["detail"],
): ActivityEvent => ({
  ts: "2026-07-04T00:00:00.000Z",
  source,
  stage,
  level: "info",
  message,
  ...(detail === undefined ? {} : { detail }),
})

const startActivityServer = async (): Promise<StartedActivityServer> => {
  const app = await createViteServer({
    configFile: false,
    logLevel: "silent",
    plugins: [codexAgentPlugin()],
    server: { middlewareMode: true },
  })
  const server = createServer(app.middlewares)
  await listen(server)
  const started = { app, server, url: serverUrl(server) }
  startedServers.push(started)
  return started
}

const stopActivityServer = async ({ app, server }: StartedActivityServer): Promise<void> => {
  await Promise.all([close(server), app.close()])
}

const sseReader = (response: Response): ReadableStreamDefaultReader<Uint8Array> => {
  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/event-stream")
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new Error("Expected SSE response body")
  }
  return reader
}

const readUntilActivityEvent = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (event: ActivityEvent) => boolean,
): Promise<ActivityEvent> => {
  const decoder = new TextDecoder()
  let buffer = ""
  const deadline = Date.now() + 2_000

  while (Date.now() < deadline) {
    const chunk = await readWithTimeout(reader, deadline - Date.now())
    if (chunk.done) {
      throw new Error("SSE stream ended before the expected activity event arrived")
    }
    buffer += decoder.decode(chunk.value, { stream: true })
    const parsed = parseSseEvents(buffer)
    buffer = parsed.remainder
    const match = parsed.events.find(predicate)
    if (match !== undefined) {
      return match
    }
  }

  throw new Error("Timed out waiting for expected activity event")
}

const readWithTimeout = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<StreamReadResult> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<StreamReadResult>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Timed out reading SSE chunk")), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

const parseSseEvents = (
  input: string,
): { readonly events: readonly ActivityEvent[]; readonly remainder: string } => {
  const events: ActivityEvent[] = []
  let remainder = input
  let separatorIndex = remainder.indexOf("\n\n")
  while (separatorIndex >= 0) {
    const rawEvent = remainder.slice(0, separatorIndex)
    remainder = remainder.slice(separatorIndex + 2)
    const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "))
    if (dataLine !== undefined) {
      events.push(ActivityEventSchema.parse(JSON.parse(dataLine.slice("data: ".length))))
    }
    separatorIndex = remainder.indexOf("\n\n")
  }
  return { events, remainder }
}

const listen = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

const serverUrl = (server: Server): string => {
  const address = server.address()
  if (typeof address === "string" || address === null || typeof address.port !== "number") {
    throw new Error("Expected TCP server address")
  }
  return `http://127.0.0.1:${address.port}`
}

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve()
        return
      }
      reject(error)
    })
  })
