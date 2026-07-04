import { useEffect, useMemo, useState } from "react"
import {
  type CarlaCameraSnapshot,
  carlaCameraFrameSrc,
  listCarlaCameras,
} from "./carlaCameraClient"
import {
  type DynamicCameraRecord,
  buildDynamicCameraRecord,
  carlaCameraInput,
} from "./dynamicMapCamera"

type UseCarlaCameraRegistryArgs = {
  readonly setCommandFeedback: (message: string) => void
}

type CarlaCameraRegistry = {
  readonly carlaCameras: readonly DynamicCameraRecord[]
}

export const CARLA_CAMERA_POLL_INTERVAL_MS = 1_000

export const areCarlaCameraSnapshotsEqual = (
  left: readonly CarlaCameraSnapshot[],
  right: readonly CarlaCameraSnapshot[],
): boolean =>
  left.length === right.length &&
  left.every((camera, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      camera.id === other.id &&
      camera.label === other.label &&
      camera.lastFrameAt === other.lastFrameAt &&
      camera.frameCount === other.frameCount &&
      camera.yaw === other.yaw
    )
  })

export const useCarlaCameras = ({
  setCommandFeedback,
}: UseCarlaCameraRegistryArgs): CarlaCameraRegistry => {
  const [carlaSnapshots, setCarlaSnapshots] = useState<readonly CarlaCameraSnapshot[]>([])

  useEffect(() => {
    let active = true
    const loadCarlaCameras = async (): Promise<void> => {
      try {
        const cameras = await listCarlaCameras()
        if (active) {
          setCarlaSnapshots((previous) =>
            areCarlaCameraSnapshotsEqual(previous, cameras) ? previous : cameras,
          )
        }
      } catch (error: unknown) {
        if (active && error instanceof Error) {
          setCommandFeedback(`CARLA 시뮬레이션 CCTV 동기화 실패: ${error.message}`)
        }
      }
    }
    void loadCarlaCameras()
    const intervalId = window.setInterval(
      () => void loadCarlaCameras(),
      CARLA_CAMERA_POLL_INTERVAL_MS,
    )
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [setCommandFeedback])

  const carlaCameras = useMemo(
    () =>
      carlaSnapshots.map((camera, index) =>
        buildDynamicCameraRecord(
          carlaCameraInput(
            camera.id,
            camera.label,
            index,
            camera.frameCount,
            camera.lastFrameAt,
            camera.frameCount > 0 ? carlaCameraFrameSrc(camera.id, camera.frameCount) : null,
            camera.yaw,
          ),
        ),
      ),
    [carlaSnapshots],
  )

  return { carlaCameras }
}
