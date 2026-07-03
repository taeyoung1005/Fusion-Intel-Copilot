import { CheckCircle2, FileDown, FileText } from "lucide-react"
import { type ReactElement, useEffect, useState } from "react"
import { DAILY_REPORT, type EvidenceClip, type Incident, type ResponseGate } from "./copData"
import type { DailyReportRow } from "./operationalTelemetry"

const todayStamp = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function ResponseGatePanel({
  selectedIncident,
  gates,
}: {
  readonly selectedIncident: Incident
  readonly gates: readonly ResponseGate[]
}): ReactElement {
  // The operator confirms the incident as a whole; each step already shows PASS
  // when the real evidence satisfies it, PENDING until confirmed otherwise.
  const [confirmed, setConfirmed] = useState(false)
  const [decision, setDecision] = useState<string | null>(null)
  const incidentScope = selectedIncident.id

  useEffect(() => {
    if (incidentScope.length > 0) {
      setConfirmed(false)
      setDecision(null)
    }
  }, [incidentScope])

  const statusOf = (gate: ResponseGate): "PASS" | "PENDING" =>
    confirmed || gate.initial === "PASS" ? "PASS" : "PENDING"

  const confirmAll = (): void => {
    setConfirmed(true)
    setDecision(`검토 및 확인 완료: ${selectedIncident.zone} 모든 게이트 PASS 기록`)
  }
  const escalate = (): void => {
    setDecision(`에스컬레이션 기록: ${selectedIncident.zone} 감독자 검토로 상신`)
  }

  return (
    <section id="cop-gate" className="cop-panel cop-gate" aria-labelledby="cop-gate-title">
      <div className="cop-panel-head">
        <h2 id="cop-gate-title">
          사람 확인 게이트 <small>(RESPONSE GATE STATUS)</small>
        </h2>
      </div>
      <ul className="cop-gate-list">
        {gates.map((gate) => {
          const status = statusOf(gate)
          return (
            <li key={gate.id} className={`cop-gate-row status-${status.toLowerCase()}`}>
              <CheckCircle2 size={14} aria-hidden="true" />
              <span className="cop-gate-label">{gate.label}</span>
              <span className={`cop-gate-status ${status.toLowerCase()}`}>{status}</span>
            </li>
          )
        })}
      </ul>
      <div className="cop-gate-actions">
        <button type="button" className="cop-button ok" onClick={confirmAll}>
          검토 및 확인
        </button>
        <button type="button" className="cop-button danger" onClick={escalate}>
          에스컬레이션
        </button>
      </div>
      {decision !== null && (
        <p className="cop-gate-decision" aria-live="polite">
          {decision}
        </p>
      )}
    </section>
  )
}

export function DailyReportPanel({
  selectedClip,
  selectedIncident,
  cameraLabel,
  reportRows,
  reportPeriod,
}: {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly cameraLabel: string
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
}): ReactElement {
  const [receipt, setReceipt] = useState<string | null>(null)
  const reportScope = `${selectedIncident.id}:${selectedClip?.id ?? "no-clip"}`

  useEffect(() => {
    if (reportScope.length > 0) {
      setReceipt(null)
    }
  }, [reportScope])

  return (
    <section
      id="cop-report-panel"
      className="cop-panel cop-report"
      aria-labelledby="cop-report-title"
    >
      <div className="cop-panel-head">
        <h2 id="cop-report-title">
          일일 보고 미리보기 <small>(DAILY REPORT PREVIEW)</small>
        </h2>
      </div>
      <div className="cop-report-card">
        <div className="cop-report-body">
          <p className="cop-report-name">{DAILY_REPORT.title}</p>
          <p className="cop-report-sub">{DAILY_REPORT.subtitle}</p>
          <dl className="cop-report-meta">
            <div>
              <dt>DATE</dt>
              <dd>{todayStamp()}</dd>
            </div>
            <div>
              <dt>PERIOD</dt>
              <dd>{reportPeriod}</dd>
            </div>
            {reportRows.map((row) => (
              <div key={row.id}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="cop-report-thumb" aria-hidden="true">
          <svg
            viewBox="0 0 120 90"
            width="100%"
            height="100%"
            role="img"
            aria-label="일일 보고 미니 지도"
          >
            <title>일일 보고 미니 지도</title>
            <rect x={0} y={0} width={120} height={90} fill="#06131c" />
            <ellipse
              cx={60}
              cy={45}
              rx={40}
              ry={26}
              fill="none"
              stroke="rgba(89,215,255,0.5)"
              strokeWidth={1}
            />
            {[18, 40, 60, 80, 102].map((x) => (
              <circle key={x} cx={x} cy={45 + (x % 3) * 4 - 6} r={2} fill="#59d7ff" />
            ))}
            <rect
              x={48}
              y={36}
              width={24}
              height={18}
              fill="rgba(89,215,255,0.18)"
              stroke="rgba(89,215,255,0.4)"
            />
          </svg>
        </div>
      </div>
      <div className="cop-report-actions">
        <button
          type="button"
          className="cop-button"
          onClick={() =>
            setReceipt(
              `PDF 미리보기 생성: RPT-2025-05-20-PREVIEW / ${selectedIncident.id} / ${
                selectedClip === undefined ? "선택 클립 없음" : cameraLabel
              }`,
            )
          }
        >
          <FileText size={14} aria-hidden="true" />
          PDF 미리보기
        </button>
        <button
          type="button"
          className="cop-button accent"
          onClick={() =>
            setReceipt(`보고서 내보내기 영수증: EXP-2025-05-20-001 / ${selectedIncident.id}`)
          }
        >
          <FileDown size={14} aria-hidden="true" />
          보고서 내보내기
        </button>
      </div>
      {receipt !== null && (
        <p className="cop-report-receipt" aria-live="polite">
          {receipt}
        </p>
      )}
    </section>
  )
}
