import { type Server, createServer } from "node:http"
import { type ViteDevServer, createServer as createViteServer } from "vite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { activityStream } from "./activityStream"
import { resetCarlaCameraRegistryForTest } from "./carlaCameraRegistry"
import { codexAgentPlugin } from "./viteCodexAgentPlugin"

type StartedCarlaServer = {
  readonly app: ViteDevServer
  readonly server: Server
  readonly url: string
}

type JsonResponse = {
  readonly status: number
  readonly body: unknown
}

const startedServers: StartedCarlaServer[] = []

const CameraListSchema = z.object({ cameras: z.array(z.object({ id: z.string() })) })

beforeEach(() => {
  activityStream.clear()
  resetCarlaCameraRegistryForTest()
})

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map(stopCarlaServer))
  activityStream.clear()
  resetCarlaCameraRegistryForTest()
})

describe("carla camera registry HTTP boundary", () => {
  it("creates a CARLA camera on first frame post and lists the latest frame", async () => {
    // Given: the Vite middleware server is running with no registered CARLA cameras.
    const server = await startCarlaServer()

    // When: the CARLA bridge posts two frames for a fixed camera.
    const firstFrame = await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame`, {
      frameDataUrl: "data:image/jpeg;base64,QUJDRA==",
      label: "CARLA 북측 게이트",
      yaw: 90,
    })
    const secondFrame = await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame`, {
      frameDataUrl: "data:image/jpeg;base64,RUZHSA==",
      yaw: 271.5,
    })

    // Then: the camera is upserted and keeps the latest frame.
    expect(firstFrame.status).toBe(200)
    expect(secondFrame.status).toBe(200)
    expect(secondFrame.body).toMatchObject({
      camera: expect.objectContaining({
        id: "CAM-CARLA-01",
        label: "CARLA 북측 게이트",
        source: "carla",
        frameCount: 2,
        yaw: 271.5,
      }),
    })
    const listed = await getJson(`${server.url}/api/carla-cameras`)
    expect(listed.body).toMatchObject({
      cameras: [
        expect.objectContaining({
          id: "CAM-CARLA-01",
          latestFrameDataUrl: "data:image/jpeg;base64,RUZHSA==",
          source: "carla",
          yaw: 271.5,
        }),
      ],
    })
  })

  it("lists CARLA camera metadata without embedding frame data for high-rate polling", async () => {
    // Given: a CARLA camera has a latest frame in the registry.
    const server = await startCarlaServer()
    await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame`, {
      frameDataUrl: "data:image/jpeg;base64,RUZHSA==",
      label: "CARLA 북측 게이트",
    })

    // When: the dashboard asks for the lightweight polling payload.
    const listed = await getJson(`${server.url}/api/carla-cameras?frames=0`)

    // Then: metadata remains available without pushing the image through React state.
    expect(listed.status).toBe(200)
    expect(listed.body).toMatchObject({
      cameras: [
        expect.objectContaining({
          id: "CAM-CARLA-01",
          frameCount: expect.any(Number),
          latestFrameDataUrl: null,
        }),
      ],
    })
  })

  it("serves the latest CARLA camera frame as an image resource", async () => {
    // Given: a CARLA camera has a latest JPEG frame in the registry.
    const server = await startCarlaServer()
    await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame`, {
      frameDataUrl: "data:image/jpeg;base64,RUZHSA==",
      label: "CARLA 북측 게이트",
    })

    // When: the CCTV card loads the image URL for that camera.
    const image = await getRaw(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame.jpg`)

    // Then: it receives the decoded image bytes without a JSON/base64 wrapper.
    expect(image.status).toBe(200)
    expect(image.contentType).toBe("image/jpeg")
    expect(Buffer.from(image.body).toString("utf8")).toBe("EFGH")
  })

  it("streams the latest CARLA camera frame as MJPEG", async () => {
    // Given: a CARLA camera has a latest JPEG frame in the registry.
    const server = await startCarlaServer()
    await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame`, {
      frameDataUrl: "data:image/jpeg;base64,RUZHSA==",
      label: "CARLA 북측 게이트",
    })

    // When: the CCTV card opens the MJPEG stream for that camera.
    const stream = await readFirstStreamChunk(
      `${server.url}/api/carla-cameras/CAM-CARLA-01/stream.mjpg`,
    )

    // Then: it receives an immediately displayable multipart JPEG frame.
    expect(stream.status).toBe(200)
    expect(stream.contentType).toContain("multipart/x-mixed-replace")
    expect(stream.chunk).toContain("--carla-frame")
    expect(stream.chunk).toContain("Content-Type: image/jpeg")
    expect(stream.chunk).toContain("EFGH")
  })

  it("rejects malformed CARLA frame payloads before mutating the registry", async () => {
    // Given: the Vite middleware server is running.
    const server = await startCarlaServer()

    // When: the bridge posts a non-image payload.
    const frame = await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-BAD/frame`, {
      frameDataUrl: "not-an-image",
    })

    // Then: the boundary rejects it before creating that camera.
    expect(frame.status).toBe(400)
    expect(frame.body).toEqual({ error: "CARLA 카메라 프레임은 data:image 형식이어야 합니다." })
    const listed = await getJson(`${server.url}/api/carla-cameras`)
    const listedIds = CameraListSchema.parse(listed.body).cameras.map((camera) => camera.id)
    expect(listedIds).not.toContain("CAM-CARLA-BAD")
  })

  it("emits a structured CARLA activity event when a frame upload is accepted", async () => {
    // Given: the activity buffer is empty and the Vite middleware server is running.
    const server = await startCarlaServer()

    // When: the CARLA bridge posts a valid frame.
    const frame = await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame`, {
      frameDataUrl: "data:image/jpeg;base64,QUJDRA==",
      label: "CARLA 북측 게이트",
    })

    // Then: the registry records the real frame upload as a structured activity event.
    expect(frame.status).toBe(200)
    expect(activityStream.snapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "carla",
          stage: "frame-upload:end",
          level: "info",
          detail: expect.objectContaining({
            cameraId: "CAM-CARLA-01",
            frameCount: expect.any(Number),
          }),
        }),
      ]),
    )
  })

  it("throttles routine frame-upload activity events per camera to avoid log floods", async () => {
    // Given: the activity buffer is empty and the Vite middleware server is running.
    const server = await startCarlaServer()

    // When: the CARLA bridge posts many frames for the same camera in quick succession.
    for (let i = 0; i < 20; i += 1) {
      const frame = await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame`, {
        frameDataUrl: "data:image/jpeg;base64,QUJDRA==",
      })
      expect(frame.status).toBe(200)
    }

    // Then: the registry still upserts every frame, but only logs the burst once.
    const listed = await getJson(`${server.url}/api/carla-cameras`)
    expect(listed.body).toMatchObject({
      cameras: [expect.objectContaining({ id: "CAM-CARLA-01", frameCount: 20 })],
    })
    const acceptedEvents = activityStream
      .snapshot()
      .filter((event) => event.stage === "frame-upload:end" && event.level === "info")
    expect(acceptedEvents).toHaveLength(1)

    // And: a different camera still gets its own first-frame log.
    const otherFrame = await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-02/frame`, {
      frameDataUrl: "data:image/jpeg;base64,QUJDRA==",
    })
    expect(otherFrame.status).toBe(200)
    const acceptedAfterOther = activityStream
      .snapshot()
      .filter((event) => event.stage === "frame-upload:end" && event.level === "info")
    expect(acceptedAfterOther).toHaveLength(2)
  })

  it("removes a CARLA camera from the registry", async () => {
    // Given: a CARLA camera exists after its first frame post.
    const server = await startCarlaServer()
    await postJson(`${server.url}/api/carla-cameras/CAM-CARLA-01/frame`, {
      frameDataUrl: "data:image/jpeg;base64,QUJDRA==",
    })

    // When: the operator deletes the camera.
    const deleted = await deleteJson(`${server.url}/api/carla-cameras/CAM-CARLA-01`)

    // Then: it no longer appears in the list.
    expect(deleted.status).toBe(200)
    const deletedIds = CameraListSchema.parse(deleted.body).cameras.map((camera) => camera.id)
    expect(deletedIds).not.toContain("CAM-CARLA-01")
  })
})

const startCarlaServer = async (): Promise<StartedCarlaServer> => {
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

const stopCarlaServer = async ({ app, server }: StartedCarlaServer): Promise<void> => {
  await Promise.all([close(server), app.close()])
}

const getJson = async (url: string): Promise<JsonResponse> => {
  const response = await fetch(url)
  const body = await parseJsonResponse(response)
  return { status: response.status, body }
}

const getRaw = async (
  url: string,
): Promise<{
  readonly status: number
  readonly contentType: string | null
  readonly body: ArrayBuffer
}> => {
  const response = await fetch(url)
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: await response.arrayBuffer(),
  }
}

const readFirstStreamChunk = async (
  url: string,
): Promise<{ readonly status: number; readonly contentType: string; readonly chunk: string }> => {
  const response = await fetch(url)
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new Error("Expected stream response body")
  }
  const { value } = await reader.read()
  await reader.cancel()
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    chunk: Buffer.from(value ?? new Uint8Array()).toString("utf8"),
  }
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

const deleteJson = async (url: string): Promise<JsonResponse> => {
  const response = await fetch(url, { method: "DELETE" })
  const body = await parseJsonResponse(response)
  return { status: response.status, body }
}

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  return text.length === 0 ? undefined : JSON.parse(text)
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
