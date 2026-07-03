import type { ReactElement } from "react"
import type { VisionPipelineResponse } from "./visionPipelineClient"

export function VisionPipelineResult({
  response,
  cameraLabel,
}: {
  readonly response: VisionPipelineResponse
  readonly cameraLabel: string
}): ReactElement {
  const activeTrack = response.tracks.find((track) => track.status === "active_track")
  const semanticEvents = response.semanticEvents ?? []
  const displayText = (text: string): string => text.replaceAll(/CAM-[A-Z0-9-]+/g, cameraLabel)
  return (
    <div className="cop-vision-result" aria-live="polite">
      <dl className="cop-vision-grid">
        <div>
          <dt>CV PROVIDER</dt>
          <dd>{response.provider}</dd>
        </div>
        <div>
          <dt>DETECTIONS</dt>
          <dd>탐지 {response.detections.length}건</dd>
        </div>
        <div>
          <dt>TRACK</dt>
          <dd>{activeTrack?.status ?? response.tracks[0]?.status ?? "candidate"}</dd>
        </div>
        <div>
          <dt>RISK</dt>
          <dd>{response.situationAnalysisAgent.riskLevel}</dd>
        </div>
      </dl>
      <div className="cop-vision-agent">
        <strong>시각 분석 에이전트</strong>
        <span>{response.visualAnalysisAgent.status}</span>
        <p>{displayText(response.visualAnalysisAgent.summary)}</p>
      </div>
      <div className="cop-vision-agent">
        <strong>상황 분석 에이전트</strong>
        <span>{response.situationAnalysisAgent.riskLevel}</span>
        <p>{displayText(response.situationAnalysisAgent.summary)}</p>
      </div>
      {semanticEvents.length > 0 && (
        <div className="cop-vision-agent">
          <strong>시맨틱 추출</strong>
          <span>{semanticEvents.length}건</span>
          {semanticEvents.slice(0, 3).map((event) => (
            <p key={event.id}>
              {event.subjectLabel} / {event.action} / {event.direction} / {event.distanceTrend}
            </p>
          ))}
        </div>
      )}
      <p className="cop-vision-safe">
        사람 검토용 증거 번들 준비. 자동 결론 없이 인접 CCTV와 원본 프레임 확인을 유지합니다.
      </p>
    </div>
  )
}
