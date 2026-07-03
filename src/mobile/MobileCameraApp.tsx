import { Camera, Radio, Smartphone } from "lucide-react"
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react"
import {
  type MobileCameraSnapshot,
  registerMobileCamera,
  sendMobileFrame,
} from "../cop/mobileCameraClient"

const DEFAULT_LABEL = "휴대폰 CCTV"
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }]

type SignalMessage = {
  readonly type: string
  readonly viewerId?: string
  readonly payload?: unknown
}

export function MobileCameraApp(): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const autoStartAttemptedRef = useRef(false)
  const signalSocketRef = useRef<WebSocket | null>(null)
  const viewerPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const [label, setLabel] = useState(DEFAULT_LABEL)
  const [camera, setCamera] = useState<MobileCameraSnapshot | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState("대기 중")
  const [busy, setBusy] = useState(false)
  const canRequestCamera =
    window.isSecureContext && navigator.mediaDevices?.getUserMedia !== undefined

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (video === null || canvas === null || video.videoWidth === 0 || video.videoHeight === 0) {
      return null
    }
    canvas.width = 480
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * canvas.width)
    const context = canvas.getContext("2d")
    if (context === null) {
      return null
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.62)
  }, [])

  const sendCapturedFrame = useCallback(
    async (cameraId: string): Promise<void> => {
      const frame = captureFrame()
      if (frame === null) {
        return
      }
      try {
        const updated = await sendMobileFrame(cameraId, frame)
        setCamera(updated)
        setStatus(`${updated.id} 프레임 ${updated.frameCount}건`)
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : "프레임 업링크 실패")
      }
    },
    [captureFrame],
  )

  const ensureRegistered = useCallback(async (): Promise<MobileCameraSnapshot> => {
    if (camera !== null) {
      return camera
    }
    const registered = await registerMobileCamera(label.trim() || DEFAULT_LABEL)
    setCamera(registered)
    setStatus(`${registered.id} 등록 완료`)
    return registered
  }, [camera, label])

  const closeSignaling = useCallback((): void => {
    for (const peer of viewerPeersRef.current.values()) {
      peer.close()
    }
    viewerPeersRef.current.clear()
    signalSocketRef.current?.close()
    signalSocketRef.current = null
  }, [])

  const connectSignaling = useCallback((cameraId: string, mediaStream: MediaStream): void => {
    const wsOrigin = window.location.origin.replace(/^http/, "ws")
    const socket = new WebSocket(
      `${wsOrigin}/api/mobile-signal?cameraId=${encodeURIComponent(cameraId)}&role=phone`,
    )
    signalSocketRef.current = socket

    const createPeerForViewer = (viewerId: string): RTCPeerConnection => {
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      for (const track of mediaStream.getTracks()) {
        peer.addTrack(track, mediaStream)
      }
      peer.onicecandidate = (event) => {
        if (event.candidate !== null) {
          socket.send(JSON.stringify({ type: "ice-candidate", viewerId, payload: event.candidate }))
        }
      }
      viewerPeersRef.current.set(viewerId, peer)
      return peer
    }

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      const message = parseSignalMessage(event.data)
      if (message === null) {
        return
      }
      if (message.type === "viewer-joined" && message.viewerId !== undefined) {
        const peer = createPeerForViewer(message.viewerId)
        void peer
          .createOffer()
          .then((offer) => peer.setLocalDescription(offer))
          .then(() => {
            socket.send(
              JSON.stringify({
                type: "offer",
                viewerId: message.viewerId,
                payload: peer.localDescription,
              }),
            )
          })
        return
      }
      if (message.type === "answer" && message.viewerId !== undefined) {
        const peer = viewerPeersRef.current.get(message.viewerId)
        void peer?.setRemoteDescription(message.payload as RTCSessionDescriptionInit)
        return
      }
      if (message.type === "ice-candidate" && message.viewerId !== undefined) {
        const peer = viewerPeersRef.current.get(message.viewerId)
        void peer?.addIceCandidate(message.payload as RTCIceCandidateInit)
        return
      }
      if (message.type === "viewer-left" && message.viewerId !== undefined) {
        viewerPeersRef.current.get(message.viewerId)?.close()
        viewerPeersRef.current.delete(message.viewerId)
      }
    })
  }, [])

  const startCamera = useCallback(async (): Promise<void> => {
    setBusy(true)
    setStatus("모바일 CCTV 연결 중")
    try {
      if (navigator.mediaDevices?.getUserMedia === undefined) {
        setStatus("카메라 차단: HTTPS 주소 또는 localhost에서 다시 열어야 합니다.")
        return
      }
      const registered = await ensureRegistered()
      setStatus(`${registered.id} 카메라 권한 요청 중`)
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      })
      setStream(mediaStream)
      const video = videoRef.current
      if (video !== null) {
        video.srcObject = mediaStream
        await video.play()
      }
      void sendCapturedFrame(registered.id)
      closeSignaling()
      connectSignaling(registered.id, mediaStream)
      setStatus(`${registered.id} 실시간 업링크 중`)
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "카메라 시작 실패")
    } finally {
      setBusy(false)
    }
  }, [ensureRegistered, sendCapturedFrame, closeSignaling, connectSignaling])

  useEffect(() => {
    if (stream === null || camera === null) {
      return
    }
    const intervalId = window.setInterval(() => {
      void sendCapturedFrame(camera.id)
    }, 1_200)
    return () => window.clearInterval(intervalId)
  }, [stream, camera, sendCapturedFrame])

  useEffect(
    () => () => {
      for (const track of stream?.getTracks() ?? []) {
        track.stop()
      }
      closeSignaling()
    },
    [stream, closeSignaling],
  )

  const secureHint = window.isSecureContext
    ? "보안 컨텍스트 확인"
    : "휴대폰 실카메라는 HTTPS 또는 localhost에서만 권한이 열립니다."
  const autoStartRequested = new URLSearchParams(window.location.search).get("autostart") === "1"

  useEffect(() => {
    if (!autoStartRequested || autoStartAttemptedRef.current) {
      return
    }
    autoStartAttemptedRef.current = true
    setStatus("QR 자동 연결 시작")
    void startCamera()
  }, [autoStartRequested, startCamera])

  return (
    <main className="mobile-cctv-shell">
      <section className="mobile-cctv-panel" aria-labelledby="mobile-cctv-title">
        <div className="mobile-cctv-head">
          <Smartphone size={22} aria-hidden="true" />
          <div>
            <p>MOBILE SENSOR NODE</p>
            <h1 id="mobile-cctv-title">MOBILE CCTV UPLINK</h1>
          </div>
        </div>
        <label className="mobile-cctv-label">
          CCTV 표시명
          <input value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
        </label>
        <div className="mobile-cctv-video">
          <video ref={videoRef} muted playsInline aria-label="휴대폰 CCTV 미리보기" />
          <canvas ref={canvasRef} />
          {!canRequestCamera && (
            <div className="mobile-cctv-blocker" role="alert">
              <strong>카메라 권한 차단</strong>
              <span>
                현재 주소는 보안 컨텍스트가 아닙니다. HTTPS 터널 주소로 QR을 다시 열어주세요.
              </span>
            </div>
          )}
        </div>
        <div className="mobile-cctv-actions">
          <button type="button" className="cop-button accent" disabled={busy} onClick={startCamera}>
            <Camera size={14} aria-hidden="true" />
            {busy ? "연결 중" : "카메라 시작"}
          </button>
        </div>
        <dl className="mobile-cctv-status">
          <div>
            <dt>노드</dt>
            <dd>{camera?.id ?? "미등록"}</dd>
          </div>
          <div>
            <dt>프레임</dt>
            <dd>프레임 {camera?.frameCount ?? 0}건</dd>
          </div>
          <div>
            <dt>상태</dt>
            <dd>{status}</dd>
          </div>
        </dl>
        <p className="mobile-cctv-hint">
          <Radio size={13} aria-hidden="true" />
          {autoStartRequested ? "QR 자동 연결 모드 · " : ""}
          {secureHint}
        </p>
      </section>
    </main>
  )
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
