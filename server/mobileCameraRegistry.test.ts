import { type Server, createServer } from "node:http"
import { type ViteDevServer, createServer as createViteServer } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { codexAgentPlugin } from "./viteCodexAgentPlugin"

type StartedMobileServer = {
  readonly app: ViteDevServer
  readonly server: Server
  readonly url: string
}

type JsonResponse = {
  readonly status: number
  readonly body: unknown
}

const RegisteredCameraResponseSchema = z.object({
  camera: z.object({ id: z.string() }),
})

const startedServers: StartedMobileServer[] = []

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map(stopMobileServer))
})

describe("mobile camera registry HTTP boundary", () => {
  it("registers a phone camera, accepts a frame, and lists it for the COP map", async () => {
    // Given: the Vite middleware server is running with no registered phone cameras.
    const server = await startMobileServer()

    // When: a phone registers and posts one compressed camera frame.
    const registered = await postJson(`${server.url}/api/mobile-cameras/register`, {
      label: "휴대폰 북문 초소",
    })
    expect(registered.status).toBe(200)
    expect(registered.body).toMatchObject({
      camera: expect.objectContaining({
        id: expect.stringMatching(/^PHONE-/),
        label: "휴대폰 북문 초소",
        source: "mobile",
        frameCount: 0,
      }),
    })

    const cameraId = readCameraId(registered.body)
    const frame = await postJson(`${server.url}/api/mobile-cameras/${cameraId}/frame`, {
      frameDataUrl: "data:image/jpeg;base64,QUJDRA==",
    })

    // Then: the dashboard registry can read the live phone CCTV metadata and latest frame.
    expect(frame.status).toBe(200)
    expect(frame.body).toMatchObject({
      camera: expect.objectContaining({ id: cameraId, frameCount: 1 }),
    })

    const listed = await getJson(`${server.url}/api/mobile-cameras`)
    expect(listed.status).toBe(200)
    expect(listed.body).toMatchObject({
      cameras: [
        expect.objectContaining({
          id: cameraId,
          label: "휴대폰 북문 초소",
          latestFrameDataUrl: "data:image/jpeg;base64,QUJDRA==",
          status: "online",
        }),
      ],
    })
  })

  it("rejects malformed frame payloads with a Korean validation error", async () => {
    // Given: a registered phone camera exists.
    const server = await startMobileServer()
    const registered = await postJson(`${server.url}/api/mobile-cameras/register`, {})
    const cameraId = readCameraId(registered.body)

    // When: the phone posts a non-image frame.
    const frame = await postJson(`${server.url}/api/mobile-cameras/${cameraId}/frame`, {
      frameDataUrl: "not-an-image",
    })

    // Then: the boundary rejects the payload before it reaches dashboard state.
    expect(frame.status).toBe(400)
    expect(frame.body).toEqual({ error: "모바일 CCTV 프레임은 data:image 형식이어야 합니다." })
  })
})

const startMobileServer = async (): Promise<StartedMobileServer> => {
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

const stopMobileServer = async ({ app, server }: StartedMobileServer): Promise<void> => {
  await Promise.all([close(server), app.close()])
}

const getJson = async (url: string): Promise<JsonResponse> => {
  const response = await fetch(url)
  const body = await parseJsonResponse(response)
  return { status: response.status, body }
}

const postJson = async (url: string, payload: unknown): Promise<JsonResponse> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  const body = await parseJsonResponse(response)
  return { status: response.status, body }
}

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  return text.length === 0 ? undefined : JSON.parse(text)
}

const readCameraId = (value: unknown): string => {
  return RegisteredCameraResponseSchema.parse(value).camera.id
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
