import {
  DetrDetectionArraySchema,
  type VisionFrameObject,
  normalizeDetrDetections,
} from "./detrVisionDetector"

export const DEFAULT_DETR_SERVER_URL = "http://127.0.0.1:8766"

const configuredDetrServerUrl = import.meta.env.VITE_DETR_SERVER_URL?.trim()

export const DETR_SERVER_URL = (
  configuredDetrServerUrl === undefined || configuredDetrServerUrl.length === 0
    ? DEFAULT_DETR_SERVER_URL
    : configuredDetrServerUrl
).replace(/\/+$/, "")

const normalizeEnvFlag = (value: string | undefined): string | undefined => {
  const normalized = value?.trim().toLowerCase()
  return normalized === "" ? undefined : normalized
}

export const DETR_SERVER_DETECTION_ENABLED =
  normalizeEnvFlag(import.meta.env.VITE_DETR_SERVER_DETECTION_ENABLED) !== "false"

export const DETR_ONDEVICE_FALLBACK_ENABLED =
  normalizeEnvFlag(import.meta.env.VITE_DETR_ONDEVICE_FALLBACK_ENABLED) === "true"

export const DETR_SERVER_CONNECTION = {
  connected: "connected",
  disconnected: "disconnected",
  disabled: "disabled",
} as const

export type DetrServerConnection =
  (typeof DETR_SERVER_CONNECTION)[keyof typeof DETR_SERVER_CONNECTION]

export const isDetrServerDisconnected = (connection: DetrServerConnection): boolean =>
  connection === DETR_SERVER_CONNECTION.disconnected

type ServerDetectionInput = {
  readonly source: string
  readonly frameWidth: number
  readonly frameHeight: number
}

export class ServerDetectionClientError extends Error {
  readonly name = "ServerDetectionClientError"
}

const testDetector = (): D4dTestDetrDetector | undefined => {
  if (typeof window === "undefined") {
    return undefined
  }
  return window.__D4D_TEST_DETR_DETECTOR__
}

export const detectFrameObjectsWithServerDetr = async ({
  source,
  frameWidth,
  frameHeight,
}: ServerDetectionInput): Promise<readonly VisionFrameObject[]> => {
  const detector = testDetector()
  if (detector !== undefined) {
    const parsed = DetrDetectionArraySchema.safeParse(await detector(source))
    if (!parsed.success) {
      throw new ServerDetectionClientError(
        "DETR test detector response did not match raw detections",
      )
    }
    return normalizeDetrDetections(parsed.data, { frameWidth, frameHeight })
  }

  const response = await fetch(`${DETR_SERVER_URL}/detect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, frameWidth, frameHeight }),
  })

  if (!response.ok) {
    throw new ServerDetectionClientError(`DETR server request failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  const parsed = DetrDetectionArraySchema.safeParse(payload)
  if (!parsed.success) {
    throw new ServerDetectionClientError("DETR server response did not match raw detections")
  }
  return normalizeDetrDetections(parsed.data, { frameWidth, frameHeight })
}
