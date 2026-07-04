import type { IncomingMessage, ServerResponse } from "node:http"
import { performance } from "node:perf_hooks"
import { z } from "zod"
import { emitActivityEvent } from "./activityStream"

const MAX_BODY_BYTES = 3_000_000

const FrameRequestSchema = z
  .object({
    frameDataUrl: z.string().min(24).max(2_500_000).startsWith("data:image"),
    label: z.string().trim().min(1).max(64).optional(),
    yaw: z.number().finite().optional(),
  })
  .strict()

export type CarlaCamera = {
  readonly id: string
  readonly label: string
  readonly source: "carla"
  readonly status: "online" | "stale"
  readonly createdAt: string
  readonly lastFrameAt: string | null
  readonly frameCount: number
  readonly latestFrameDataUrl: string | null
  readonly yaw?: number
}

type MutableCarlaCamera = {
  id: string
  label: string
  source: "carla"
  status: "online" | "stale"
  createdAt: string
  lastFrameAt: string | null
  frameCount: number
  latestFrameDataUrl: string | null
  yaw?: number
}

type RouteMatch =
  | { readonly kind: "list"; readonly includeFrames: boolean }
  | { readonly kind: "frame"; readonly cameraId: string }
  | { readonly kind: "image"; readonly cameraId: string }
  | { readonly kind: "stream"; readonly cameraId: string }
  | { readonly kind: "delete"; readonly cameraId: string }
  | { readonly kind: "miss" }

type FrameImage = {
  readonly contentType: string
  readonly body: Buffer
}

const cameras = new Map<string, MutableCarlaCamera>()
const streamClients = new Map<string, Set<ServerResponse>>()
const MJPEG_BOUNDARY = "carla-frame"
const durationMs = (startedAt: number): number =>
  Math.round((performance.now() - startedAt) * 100) / 100

export const isCarlaCameraRequest = (
  method: string | undefined,
  url: string | undefined,
): boolean => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  if (!pathname.startsWith("/api/carla-cameras")) {
    return false
  }
  return method === "GET" || method === "POST" || method === "DELETE"
}

export const handleCarlaCameraRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const route = matchRoute(request.method, request.url)
  switch (route.kind) {
    case "list":
      writeJson(response, 200, { cameras: listCameras(route.includeFrames) })
      return
    case "frame":
      await acceptFrame(request, response, route.cameraId)
      return
    case "image":
      writeLatestFrameImage(response, route.cameraId)
      return
    case "stream":
      streamLatestFrames(request, response, route.cameraId)
      return
    case "delete":
      cameras.delete(route.cameraId)
      writeJson(response, 200, { cameras: listCameras() })
      return
    case "miss":
      writeJson(response, 404, { error: "CARLA 카메라 API 경로를 찾을 수 없습니다." })
      return
  }
}

const matchRoute = (method: string | undefined, url: string | undefined): RouteMatch => {
  const parsedUrl = new URL(url ?? "/", "http://localhost")
  const pathname = parsedUrl.pathname
  if (method === "GET" && pathname === "/api/carla-cameras") {
    return { kind: "list", includeFrames: shouldIncludeFrames(parsedUrl) }
  }
  const imageMatch = /^\/api\/carla-cameras\/([^/]+)\/frame\.jpg$/.exec(pathname)
  if (method === "GET" && imageMatch?.[1] !== undefined) {
    return { kind: "image", cameraId: decodeURIComponent(imageMatch[1]) }
  }
  const streamMatch = /^\/api\/carla-cameras\/([^/]+)\/stream\.mjpg$/.exec(pathname)
  if (method === "GET" && streamMatch?.[1] !== undefined) {
    return { kind: "stream", cameraId: decodeURIComponent(streamMatch[1]) }
  }
  const frameMatch = /^\/api\/carla-cameras\/([^/]+)\/frame$/.exec(pathname)
  if (method === "POST" && frameMatch?.[1] !== undefined) {
    return { kind: "frame", cameraId: decodeURIComponent(frameMatch[1]) }
  }
  const deleteMatch = /^\/api\/carla-cameras\/([^/]+)$/.exec(pathname)
  if (method === "DELETE" && deleteMatch?.[1] !== undefined) {
    return { kind: "delete", cameraId: decodeURIComponent(deleteMatch[1]) }
  }
  return { kind: "miss" }
}

const shouldIncludeFrames = (url: URL): boolean => {
  const frames = url.searchParams.get("frames")
  if (frames === null) {
    return true
  }
  return frames !== "0" && frames !== "false"
}

