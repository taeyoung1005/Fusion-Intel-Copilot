import type { DynamicCameraRecord } from "./dynamicMapCamera"

export type MobileCameraConnectionTone = "live" | "waiting"

export type MobileCameraConnectionState = {
  readonly label: "수신 중" | "연결됨 · 프레임 대기"
  readonly shortLabel: "LIVE" | "WAIT"
  readonly tone: MobileCameraConnectionTone
}

export const mobileCameraConnectionState = (
  camera: DynamicCameraRecord,
): MobileCameraConnectionState => {
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
