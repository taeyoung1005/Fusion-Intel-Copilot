import { QrCode, Smartphone, Trash2, Video } from "lucide-react"
import QRCode from "qrcode"
import { type ReactElement, useEffect, useMemo, useState } from "react"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import {
  buildMobileUplinkUrl,
  isPhoneReachableOrigin,
  loadStoredUplinkOrigin,
  resolveUplinkOrigin,
  saveStoredUplinkOrigin,
} from "./mobileUplink"

type CameraRegistryPanelProps = {
  readonly mobileCameras: readonly DynamicCameraRecord[]
  readonly selectedCameraId: string
  readonly onDeleteSelectedCamera: () => void
}

export function CameraRegistryPanel({
  mobileCameras,
  selectedCameraId,
  onDeleteSelectedCamera,
}: CameraRegistryPanelProps): ReactElement {
  const selectedIsMobileCamera = mobileCameras.some((camera) => camera.id === selectedCameraId)
  const [uplinkOverride, setUplinkOverride] = useState(loadStoredUplinkOrigin)
  const uplinkOrigin = useMemo(
    () => resolveUplinkOrigin(uplinkOverride, window.location.origin),
    [uplinkOverride],
  )
  const uplinkUrl = useMemo(() => buildMobileUplinkUrl(uplinkOrigin), [uplinkOrigin])
  const phoneReachable = isPhoneReachableOrigin(uplinkOrigin)
  const [qrDataUrl, setQrDataUrl] = useState("")

  const onChangeUplinkOverride = (value: string): void => {
    setUplinkOverride(value)
    saveStoredUplinkOrigin(value)
  }

  useEffect(() => {
    let active = true
    QRCode.toDataURL(uplinkUrl, { margin: 1, width: 148 })
      .then((dataUrl) => {
        if (active) {
          setQrDataUrl(dataUrl)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setQrDataUrl("")
          console.error(error)
        }
      })
    return () => {
      active = false
    }
  }, [uplinkUrl])

  return (
    <section className="cop-panel cop-registry-panel" aria-labelledby="cop-registry-title">
      <div className="cop-panel-head">
        <h2 id="cop-registry-title">CCTV REGISTRY</h2>
        <Video size={15} aria-hidden="true" />
      </div>
      <div className="cop-registry-actions">
        <a className="cop-button accent" href={uplinkUrl} target="_blank" rel="noreferrer">
          <Smartphone size={13} aria-hidden="true" />
          휴대폰 CCTV 연결
        </a>
        <button
          type="button"
          className="cop-button danger"
          disabled={!selectedIsMobileCamera}
          onClick={onDeleteSelectedCamera}
        >
          <Trash2 size={13} aria-hidden="true" />
          선택 CCTV 해제
        </button>
      </div>
      <div className="cop-registry-qr" aria-label="휴대폰 CCTV QR 연결">
        <div className="cop-registry-qr-code">
          {qrDataUrl.length > 0 ? (
            <img src={qrDataUrl} alt="휴대폰 CCTV 연결 QR 코드" />
          ) : (
            <QrCode size={54} aria-hidden="true" />
          )}
        </div>
        <div className="cop-registry-qr-copy">
          <strong>QR SCAN UPLINK</strong>
          <span>스마트폰으로 스캔하면 카메라 페이지가 열리고 자동 연결을 시도합니다.</span>
          {!phoneReachable && (
            <span className="cop-registry-qr-warn">
              이 주소로는 휴대폰 카메라가 열리지 않습니다. 아래에 HTTPS 터널
              주소(cloudflared/ngrok)를 입력하면 QR이 갱신됩니다.
            </span>
          )}
          <a href={uplinkUrl} target="_blank" rel="noreferrer">
            {uplinkUrl}
          </a>
        </div>
      </div>
      <label className="cop-registry-uplink">
        <span>업링크 주소 (HTTPS 터널)</span>
        <input
          type="url"
          inputMode="url"
          placeholder="https://your-tunnel.trycloudflare.com"
          value={uplinkOverride}
          aria-label="휴대폰 CCTV 업링크 주소"
          onChange={(event) => onChangeUplinkOverride(event.currentTarget.value)}
        />
      </label>
    </section>
  )
}