const acceptFrame = async (
  request: IncomingMessage,
  response: ServerResponse,
  cameraId: string,
): Promise<void> => {
  const startedAt = performance.now()
  emitActivityEvent({
    source: "carla",
    stage: "frame-upload:start",
    level: "info",
    message: "CARLA 프레임 업링크 수신을 시작했습니다.",
    detail: { cameraId },
  })
  const rawBody = await readBody(request)
  const parsed = FrameRequestSchema.safeParse(parseJson(rawBody))
  if (!parsed.success) {
    emitActivityEvent({
      source: "carla",
      stage: "frame-upload:end",
      level: "warn",
      message: "CARLA 프레임 업링크를 거부했습니다.",
      detail: {
        cameraId,
        durationMs: durationMs(startedAt),
        valid: false,
      },
    })
    writeJson(response, 400, { error: "CARLA 카메라 프레임은 data:image 형식이어야 합니다." })
    return
  }
  const existing = cameras.get(cameraId)
  const camera: MutableCarlaCamera = existing ?? {
    id: cameraId,
    label: parsed.data.label ?? cameraId,
    source: "carla",
    status: "online",
    createdAt: new Date().toISOString(),
    lastFrameAt: null,
    frameCount: 0,
    latestFrameDataUrl: null,
  }
  if (parsed.data.label !== undefined) {
    camera.label = parsed.data.label
  }
  if (parsed.data.yaw !== undefined) {
    camera.yaw = parsed.data.yaw
  }
  camera.status = "online"
  camera.lastFrameAt = new Date().toISOString()
  camera.frameCount += 1
  camera.latestFrameDataUrl = parsed.data.frameDataUrl
  cameras.set(cameraId, camera)
  const image = parseDataImage(parsed.data.frameDataUrl)
  if (image !== null) {
    broadcastFrame(cameraId, image)
  }
  emitActivityEvent({
    source: "carla",
    stage: "frame-upload:end",
    level: "info",
    message: "CARLA 프레임 업링크를 완료했습니다.",
    detail: {
      cameraId,
      durationMs: durationMs(startedAt),
      frameCount: camera.frameCount,
      imageBytes: image?.body.length ?? 0,
      valid: true,
    },
  })
  writeJson(response, 200, { camera: snapshot(camera) })
}

const writeLatestFrameImage = (response: ServerResponse, cameraId: string): void => {
  const camera = cameras.get(cameraId)
  const frame = camera?.latestFrameDataUrl
  if (frame === undefined || frame === null) {
    writeJson(response, 404, { error: "CARLA 카메라 프레임을 찾을 수 없습니다." })
    return
  }
  const image = parseDataImage(frame)
  if (image === null) {
    writeJson(response, 500, { error: "CARLA 카메라 프레임을 이미지로 변환할 수 없습니다." })
    return
  }
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": String(image.body.length),
    "content-type": image.contentType,
  })
  response.end(image.body)
}

const streamLatestFrames = (
  request: IncomingMessage,
  response: ServerResponse,
  cameraId: string,
): void => {
  const camera = cameras.get(cameraId)
  const frame = camera?.latestFrameDataUrl
  if (frame === undefined || frame === null) {
    writeJson(response, 404, { error: "CARLA 카메라 프레임을 찾을 수 없습니다." })
    return
  }
  const image = parseDataImage(frame)
  if (image === null) {
    writeJson(response, 500, { error: "CARLA 카메라 프레임을 이미지로 변환할 수 없습니다." })
    return
  }
  response.writeHead(200, {
    "cache-control": "no-store, no-cache, must-revalidate",
    connection: "close",
    "content-type": `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
    pragma: "no-cache",
  })
  addStreamClient(cameraId, response)
  request.on("close", () => removeStreamClient(cameraId, response))
  writeMjpegFrame(response, image)
}

const addStreamClient = (cameraId: string, response: ServerResponse): void => {
  const clients = streamClients.get(cameraId) ?? new Set<ServerResponse>()
  clients.add(response)
  streamClients.set(cameraId, clients)
}

const removeStreamClient = (cameraId: string, response: ServerResponse): void => {
  const clients = streamClients.get(cameraId)
  if (clients === undefined) {
    return
  }
  clients.delete(response)
  if (clients.size === 0) {
    streamClients.delete(cameraId)
  }
}

const broadcastFrame = (cameraId: string, image: FrameImage): void => {
  const clients = streamClients.get(cameraId)
  if (clients === undefined) {
    return
  }
  for (const response of clients) {
    if (response.destroyed || response.writableEnded) {
      clients.delete(response)
      continue
    }
    writeMjpegFrame(response, image)
  }
  if (clients.size === 0) {
    streamClients.delete(cameraId)
  }
}

const writeMjpegFrame = (response: ServerResponse, image: FrameImage): void => {
  response.write(`--${MJPEG_BOUNDARY}\r\n`)
  response.write(`Content-Type: ${image.contentType}\r\n`)
  response.write(`Content-Length: ${String(image.body.length)}\r\n\r\n`)
  response.write(image.body)
  response.write("\r\n")
}

const parseDataImage = (frameDataUrl: string): FrameImage | null => {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(frameDataUrl)
  if (match?.[1] === undefined || match[2] === undefined) {
    return null
  }
  return {
    contentType: match[1],
    body: Buffer.from(match[2], "base64"),
  }
}

const listCameras = (includeFrames = true): readonly CarlaCamera[] =>
  Array.from(cameras.values(), (camera) => snapshot(camera, includeFrames))

const snapshot = (camera: MutableCarlaCamera, includeFrame = true): CarlaCamera => ({
  id: camera.id,
  label: camera.label,
  source: camera.source,
  status: camera.status,
  createdAt: camera.createdAt,
  lastFrameAt: camera.lastFrameAt,
  frameCount: camera.frameCount,
  latestFrameDataUrl: includeFrame ? camera.latestFrameDataUrl : null,
  ...(camera.yaw !== undefined ? { yaw: camera.yaw } : {}),
})

const readBody = async (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk: string) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("request body too large"))
      }
    })
    request.on("end", () => resolve(body))
    request.on("error", reject)
  })

const parseJson = (rawBody: string): unknown => {
  if (rawBody.trim().length === 0) {
    return {}
  }
  return JSON.parse(rawBody)
}

const writeJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
}
