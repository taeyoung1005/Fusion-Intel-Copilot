import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http"
import { type ViteDevServer, createServer as createViteServer } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { codexAgentPlugin } from "./viteCodexAgentPlugin"

type StartedServer = {
  readonly app?: ViteDevServer
  readonly server: Server
  readonly url: string
}

type JsonResponse = {
  readonly status: number
  readonly body: unknown
}

const startedServers: StartedServer[] = []
const WEBRTC_ORIGIN_ENV = "D4D_CARLA_WEBRTC_ORIGIN"
const originalWebrtcOrigin = process.env[WEBRTC_ORIGIN_ENV]

afterEach(async () => {
  if (originalWebrtcOrigin === undefined) {
    process.env[WEBRTC_ORIGIN_ENV] = undefined
  } else {
    process.env[WEBRTC_ORIGIN_ENV] = originalWebrtcOrigin
  }
  await Promise.all(startedServers.splice(0).map(stopServer))
})

describe("CARLA WebRTC signaling proxy", () => {
  it("proxies a browser offer to the CARLA bridge and returns the answer", async () => {
    const received: Array<{ readonly path: string; readonly body: unknown }> = []
    const bridge = await startMockBridge(async (request, response) => {
      received.push({ path: request.url ?? "/", body: await parseRequestJson(request) })
      writeJson(response, 200, { type: "answer", sdp: "v=0\r\nmock-answer" })
    })
    const d4d = await startD4dServer(bridge.url)

    const result = await postJson(`${d4d.url}/api/carla-webrtc/CARLA-E-02/offer`, {
      type: "offer",
      sdp: "v=0\r\nmock-offer",
    })

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ type: "answer", sdp: "v=0\r\nmock-answer" })
    expect(received).toEqual([
      {
        path: "/webrtc/CARLA-E-02/offer",
        body: { type: "offer", sdp: "v=0\r\nmock-offer" },
      },
    ])
  })

  it("rejects malformed offers before contacting the CARLA bridge", async () => {
    let bridgeHit = false
    const bridge = await startMockBridge((_request, response) => {
      bridgeHit = true
      writeJson(response, 500, { error: "should not be reached" })
    })
    const d4d = await startD4dServer(bridge.url)

    const result = await postJson(`${d4d.url}/api/carla-webrtc/CARLA-E-02/offer`, {
      type: "answer",
      sdp: "",
    })

    expect(result.status).toBe(400)
    expect(result.body).toEqual({ error: "CARLA WebRTC offer 형식이 올바르지 않습니다." })
    expect(bridgeHit).toBe(false)
  })

  it("returns a gateway error when the CARLA WebRTC bridge is unavailable", async () => {
    const d4d = await startD4dServer("http://127.0.0.1:9")

    const result = await postJson(`${d4d.url}/api/carla-webrtc/CARLA-E-02/offer`, {
      type: "offer",
      sdp: "v=0\r\nmock-offer",
    })

    expect(result.status).toBe(502)
    expect(result.body).toEqual({ error: "CARLA WebRTC 브리지에 연결할 수 없습니다." })
  })

  it("rejects malformed bridge answers at the signaling boundary", async () => {
    const bridge = await startMockBridge((_request, response) => {
      writeJson(response, 200, { type: "offer", sdp: "v=0\r\nnot-an-answer" })
    })
    const d4d = await startD4dServer(bridge.url)

    const result = await postJson(`${d4d.url}/api/carla-webrtc/CARLA-E-02/offer`, {
      type: "offer",
      sdp: "v=0\r\nmock-offer",
    })

    expect(result.status).toBe(502)
    expect(result.body).toEqual({ error: "CARLA WebRTC 브리지가 잘못된 answer를 반환했습니다." })
  })
})

const startD4dServer = async (webrtcOrigin: string): Promise<StartedServer> => {
  process.env[WEBRTC_ORIGIN_ENV] = webrtcOrigin
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

const startMockBridge = async (
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<StartedServer> => {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch(() => {
      writeJson(response, 500, { error: "mock bridge failed" })
    })
  })
  await listen(server)
  const started = { server, url: serverUrl(server) } satisfies StartedServer
  startedServers.push(started)
  return started
}

const stopServer = async ({ app, server }: StartedServer): Promise<void> => {
  const tasks: Array<Promise<void>> = [close(server)]
  if (app !== undefined) {
    tasks.push(app.close())
  }
  await Promise.all(tasks)
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

const parseRequestJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

const writeJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
}

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  return text.length === 0 ? undefined : JSON.parse(text)
}

const listen = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error)
        return
      }
      resolve()
    })
  })

const serverUrl = (server: Server): string => {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Expected TCP server address")
  }
  return `http://${address.address}:${String(address.port)}`
}
