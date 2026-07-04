import { z } from "zod"

const CarlaCameraSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.literal("carla"),
  status: z.union([z.literal("online"), z.literal("stale")]),
  createdAt: z.string(),
  lastFrameAt: z.string().nullable(),
  frameCount: z.number().int().nonnegative(),
  latestFrameDataUrl: z.string().nullable(),
  yaw: z.number().finite().optional(),
})

const CarlaCameraListSchema = z.object({
  cameras: z.array(CarlaCameraSchema),
})

export type CarlaCameraSnapshot = z.infer<typeof CarlaCameraSchema>

const CarlaWebrtcAnswerSchema = z.object({
  type: z.literal("answer"),
  sdp: z.string(),
})

export type CarlaWebrtcAnswer = z.infer<typeof CarlaWebrtcAnswerSchema>

export const listCarlaCameras = async (): Promise<readonly CarlaCameraSnapshot[]> => {
  const response = await fetch("/api/carla-cameras?frames=0")
  const body = await readJson(response)
  return CarlaCameraListSchema.parse(body).cameras
}

export const carlaCameraFrameSrc = (cameraId: string, frameCount: number): string =>
  `/api/carla-cameras/${encodeURIComponent(cameraId)}/frame.jpg?frame=${String(frameCount)}`

export const carlaCameraStreamSrc = (cameraId: string): string =>
  `/api/carla-cameras/${encodeURIComponent(cameraId)}/stream.mjpg`

export const requestCarlaWebrtcAnswer = async (
  cameraId: string,
  offer: RTCSessionDescriptionInit,
): Promise<CarlaWebrtcAnswer> => {
  const response = await fetch(`/api/carla-webrtc/${encodeURIComponent(cameraId)}/offer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: offer.type, sdp: offer.sdp }),
  })
  const body = await readJson(response)
  return CarlaWebrtcAnswerSchema.parse(body)
}

export const deleteCarlaCamera = async (
  cameraId: string,
): Promise<readonly CarlaCameraSnapshot[]> => {
  const response = await fetch(`/api/carla-cameras/${encodeURIComponent(cameraId)}`, {
    method: "DELETE",
  })
  const body = await readJson(response)
  return CarlaCameraListSchema.parse(body).cameras
}

const readJson = async (response: Response): Promise<unknown> => {
  const body = await response.json()
  if (!response.ok) {
    throw new Error(readErrorMessage(body))
  }
  return body
}

const readErrorMessage = (body: unknown): string => {
  const parsed = z.object({ error: z.string() }).safeParse(body)
  return parsed.success ? parsed.data.error : "CARLA 카메라 API 요청이 실패했습니다."
}
