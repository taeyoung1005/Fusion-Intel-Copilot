import { CheckCircle2 } from "lucide-react"
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react"
import {
  CodexAgentClientError,
  type CodexAgentDecision,
  requestCodexAgent,
} from "./codexAgentClient"
import {
  CODEX_UPDATED,
  type Citation,
  type CodexMetric,
  type EvidenceClip,
  type Incident,
  type MissingContext,
} from "./copData"

type CodexSummaryProps = {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly metrics: readonly CodexMetric[]
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly recentActivitySummary: string | undefined
}

// When there is no real evidence yet, the Codex request still needs a citation
// to validate; this stands in for the system's baseline posture packet.
const SYSTEM_POSTURE_CITATION: Citation = { id: "cite-system", label: "SYSTEM-POSTURE" }

type CodexPanelState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "success"; readonly response: CodexAgentDecision }
  | { readonly kind: "failure"; readonly message: string }

export function CodexSummary({
  selectedClip,
  selectedIncident,
  metrics,
  citations,
  missingContext,
  recentActivitySummary,
}: CodexSummaryProps): ReactElement {
  const [state, setState] = useState<CodexPanelState>({ kind: "idle" })
  const selectionScope = `${selectedIncident.id}:${selectedClip?.id ?? "no-clip"}`
  const requestVersion = useRef(0)

  const requestDecision = useCallback(async (): Promise<void> => {
    const currentRequest = requestVersion.current + 1
    requestVersion.current = currentRequest
    setState({ kind: "loading" })
    try {
      const requestCitations =
        citations.length > 0 ? citations.slice(0, 2) : [SYSTEM_POSTURE_CITATION]
      const response = await requestCodexAgent({
        incident: selectedIncident,
        citations: requestCitations,
        missingContext,
        responseOutcome: `사람 확인 게이트 대기 / ${selectedClip?.label ?? "선택 클립 없음"}`,
        ...(recentActivitySummary !== undefined ? { recentActivitySummary } : {}),
      })
      if (requestVersion.current !== currentRequest) {
        return
      }
      setState({ kind: "success", response })
    } catch (error) {
      if (requestVersion.current !== currentRequest) {
        return
      }
      if (error instanceof CodexAgentClientError) {
        setState({ kind: "failure", message: error.message })
        return
      }
      throw error
    }
  }, [selectedClip?.label, selectedIncident, citations, missingContext, recentActivitySummary])

  useEffect(() => {
    if (selectionScope.length > 0) {
      void requestDecision()
    }
  }, [requestDecision, selectionScope])

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
      {state.kind === "success" && (
        <p className="cop-codex-decision" aria-live="polite">
          <strong>{state.response.decision.title}</strong>: {state.response.decision.summary}
          <br />
          권고: {state.response.decision.recommendedAction}
        </p>
      )}
      {state.kind === "failure" && (
        <p className="cop-codex-decision error" aria-live="polite">
          {state.message}
        </p>
      )}
      <ul className="cop-codex-metrics">
        {metrics.map((metric) => (
          <CodexRow key={metric.id} metric={metric} />
        ))}
      </ul>
      {state.kind === "success" && (
        <p className="cop-codex-mode">
          {state.response.codexMode === "configured-codex-endpoint" && "서버 Codex 엔드포인트 연결"}
          {state.response.codexMode === "codex-cli" && "로컬 Codex CLI 연결"}
          {state.response.codexMode === "local-codex-adapter" && "로컬 Codex 어댑터"}
          {" · "}
          {state.response.adapterNotice}
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
