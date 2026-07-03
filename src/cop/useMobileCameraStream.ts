import { useEffect, useRef, useState } from "react"

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }]

type SignalMessage = {
  readonly type: string
  readonly viewerId?: string
  readonly payload?: unknown
}

type MobileCameraStream = {
  readonly stream: MediaStream | null
  readonly live: boolean
}

/**
 * Subscribes to a phone's WebRTC uplink as a viewer. Falls back to the
 * caller's own static thumbnail while no peer connection is live yet.
 */
export const useMobileCameraStream = (cameraId: string): MobileCameraStream => {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)

  useEffect(() => {
    setStream(null)
    const wsOrigin = window.location.origin.replace(/^http/, "ws")
    const socket = new WebSocket(
      `${wsOrigin}/api/mobile-signal?cameraId=${encodeURIComponent(cameraId)}&role=viewer`,
    )
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peerRef.current = peer

    peer.ontrack = (event) => {
      setStream(event.streams[0] ?? null)
    }
    peer.onicecandidate = (event) => {
      if (event.candidate !== null) {
        socket.send(JSON.stringify({ type: "ice-candidate", payload: event.candidate }))
      }
    }

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      const message = parseSignalMessage(event.data)
      if (message === null) {
        return
      }
      if (message.type === "offer") {
        void peer
          .setRemoteDescription(message.payload as RTCSessionDescriptionInit)
          .then(() => peer.createAnswer())
          .then((answer) => peer.setLocalDescription(answer))
          .then(() => {
            socket.send(JSON.stringify({ type: "answer", payload: peer.localDescription }))
          })
        return
      }
      if (message.type === "ice-candidate") {
        void peer.addIceCandidate(message.payload as RTCIceCandidateInit)
        return
      }
      if (message.type === "phone-left") {
        setStream(null)
      }
    })

    return () => {
      socket.close()
      peer.close()
      peerRef.current = null
      setStream(null)
    }
  }, [cameraId])

  return { stream, live: stream !== null }
}

const parseSignalMessage = (raw: string): SignalMessage | null => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof (parsed as { type: unknown }).type === "string"
    ) {
      return parsed as SignalMessage
    }
    return null
  } catch {
    return null
  }
}
