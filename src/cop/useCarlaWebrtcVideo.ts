import { type RefObject, useEffect, useRef, useState } from "react"
import { requestCarlaWebrtcAnswer } from "./carlaCameraClient"

export type CarlaWebrtcState = "connecting" | "live" | "failed"

type UseCarlaWebrtcVideoResult = {
  readonly videoRef: RefObject<HTMLVideoElement | null>
  readonly state: CarlaWebrtcState
  readonly error: string | null
}

export const useCarlaWebrtcVideo = (
  cameraId: string,
  enabled: boolean,
): UseCarlaWebrtcVideoResult => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<CarlaWebrtcState>("connecting")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setState("failed")
      setError("no frame")
      return
    }

    let cancelled = false
    let removeVideoListener: (() => void) | null = null
    let readyPollId: number | null = null
    const peer = new RTCPeerConnection()
    setState("connecting")
    setError(null)

    peer.addTransceiver("video", { direction: "recvonly" })
    peer.addEventListener("track", (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      const video = videoRef.current
      if (video !== null) {
        video.srcObject = stream
        const markLive = (): void => {
          if (!cancelled) {
            setState("live")
          }
        }
        const startReadyPoll = (): void => {
          readyPollId = window.setInterval(() => {
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
              return
            }
            if (readyPollId !== null) {
              window.clearInterval(readyPollId)
              readyPollId = null
            }
            markLive()
          }, 100)
        }
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          markLive()
        } else {
          video.addEventListener("loadeddata", markLive, { once: true })
          removeVideoListener = () => video.removeEventListener("loadeddata", markLive)
          startReadyPoll()
        }
        video.play().catch(() => {
          setState("failed")
          setError("autoplay failed")
        })
      }
    })
    peer.addEventListener("connectionstatechange", () => {
      if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        setState("failed")
        setError(peer.connectionState)
      }
    })

    negotiate(peer, cameraId).catch((caught: unknown) => {
      if (cancelled) {
        return
      }
      setState("failed")
      setError(caught instanceof Error ? caught.message : "CARLA WebRTC 연결 실패")
    })

    return () => {
      cancelled = true
      const video = videoRef.current
      if (video !== null) {
        video.srcObject = null
      }
      if (readyPollId !== null) {
        window.clearInterval(readyPollId)
      }
      removeVideoListener?.()
      peer.close()
    }
  }, [cameraId, enabled])

  return { videoRef, state, error }
}

const negotiate = async (peer: RTCPeerConnection, cameraId: string): Promise<void> => {
  const offer = await peer.createOffer()
  await peer.setLocalDescription(offer)
  await waitForIceGathering(peer)
  if (peer.localDescription === null) {
    throw new Error("CARLA WebRTC localDescription 생성 실패")
  }
  const answer = await requestCarlaWebrtcAnswer(cameraId, peer.localDescription)
  await peer.setRemoteDescription(answer)
}

const waitForIceGathering = async (peer: RTCPeerConnection): Promise<void> => {
  if (peer.iceGatheringState === "complete") {
    return
  }
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 2_000)
    const onStateChange = (): void => {
      if (peer.iceGatheringState !== "complete") {
        return
      }
      window.clearTimeout(timeout)
      peer.removeEventListener("icegatheringstatechange", onStateChange)
      resolve()
    }
    peer.addEventListener("icegatheringstatechange", onStateChange)
  })
}
