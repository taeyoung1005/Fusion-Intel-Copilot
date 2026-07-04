import { CheckCircle2 } from "lucide-react"
import type { ReactElement } from "react"
import { CODEX_UPDATED, type CodexMetric } from "./copData"
import {
  type CodexSummaryRequestInput,
  codexProgressText,
  useCodexSummaryDecision,
} from "./useCodexSummaryDecision"

export {
  buildCodexSummaryContext,
  buildCodexSummaryRequestKey,
  codexProgressText,
} from "./useCodexSummaryDecision"

type CodexSummaryProps = CodexSummaryRequestInput & {
  readonly metrics: readonly CodexMetric[]
}

export function CodexSummary({
  selectedClip,
  selectedIncident,
  metrics,
  citations,
  missingContext,
  recentActivitySummary,
  telemetryFingerprint,
}: CodexSummaryProps): ReactElement {
  const state = useCodexSummaryDecision({
    selectedClip,
    selectedIncident,
    citations,
    missingContext,
    recentActivitySummary,
    ...(telemetryFingerprint === undefined ? {} : { telemetryFingerprint }),
  })

  return (
    <section id="cop-codex-panel" className="cop-panel cop-codex" aria-labelledby="cop-codex-title">
      <div className="cop-panel-head">
        <div className="cop-codex-title-stack">
          <span className="cop-codex-sub cop-codex-product-label">Fusion Intel Copilot</span>
          <h2 id="cop-codex-title">CODEX AGENT SUMMARY</h2>
        </div>
        <span className="cop-updated">Updated {CODEX_UPDATED}</span>
      </div>
      <p className="cop-codex-sub">Codex 판단</p>
      {state.kind === "ready" && (
        <p className="cop-codex-decision" aria-live="polite">
          <strong>{state.response.decision.title}</strong>: {state.response.decision.summary}
          <br />
          권고: {state.response.decision.recommendedAction}
        </p>
      )}
      {state.kind === "loading" && (
        <p className="cop-codex-decision" aria-live="polite">
          {codexProgressText(state.progress)}
        </p>
      )}
      {state.kind === "failure" && (
        <p className="cop-codex-decision" aria-live="polite">
          {state.message}
        </p>
      )}
      <ul className="cop-codex-metrics">
        {metrics.map((metric) => (
          <CodexRow key={metric.id} metric={metric} />
        ))}
      </ul>
      {state.kind === "ready" && (
        <p className="cop-codex-mode">
          {state.response.codexMode === "configured-codex-endpoint" && "서버 Codex 엔드포인트 연결"}
          {state.response.codexMode === "codex-cli" && "로컬 Codex CLI 연결"}
          {state.response.codexMode === "local-codex-adapter" && "로컬 Codex 어댑터"}
          {" · "}
          {state.response.adapterNotice}
          {state.notice !== undefined && (
            <>
              {" · "}
              {state.notice}
            </>
          )}
          {state.notice === undefined && state.progress !== undefined && (
            <>
              {" · "}
              {codexProgressText(state.progress)}
            </>
          )}
        </p>
      )}
    </section>
  )
}

function CodexRow({ metric }: { readonly metric: CodexMetric }): ReactElement {
  return (
    <li className="cop-codex-row">
      <CheckCircle2 size={13} className="cop-codex-check" aria-hidden="true" />
      <span className="cop-codex-label">
        {metric.ko} <small>({metric.en})</small>
      </span>
      {metric.bar === undefined ? (
        <Sparkline points={metric.spark} tone={metric.tone} />
      ) : (
        <span className="cop-codex-progress" aria-hidden="true">
          <span className={`tone-${metric.tone}`} style={{ width: `${metric.bar}%` }} />
        </span>
      )}
      <strong className="cop-codex-value">{metric.value}</strong>
    </li>
  )
}

function Sparkline({
  points,
  tone,
}: {
  readonly points: readonly number[]
  readonly tone: string
}): ReactElement {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 60 + 2
      const y = 16 - ((value - min) / span) * 12
      return `${index === 0 ? "M" : "L"}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
    })
    .join(" ")
  return (
    <svg className="cop-spark" viewBox="0 0 64 18" width="64" height="18" aria-hidden="true">
      <path d={path} fill="none" className={`tone-${tone}`} strokeWidth={1.4} />
    </svg>
  )
}
