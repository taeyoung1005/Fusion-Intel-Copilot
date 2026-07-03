import type { DynamicCameraRecord } from "./dynamicMapCamera"

export type CameraConnectionTone = "live" | "waiting"

export type CameraConnectionState = {
  readonly label: "수신 중" | "연결됨 · 프레임 대기"
  readonly shortLabel: "LIVE" | "WAIT"
  readonly tone: CameraConnectionTone
}

export const cameraConnectionState = (camera: DynamicCameraRecord): CameraConnectionState => {
  const frameCount = camera.frameCount ?? 0
  if (
    frameCount > 0 &&
    camera.latestFrameDataUrl !== null &&
    camera.latestFrameDataUrl !== undefined
  ) {
    return { label: "수신 중", shortLabel: "LIVE", tone: "live" }
  }
  return { label: "연결됨 · 프레임 대기", shortLabel: "WAIT", tone: "waiting" }
}
