import type { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod"

const MAX_BODY_BYTES = 256_000
const DEFAULT_WEBRTC_ORIGIN = "http://100.117.133.18:8765"
const WEBRTC_ORIGIN_ENV = "D4D_CARLA_WEBRTC_ORIGIN"

const OfferSchema = z
  .object({
    type: z.literal("offer"),
    sdp: z.string().min(8).max(200_000),
  })
  .strict()

const AnswerSchema = z
  .object({
    type: z.literal("answer"),
    sdp: z.string().min(8).max(200_000),
  })
  .strict()

type RouteMatch = { readonly kind: "offer"; readonly cameraId: string } | { readonly kind: "miss" }

export const isCarlaWebrtcRequest = (
  method: string | undefined,
  url: string | undefined,
): boolean => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  return method === "POST" && pathname.startsWith("/api/carla-webrtc")
}

export const handleCarlaWebrtcRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const route = matchRoute(request.method, request.url)
  if (route.kind === "miss") {
    writeJson(response, 404, { error: "CARLA WebRTC API 경로를 찾을 수 없습니다." })
    return
  }
  await proxyOffer(request, response, route.cameraId)
}

const matchRoute = (method: string | undefined, url: string | undefined): RouteMatch => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  const offerMatch = /^\/api\/carla-webrtc\/([^/]+)\/offer$/.exec(pathname)
  if (method === "POST" && offerMatch?.[1] !== undefined) {
    return { kind: "offer", cameraId: decodeURIComponent(offerMatch[1]) }
  }
  return { kind: "miss" }
}

const proxyOffer = async (
  request: IncomingMessage,
  response: ServerResponse,
  cameraId: string,
): Promise<void> => {
  const rawBody = await readBody(request)
  const parsedOffer = OfferSchema.safeParse(parseJson(rawBody))
  if (!parsedOffer.success) {
    writeJson(response, 400, { error: "CARLA WebRTC offer 형식이 올바르지 않습니다." })
    return
  }

  const bridgeUrl = `${webrtcOrigin()}/webrtc/${encodeURIComponent(cameraId)}/offer`
  let bridgeResponse: Response
  try {
    bridgeResponse = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsedOffer.data),
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    writeJson(response, 502, { error: "CARLA WebRTC 브리지에 연결할 수 없습니다." })
    return
  }

  const body = await readBridgeJson(bridgeResponse)
  if (!bridgeResponse.ok) {
    writeJson(response, bridgeResponse.status, readBridgeError(body))
    return
  }

  const parsedAnswer = AnswerSchema.safeParse(body)
  if (!parsedAnswer.success) {
    writeJson(response, 502, { error: "CARLA WebRTC 브리지가 잘못된 answer를 반환했습니다." })
    return
  }

  writeJson(response, 200, parsedAnswer.data)
}

const webrtcOrigin = (): string =>
  (process.env[WEBRTC_ORIGIN_ENV] ?? DEFAULT_WEBRTC_ORIGIN).replace(/\/+$/, "")

const readBridgeJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (text.length === 0) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const readBridgeError = (body: unknown): { readonly error: string } => {
  const parsed = z.object({ error: z.string().min(1) }).safeParse(body)
  return parsed.success
    ? { error: parsed.data.error }
    : { error: "CARLA WebRTC 브리지 요청이 실패했습니다." }
}

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("Request body too large")
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const writeJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
}
