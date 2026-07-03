import { z } from "zod"

const MobileCameraSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.literal("mobile"),
  status: z.union([z.literal("online"), z.literal("stale")]),
  createdAt: z.string(),
  lastFrameAt: z.string().nullable(),
  frameCount: z.number().int().nonnegative(),
  latestFrameDataUrl: z.string().nullable(),
})

const MobileCameraListSchema = z.object({
  cameras: z.array(MobileCameraSchema),
})

const MobileCameraResponseSchema = z.object({
  camera: MobileCameraSchema,
})

export type MobileCameraSnapshot = z.infer<typeof MobileCameraSchema>

export const listMobileCameras = async (): Promise<readonly MobileCameraSnapshot[]> => {
  const response = await fetch("/api/mobile-cameras")
  const body = await readJson(response)
  return MobileCameraListSchema.parse(body).cameras
}

export const registerMobileCamera = async (label: string): Promise<MobileCameraSnapshot> => {
  const response = await fetch("/api/mobile-cameras/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label }),
  })
  const body = await readJson(response)
  return MobileCameraResponseSchema.parse(body).camera
}

export const sendMobileFrame = async (
  cameraId: string,
  frameDataUrl: string,
): Promise<MobileCameraSnapshot> => {
  const response = await fetch(`/api/mobile-cameras/${encodeURIComponent(cameraId)}/frame`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ frameDataUrl }),
  })
  const body = await readJson(response)
  return MobileCameraResponseSchema.parse(body).camera
}

export const deleteMobileCamera = async (
  cameraId: string,
): Promise<readonly MobileCameraSnapshot[]> => {
  const response = await fetch(`/api/mobile-cameras/${encodeURIComponent(cameraId)}`, {
    method: "DELETE",
  })
  const body = await readJson(response)
  return MobileCameraListSchema.parse(body).cameras
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
  return parsed.success ? parsed.data.error : "모바일 CCTV API 요청이 실패했습니다."
}
