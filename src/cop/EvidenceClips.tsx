import { ChevronLeft, ChevronRight, Play, ScanLine } from "lucide-react"
import {
  type CSSProperties,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { ClipPlayer } from "./ClipPlayer"
import type { EvidenceClip } from "./copData"

// Keep each clip at a legible size; the strip pages instead of shrinking clips
// to slivers when the panel is narrow (e.g. on a laptop the clips no longer cram
// into the visible width — fewer show at a comfortable size, rest page in).
const MIN_CLIP_WIDTH = 152
const STRIP_GAP = 8

type EvidenceClipsProps = {
  readonly clips: readonly EvidenceClip[]
  readonly selectedClipId: string
  readonly onSelectClip: (clipId: string) => void
}

export function EvidenceClips({
  clips,
  selectedClipId,
  onSelectClip,
}: EvidenceClipsProps): ReactElement {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [perView, setPerView] = useState(4)
  const [page, setPage] = useState(0)
  const [playingClip, setPlayingClip] = useState<EvidenceClip | null>(null)
  const total = clips.length

  // Measure the strip and derive how many clips fit at a readable width.
  useLayoutEffect(() => {
    const strip = stripRef.current
    if (strip === null) {
      return
    }
    const measure = (): void => {
      const width = strip.clientWidth
      if (width <= 0) {
        return
      }
      const fit = Math.floor((width + STRIP_GAP) / (MIN_CLIP_WIDTH + STRIP_GAP))
      setPerView(Math.max(2, Math.min(Math.max(1, total), fit)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [total])

  const pages = Math.max(1, Math.ceil(total / perView))

  // Keep the active page valid when the visible count changes.
  useEffect(() => {
    setPage((current) => Math.min(current, pages - 1))
  }, [pages])

  const goToPage = (index: number): void => {
    const clamped = Math.max(0, Math.min(pages - 1, index))
    setPage(clamped)
    const strip = stripRef.current
    if (strip === null) {
      return
    }
    const card = strip.children[clamped * perView]
    if (card instanceof HTMLElement) {
      strip.scrollTo({ left: card.offsetLeft - strip.offsetLeft, behavior: "smooth" })
    }
  }

  const goToClip = (clip: EvidenceClip, index: number): void => {
    onSelectClip(clip.id)
    const nextPage = Math.floor(index / perView)
    setPage(Math.max(0, Math.min(pages - 1, nextPage)))
    const strip = stripRef.current
    const card = strip?.children[index]
    if (strip !== null && card instanceof HTMLElement) {
      strip.scrollTo({ left: card.offsetLeft - strip.offsetLeft, behavior: "smooth" })
    }
  }

  const playClip = (clip: EvidenceClip, index: number): void => {
    goToClip(clip, index)
    setPlayingClip(clip)
  }

  const handleScroll = (): void => {
    const strip = stripRef.current
    if (strip === null) {
      return
    }
    const pageWidth = strip.clientWidth + STRIP_GAP
    if (pageWidth <= 0) {
      return
    }
    const next = Math.round(strip.scrollLeft / pageWidth)
    setPage(Math.max(0, Math.min(pages - 1, next)))
  }

  const hasPager = pages > 1
  const stripStyle = { "--clips-per-view": perView } as CSSProperties

  return (
    <section className="cop-panel cop-clips" aria-labelledby="cop-clips-title">
      <div className="cop-clips-head">
        <h2 id="cop-clips-title">
          <span className="cop-kicker">EVIDENCE CLIPS</span>
        </h2>
        <span className="cop-clips-count">{total} Clips</span>
      </div>

      {total === 0 ? (
        <div className="cop-clips-empty">
          <ScanLine size={24} aria-hidden="true" />
          <strong>탐지된 영상 증거 없음</strong>
          <span>
            휴대폰 CCTV를 연결하거나 실시간 DETR 추론을 실행하면 실제 탐지 프레임이 증거 클립으로
            여기에 수집됩니다.
          </span>
        </div>
      ) : (
        <div className={`cop-clips-body${hasPager ? "" : " no-pager"}`}>
          {hasPager && (
            <button
              type="button"
              className="cop-clips-arrow"
              aria-label="이전 클립"
              disabled={page === 0}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
          )}

          <div
            className="cop-clips-strip"
            ref={stripRef}
            onScroll={handleScroll}
            style={stripStyle}
          >
            {clips.map((clip, index) => (
              <article
                className={`cop-clip tone-${clip.tone}${
                  clip.id === selectedClipId ? " selected" : ""
                }`}
                key={clip.id}
              >
                <header className="cop-clip-head">
                  <time>{clip.time}</time>
                  <span className="cop-clip-cam">{clip.camera}</span>
                  <span className="cop-clip-dot" aria-hidden="true" />
                </header>
                <div className="cop-clip-well">
                  {clip.frameDataUrl !== null && clip.frameDataUrl !== undefined ? (
                    <img
                      className="cop-clip-frame"
                      src={clip.frameDataUrl}
                      alt={`${clip.camera} 증거 프레임`}
                    />
                  ) : (
                    <span className="cop-clip-scan" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className="cop-clip-play"
                    aria-label={`${clip.id} ${clip.camera} 클립 재생`}
                    onClick={() => playClip(clip, index)}
                  >
                    <Play size={16} aria-hidden="true" />
                  </button>
                </div>
                <footer className="cop-clip-foot">
                  <span className="cop-clip-tag">{clip.label}</span>
                  <span className="cop-clip-conf">{clip.detail}</span>
                </footer>
              </article>
            ))}
          </div>

          {hasPager && (
            <button
              type="button"
              className="cop-clips-arrow"
              aria-label="다음 클립"
              disabled={page >= pages - 1}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {hasPager && (
        <div className="cop-clips-dots" aria-label="클립 페이지">
          {clips.map((clip, index) => (
            <button
              key={clip.id}
              type="button"
              aria-current={clip.id === selectedClipId ? "true" : undefined}
              aria-label={`${clip.id} ${clip.camera} 클립 선택`}
              className={`cop-clips-dot${clip.id === selectedClipId ? " active" : ""}`}
              onClick={() => goToClip(clip, index)}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <p className="cop-clip-selection" aria-live="polite">
          선택 클립: <strong>{selectedClipId || "없음"}</strong>
        </p>
      )}

      {playingClip !== null && (
        <ClipPlayer clip={playingClip} onClose={() => setPlayingClip(null)} />
      )}
    </section>
  )
}
