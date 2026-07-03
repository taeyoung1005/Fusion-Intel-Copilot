import { useEffect, useMemo, useState } from "react"
import type { MapCamera } from "./copData"
import {
  type DynamicCameraRecord,
  buildDynamicCameraRecord,
  mobileCameraInput,
} from "./dynamicMapCamera"
import {
  type MobileCameraSnapshot,
  deleteMobileCamera,
  listMobileCameras,
} from "./mobileCameraClient"

type UseDynamicCameraRegistryArgs = {
  readonly selectedCameraId: string
  readonly setSelectedCameraId: (cameraId: string) => void
  readonly setCommandFeedback: (message: string) => void
}

type DynamicCameraRegistry = {
  readonly mobileCameras: readonly DynamicCameraRecord[]
  readonly dynamicCameras: readonly MapCamera[]
  readonly deleteSelectedMobileCamera: () => void
  readonly selectDynamicCamera: (record: DynamicCameraRecord) => void
}

export const useDynamicCameras = ({
  selectedCameraId,
  setSelectedCameraId,
  setCommandFeedback,
}: UseDynamicCameraRegistryArgs): DynamicCameraRegistry => {
  const [mobileSnapshots, setMobileSnapshots] = useState<readonly MobileCameraSnapshot[]>([])

  useEffect(() => {
    let active = true
    const loadMobileCameras = async (): Promise<void> => {
      try {
        const cameras = await listMobileCameras()
        if (active) {
          setMobileSnapshots(cameras)
        }
      } catch (error: unknown) {
        if (active && error instanceof Error) {
          setCommandFeedback(`모바일 CCTV 동기화 실패: ${error.message}`)
        }
      }
    }
    void loadMobileCameras()
    const intervalId = window.setInterval(() => void loadMobileCameras(), 2_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [setCommandFeedback])

  const mobileCameras = useMemo(
    () =>
      mobileSnapshots.map((camera, index) =>
        buildDynamicCameraRecord(
          mobileCameraInput(
            camera.id,
            camera.label,
            index,
            camera.frameCount,
            camera.lastFrameAt,
            camera.latestFrameDataUrl,
          ),
        ),
      ),
    [mobileSnapshots],
  )
  const dynamicCameras = useMemo(
    () => mobileCameras.map((record) => record.camera),
    [mobileCameras],
  )

  const deleteSelectedMobileCamera = (): void => {
    const target = mobileCameras.find((camera) => camera.id === selectedCameraId)
    if (target === undefined) {
      setCommandFeedback("해제할 휴대폰 CCTV를 먼저 선택해야 합니다.")
      return
    }
    deleteMobileCamera(target.id)
      .then((cameras) => {
        setMobileSnapshots(cameras)
        setSelectedCameraId("")
        setCommandFeedback(`${target.id} 해제: 휴대폰 CCTV 연결을 관제 지도에서 제거했습니다.`)
      })
      .catch((error: unknown) => {
        setCommandFeedback(
          error instanceof Error
            ? `휴대폰 CCTV 해제 실패: ${error.message}`
            : "휴대폰 CCTV 해제 실패",
        )
      })
  }

  const selectDynamicCamera = (record: DynamicCameraRecord): void => {
    setSelectedCameraId(record.id)
    setCommandFeedback(`${record.id} 선택: ${record.label} 지도 노드를 확인 중입니다.`)
  }

  return {
    mobileCameras,
    dynamicCameras,
    deleteSelectedMobileCamera,
    selectDynamicCamera,
  }
}
