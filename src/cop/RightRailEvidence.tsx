import { AlertTriangle, ArrowRight } from "lucide-react"
import type { ReactElement } from "react"
import { type Citation, type MissingContext, RECOMMENDED_ACTION } from "./copData"

type CitationsPanelProps = {
  readonly citations: readonly Citation[]
  readonly selectedCitationId: string
  readonly cameraLabel: string
  readonly onGoToGate: () => void
  readonly onSelectCitation: (citationId: string) => void
}

export function CitationsPanel({
  citations,
  selectedCitationId,
  cameraLabel,
  onGoToGate,
  onSelectCitation,
}: CitationsPanelProps): ReactElement {
  const selectedCitation = citations.find((citation) => citation.id === selectedCitationId)

  return (
    <section className="cop-panel cop-citations" aria-labelledby="cop-citations-title">
      <div className="cop-panel-head">
        <h2 id="cop-citations-title">
          증거 인용 <small>(CITATIONS)</small>
        </h2>
      </div>
      {citations.length === 0 ? (
        <p className="cop-citation-empty">
          실측 증거 인용 없음 — 휴대폰 CCTV 프레임 또는 DETR 탐지가 수집되면 인용이 채워집니다.
        </p>
      ) : (
        <ul className="cop-citation-list">
          {citations.map((citation) => (
            <li key={citation.id}>
              <span className="cop-citation-id">
                {citation.label.startsWith("CAM-") ? cameraLabel : citation.label}
                {citation.time !== undefined && <em> ({citation.time})</em>}
              </span>
              <button
                type="button"
                className={`cop-citation-view${
                  citation.id === selectedCitationId ? " active" : ""
                }`}
                onClick={() => onSelectCitation(citation.id)}
              >
                보기
              </button>
            </li>
          ))}
        </ul>
      )}
      <CitationSelection citation={selectedCitation} cameraLabel={cameraLabel} />

      <div className="cop-action">
        <p className="cop-action-kicker">
          {RECOMMENDED_ACTION.ko} <small>({RECOMMENDED_ACTION.en})</small>
        </p>
        <p className="cop-action-headline">{RECOMMENDED_ACTION.headline}</p>
        <p className="cop-action-body">{RECOMMENDED_ACTION.body}</p>
        <button type="button" className="cop-button warn full" onClick={onGoToGate}>
          {RECOMMENDED_ACTION.cta}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

function CitationSelection({
  citation,
  cameraLabel,
}: {
  readonly citation: Citation | undefined
  readonly cameraLabel: string
}): ReactElement {
  if (citation === undefined) {
    return (
      <p className="cop-citation-selection" aria-live="polite">
        선택된 증거 인용이 없습니다.
      </p>
    )
  }

  const label = citation.label.startsWith("CAM-") ? cameraLabel : citation.label
  return (
    <p className="cop-citation-selection" aria-live="polite">
      선택 인용: <strong>{label}</strong>
      {citation.time !== undefined ? ` / ${citation.time}` : " / 시스템 로그"}
    </p>
  )
}

export function MissingContextPanel({
  items,
}: {
  readonly items: readonly MissingContext[]
}): ReactElement {
  return (
    <section className="cop-panel cop-missing" aria-labelledby="cop-missing-title">
      <div className="cop-panel-head">
        <h2 id="cop-missing-title">
          누락 맥락 <small>(MISSING CONTEXT)</small>
          <span className={`cop-count-badge${items.length > 0 ? " warn" : ""}`}>
            {items.length}
          </span>
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="cop-missing-empty">
          누락 맥락 없음 — 모든 연결 CCTV가 프레임을 업링크 중입니다.
        </p>
      ) : (
        <ul className="cop-missing-list">
          {items.map((item) => (
            <li key={item.id}>
              <AlertTriangle size={14} className="cop-missing-icon" aria-hidden="true" />
              <span className="cop-missing-cam">{item.camera}</span>
              <span className="cop-missing-reason">{item.reason}</span>
              <span className="cop-missing-since">Since {item.since}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
