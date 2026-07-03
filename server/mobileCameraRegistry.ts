import type { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod"

const MAX_BODY_BYTES = 3_000_000

const RegisterRequestSchema = z
  .object({
    label: z.string().trim().min(1).max(48).optional(),
  })
  .strict()

const FrameRequestSchema = z
  .object({
    frameDataUrl: z.string().min(24).max(2_500_000).startsWith("data:image"),
  })
  .strict()

export type MobileCamera = {
  readonly id: string
  readonly label: string
  readonly source: "mobile"
  readonly status: "online" | "stale"
  readonly createdAt: string
  readonly lastFrameAt: string | null
  readonly frameCount: number
  readonly latestFrameDataUrl: string | null
}

type MutableMobileCamera = {
  id: string
  label: string
  source: "mobile"
  status: "online" | "stale"
  createdAt: string
  lastFrameAt: string | null
  frameCount: number
  latestFrameDataUrl: string | null
}

type RouteMatch =
  | { readonly kind: "list" }
  | { readonly kind: "register" }
  | { readonly kind: "frame"; readonly cameraId: string }
  | { readonly kind: "delete"; readonly cameraId: string }
  | { readonly kind: "miss" }

const cameras = new Map<string, MutableMobileCamera>()
let nextCameraNumber = 1

export const isMobileCameraRequest = (
  method: string | undefined,
  url: string | undefined,
): boolean => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  if (!pathname.startsWith("/api/mobile-cameras")) {
    return false
  }
  return method === "GET" || method === "POST" || method === "DELETE"
}

export const handleMobileCameraRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const route = matchRoute(request.method, request.url)
  switch (route.kind) {
    case "list":
      writeJson(response, 200, { cameras: listCameras() })
      return
    case "register":
      await registerCamera(request, response)
      return
    case "frame":
      await acceptFrame(request, response, route.cameraId)
      return
    case "delete":
      cameras.delete(route.cameraId)
      writeJson(response, 200, { cameras: listCameras() })
      return
    case "miss":
      writeJson(response, 404, { error: "모바일 CCTV API 경로를 찾을 수 없습니다." })
      return
  }
}

const matchRoute = (method: string | undefined, url: string | undefined): RouteMatch => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  if (method === "GET" && pathname === "/api/mobile-cameras") {
    return { kind: "list" }
  }
  if (method === "POST" && pathname === "/api/mobile-cameras/register") {
    return { kind: "register" }
  }
  const frameMatch = /^\/api\/mobile-cameras\/([^/]+)\/frame$/.exec(pathname)
  if (method === "POST" && frameMatch?.[1] !== undefined) {
    return { kind: "frame", cameraId: decodeURIComponent(frameMatch[1]) }
  }
  const deleteMatch = /^\/api\/mobile-cameras\/([^/]+)$/.exec(pathname)
  if (method === "DELETE" && deleteMatch?.[1] !== undefined) {
    return { kind: "delete", cameraId: decodeURIComponent(deleteMatch[1]) }
  }
  return { kind: "miss" }
}

const registerCamera = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const rawBody = await readBody(request)
  const parsed = RegisterRequestSchema.safeParse(parseJson(rawBody))
  if (!parsed.success) {
    writeJson(response, 400, { error: "모바일 CCTV 등록 요청 형식이 올바르지 않습니다." })
    return
  }
  const id = `PHONE-${String(nextCameraNumber).padStart(3, "0")}`
  nextCameraNumber += 1
  const camera: MutableMobileCamera = {
    id,
    label: parsed.data.label ?? `휴대폰 CCTV ${id.slice(-3)}`,
    source: "mobile",
    status: "online",
    createdAt: new Date().toISOString(),
    lastFrameAt: null,
    frameCount: 0,
    latestFrameDataUrl: null,
  }
  cameras.set(id, camera)
  writeJson(response, 200, { camera: snapshot(camera) })
}

const acceptFrame = async (
  request: IncomingMessage,
  response: ServerResponse,
  cameraId: string,
): Promise<void> => {
  const camera = cameras.get(cameraId)
  if (camera === undefined) {
    writeJson(response, 404, { error: "등록된 모바일 CCTV를 찾을 수 없습니다." })
    return
  }
  const rawBody = await readBody(request)
  const parsed = FrameRequestSchema.safeParse(parseJson(rawBody))
  if (!parsed.success) {
    writeJson(response, 400, { error: "모바일 CCTV 프레임은 data:image 형식이어야 합니다." })
    return
  }
  camera.status = "online"
  camera.lastFrameAt = new Date().toISOString()
  camera.frameCount += 1
  camera.latestFrameDataUrl = parsed.data.frameDataUrl
  writeJson(response, 200, { camera: snapshot(camera) })
}

const listCameras = (): readonly MobileCamera[] => Array.from(cameras.values(), snapshot)

const snapshot = (camera: MutableMobileCamera): MobileCamera => ({
  id: camera.id,
  label: camera.label,
  source: camera.source,
  status: camera.status,
  createdAt: camera.createdAt,
  lastFrameAt: camera.lastFrameAt,
  frameCount: camera.frameCount,
  latestFrameDataUrl: camera.latestFrameDataUrl,
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
