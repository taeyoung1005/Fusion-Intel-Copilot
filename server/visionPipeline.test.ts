import { type Server, createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { type ViteDevServer, createServer as createViteServer } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { activityStream } from "./activityStream"
import { codexAgentPlugin } from "./viteCodexAgentPlugin"

type StartedVisionServer = {
  readonly app: ViteDevServer
  readonly server: Server
  readonly url: string
}

type JsonResponse = {
  readonly status: number
  readonly body: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const hasDetectionArray = (value: unknown): value is { readonly detections: readonly unknown[] } =>
  isRecord(value) && "detections" in value && Array.isArray(Reflect.get(value, "detections"))

const activePersonApproachRequest = {
  cameraId: "gate-north-03",
  incidentId: "vision-fixture-approach",
  frames: [
    {
      frameId: "frame-001",
      timestampMs: 0,
      objects: [
        {
          objectId: "person-alpha",
          label: "person",
          confidence: 0.94,
          distanceMeters: 52,
          bbox: { x: 0.22, y: 0.32, width: 0.12, height: 0.28 },
        },
      ],
    },
    {
      frameId: "frame-002",
      timestampMs: 1_000,
      objects: [
        {
          objectId: "person-alpha",
          label: "person",
          confidence: 0.96,
          distanceMeters: 34,
          bbox: { x: 0.3, y: 0.34, width: 0.13, height: 0.31 },
        },
      ],
    },
    {
      frameId: "frame-003",
      timestampMs: 2_000,
      objects: [
        {
          objectId: "person-alpha",
          label: "person",
          confidence: 0.97,
          distanceMeters: 18,
          bbox: { x: 0.39, y: 0.36, width: 0.15, height: 0.35 },
        },
      ],
    },
  ],
} as const

const startedServers: StartedVisionServer[] = []

beforeEach(() => {
  activityStream.clear()
})

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map(stopVisionServer))
  activityStream.clear()
})

describe("vision pipeline HTTP boundary", () => {
  it("returns frame detections, active tracks, agent analysis, and Codex evidence when a person approaches", async () => {
    const server = await startVisionServer()

    const response = await postJson(server.url, activePersonApproachRequest)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      provider: "local-frame-cv",
      tracks: [expect.objectContaining({ status: "active_track" })],
      semanticEvents: [
        expect.objectContaining({
          action: "walking_or_running",
          direction: "moving_right",
          distanceTrend: "approaching",
        }),
      ],
      visualAnalysisAgent: expect.objectContaining({ status: "triggered" }),
      situationAnalysisAgent: expect.objectContaining({ riskLevel: "watch" }),
      evidenceBundle: expect.objectContaining({
        codexReady: true,
        recommendedAction: expect.stringMatching(/human review.*adjacent camera/i),
      }),
    })
    expect(hasDetectionArray(response.body)).toBe(true)
    if (!hasDetectionArray(response.body)) {
      throw new Error("Vision response body must include detections")
    }
    const { detections } = response.body
    expect(Array.isArray(detections)).toBe(true)
    expect(detections.length).toBeGreaterThanOrEqual(3)
  })

  it("returns a Korean JSON validation error when frames are empty", async () => {
    const server = await startVisionServer()

    const response = await postJson(server.url, {
      cameraId: "gate-north-03",
      incidentId: "vision-empty-frames",
      frames: [],
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: "비전 파이프라인 요청에는 하나 이상의 프레임이 필요합니다.",
    })
  })

  it("keeps DETR provider evidence flowing through visual and situation agents", async () => {
    const server = await startVisionServer()

    const response = await postJson(server.url, {
      cameraId: "CAM-E-03",
      sequenceId: "detr-realtime-sequence",
      providerHint: "transformers-detr",
      frames: [
        {
          frameId: "rt-001",
          timestampMs: 0,
          width: 640,
          height: 360,
          objects: [
            {
              label: "person",
              confidence: 0.82,
              distanceMeters: 26,
              bbox: { x: 392, y: 118, width: 44, height: 110 },
            },
          ],
        },
        {
          frameId: "rt-002",
          timestampMs: 250,
          width: 640,
          height: 360,
          objects: [
            {
              label: "person",
              confidence: 0.88,
              distanceMeters: 18,
              bbox: { x: 372, y: 122, width: 56, height: 128 },
            },
          ],
        },
      ],
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      provider: "transformers-detr",
      semanticEvents: [
        expect.objectContaining({
          action: "approaching_camera",
          direction: "moving_left",
        }),
      ],
      visualAnalysisAgent: {
        agentId: "agent-visual-analysis",
        status: "triggered",
      },
      situationAnalysisAgent: {
        agentId: "agent-situation-analysis",
        riskLevel: "watch",
      },
      evidenceBundle: { codexReady: true },
    })
  })

  it("emits start and end activity events with durations and detection counts", async () => {
    const server = await startVisionServer()

    const response = await postJson(server.url, activePersonApproachRequest)

    expect(response.status).toBe(200)
    const events = activityStream.snapshot().filter((event) => event.source === "vision")
    const stages = events.map((event) => event.stage)
    for (const stage of ["receive", "decode", "detect", "classify", "decide"]) {
      expect(stages).toContain(`${stage}:start`)
      expect(stages).toContain(`${stage}:end`)
      const endEvent = events.find((event) => event.stage === `${stage}:end`)
      expect(endEvent?.detail).toMatchObject({
        durationMs: expect.any(Number),
        detectionCount: expect.any(Number),
      })
    }
    expect(events.find((event) => event.stage === "detect:end")?.detail).toMatchObject({
      detectionCount: 3,
    })
  })
})

const startVisionServer = async (): Promise<StartedVisionServer> => {
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

const stopVisionServer = async ({ app, server }: StartedVisionServer): Promise<void> => {
  await Promise.all([close(server), app.close()])
}

const postJson = async (url: string, payload: unknown): Promise<JsonResponse> => {
  const response = await fetch(`${url}/api/vision-pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  if (text.length === 0) {
    return { status: response.status, body: undefined }
  }
  return { status: response.status, body: JSON.parse(text) }
}

const listen = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

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

const serverUrl = (server: Server): string => {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Vision pipeline test server address was not allocated")
  }
  const { address: host, port } = address as AddressInfo
  return `http://${host}:${port}`
}
