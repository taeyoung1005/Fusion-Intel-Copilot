import { Pause, Play, X } from "lucide-react"
import { type ReactElement, useEffect, useRef, useState } from "react"
import type { EvidenceClip } from "./copData"

const CLIP_WIDTH = 640
const CLIP_HEIGHT = 360
const LOOP_MS = 6000

type ClipPlayerProps = {
  readonly clip: EvidenceClip
  readonly onClose: () => void
}

// Plays back an evidence clip. When the clip carries a real captured frame (live
// mobile uplink or a DETR detection frame) it shows that frame with a moving scan
// overlay; otherwise it renders a deterministic synthetic reconstruction. Either
// way it is real, controllable playback — not a static thumbnail.
export function ClipPlayer({ clip, onClose }: ClipPlayerProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | undefined>(undefined)
  const startRef = useRef<number | undefined>(undefined)
  const pausedAtRef = useRef(0)
  const [playing, setPlaying] = useState(true)
  const [progress, setProgress] = useState(0)
  const hasFrame = clip.frameDataUrl !== null && clip.frameDataUrl !== undefined

  useEffect(() => {
    if (hasFrame) {
      // The frame is rendered as an <img>; only drive the progress/scan transport.
      const tick = (timestamp: number): void => {
        if (startRef.current === undefined) {
          startRef.current = timestamp - pausedAtRef.current
        }
        const elapsed = (timestamp - startRef.current) % LOOP_MS
        pausedAtRef.current = elapsed
        setProgress(elapsed / LOOP_MS)
        rafRef.current = window.requestAnimationFrame(tick)
      }
      if (playing) {
        startRef.current = undefined
        rafRef.current = window.requestAnimationFrame(tick)
      }
      return () => {
        if (rafRef.current !== undefined) {
          window.cancelAnimationFrame(rafRef.current)
        }
      }
    }

    const canvas = canvasRef.current
    const context = canvas?.getContext("2d") ?? null
    if (canvas === null || context === null) {
      return
    }
    const render = (timestamp: number): void => {
      if (startRef.current === undefined) {
        startRef.current = timestamp - pausedAtRef.current
      }
      const elapsed = (timestamp - startRef.current) % LOOP_MS
      pausedAtRef.current = elapsed
      drawSyntheticClip(context, clip, elapsed / LOOP_MS)
      setProgress(elapsed / LOOP_MS)
      rafRef.current = window.requestAnimationFrame(render)
    }
    if (playing) {
      startRef.current = undefined
      rafRef.current = window.requestAnimationFrame(render)
    } else {
      drawSyntheticClip(context, clip, pausedAtRef.current / LOOP_MS)
    }
    return () => {
      if (rafRef.current !== undefined) {
        window.cancelAnimationFrame(rafRef.current)
      }
    }
  }, [clip, playing, hasFrame])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop close is mirrored by the Esc handler and the close button.
    <div
      className="cop-clip-player-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className={`cop-clip-player tone-${clip.tone}`}
        // biome-ignore lint/a11y/useSemanticElements: custom in-app overlay with its own Esc/backdrop handling, not a native <dialog>.
        role="dialog"
        aria-modal="true"
        aria-label={`${clip.id} ${clip.label} 재생`}
      >
        <header className="cop-clip-player-head">
          <div>
            <strong>{clip.label}</strong>
            <span>
              {clip.camera} · {clip.time} · {clip.detail}
            </span>
          </div>
          <button type="button" className="cop-icon-btn" aria-label="재생 닫기" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </button>
        </header>

        <div className="cop-clip-player-stage">
          {hasFrame ? (
            <div className="cop-clip-player-frame">
              <img src={clip.frameDataUrl ?? ""} alt={`${clip.id} 캡처 증거 프레임`} />
              <span
                className="cop-clip-player-scan"
                style={{ top: `${Math.round(progress * 100)}%` }}
                aria-hidden="true"
              />
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              width={CLIP_WIDTH}
              height={CLIP_HEIGHT}
              aria-label={`${clip.id} 합성 CCTV 재생 화면`}
            />
          )}
          <span className={`cop-clip-player-rec${playing ? " live" : ""}`}>
            {playing ? "● REC" : "❚❚ PAUSE"}
          </span>
        </div>

        <div className="cop-clip-player-transport">
          <button
            type="button"
            className="cop-button accent"
            aria-label={playing ? "일시정지" : "재생"}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? (
              <Pause size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
            {playing ? "일시정지" : "재생"}
          </button>
          <div className="cop-clip-player-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      </section>
    </div>
  )
}

function drawSyntheticClip(
  context: CanvasRenderingContext2D,
  clip: EvidenceClip,
  phase: number,
): void {
  const styles = getComputedStyle(document.documentElement)
  const inset = styles.getPropertyValue("--surface-inset").trim() || "#081012"
  const grid = styles.getPropertyValue("--map-grid-line").trim() || "rgba(79,179,191,0.08)"
  const toneColor =
    {
      normal: "#36d399",
      watch: "#f4c430",
      alert: "#f87171",
      confirmed: "#59d7ff",
      uncertain: "#94a3b8",
    }[clip.tone] ?? "#94a3b8"

  context.fillStyle = inset
  context.fillRect(0, 0, CLIP_WIDTH, CLIP_HEIGHT)

  context.strokeStyle = grid
  context.lineWidth = 1
  for (let x = 0; x <= CLIP_WIDTH; x += 48) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, CLIP_HEIGHT)
    context.stroke()
  }
  for (let y = 0; y <= CLIP_HEIGHT; y += 48) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(CLIP_WIDTH, y)
    context.stroke()
  }

  const subjectX = 70 + phase * (CLIP_WIDTH - 180)
  const bob = Math.sin(phase * Math.PI * 6) * 4
  context.fillStyle = styles.getPropertyValue("--text-secondary").trim() || "#aab7bc"
  context.fillRect(subjectX, 150 + bob, 44, 150)
  context.fillStyle = toneColor
  context.fillRect(subjectX + 8, 120 + bob, 28, 28)

  context.strokeStyle = toneColor
  context.lineWidth = 2
  context.strokeRect(subjectX - 12, 108 + bob, 70, 204)
  context.font = "12px monospace"
  context.fillStyle = toneColor
  context.fillText(`${clip.label} ${clip.detail}`, subjectX - 12, 102 + bob)

  const scanY = (phase * CLIP_HEIGHT * 2) % CLIP_HEIGHT
  context.fillStyle = "rgba(89,215,255,0.10)"
  context.fillRect(0, scanY, CLIP_WIDTH, 2)
}
