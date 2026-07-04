import { CheckCircle2, FileDown, FileText } from "lucide-react"
import { type ReactElement, useEffect, useMemo, useState } from "react"
import {
  type Citation,
  DAILY_REPORT,
  type EvidenceClip,
  type Incident,
  type MissingContext,
  type ResponseGate,
} from "./copData"
import type { DailyReportRow } from "./operationalTelemetry"
import {
  RESPONSE_ACTION_BY_TONE,
  type ResponseAction,
  type TakenResponseAction,
  responseActionReportRow,
} from "./responseActionCatalog"
import { useReportArtifactActions } from "./useReportArtifactActions"

export function ResponseGatePanel({
  selectedIncident,
  gates,
  takenResponseAction,
  onRecordResponseAction,
}: {
  readonly selectedIncident: Incident
  readonly gates: readonly ResponseGate[]
  readonly takenResponseAction: TakenResponseAction | undefined
  readonly onRecordResponseAction: (action: ResponseAction) => void
}): ReactElement {
  // The operator confirms the incident as a whole; each step already shows PASS
  // when the real evidence satisfies it, PENDING until confirmed otherwise.
  const [confirmed, setConfirmed] = useState(false)
  const incidentScope = selectedIncident.id

  useEffect(() => {
    if (incidentScope.length > 0) {
      setConfirmed(false)
    }
  }, [incidentScope])

  const statusOf = (gate: ResponseGate): "PASS" | "PENDING" =>
    confirmed || gate.initial === "PASS" ? "PASS" : "PENDING"

  const confirmAll = (): void => {
    setConfirmed(true)
  }

  const catalogAction = RESPONSE_ACTION_BY_TONE[selectedIncident.tone]
  const showDispatchButton = catalogAction.kind === "manual" && takenResponseAction === undefined

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
        {showDispatchButton && (
          <button
            type="button"
            className="cop-button danger"
            onClick={() => onRecordResponseAction(catalogAction)}
          >
            {catalogAction.label}
          </button>
        )}
      </div>
      {confirmed && (
        <p className="cop-gate-decision" aria-live="polite">
          검토 및 확인 완료: {selectedIncident.zone} 모든 게이트 PASS 기록
        </p>
      )}
      {catalogAction.kind === "auto" && (
        <p className="cop-gate-decision" aria-live="polite">
          {catalogAction.label}
        </p>
      )}
      {takenResponseAction !== undefined && (
        <p className="cop-gate-decision" aria-live="polite">
          조치 완료: {takenResponseAction.label}
        </p>
      )}
    </section>
  )
}

export function DailyReportPanel({
  selectedClip,
  selectedIncident,
  cameraLabel,
  evidenceClips,
  citations,
  missingContext,
  responseGates,
  takenResponseAction,
  reportRows,
  reportPeriod,
}: {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly cameraLabel: string
  readonly evidenceClips: readonly EvidenceClip[]
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly responseGates: readonly ResponseGate[]
  readonly takenResponseAction: TakenResponseAction | undefined
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
}): ReactElement {
  const rows = useMemo(
    () => [...reportRows, responseActionReportRow(takenResponseAction)],
    [reportRows, takenResponseAction],
  )

  const { actionState, artifact, createPdfPreview, exportReport } = useReportArtifactActions({
    selectedIncident,
    selectedClip,
    evidenceClips,
    citations,
    missingContext,
    responseGates,
    reportRows: rows,
    reportPeriod,
    cameraLabel,
  })
  const receiptText =
    actionState.kind === "idle"
      ? null
      : actionState.kind === "exported" || actionState.kind === "pdf"
        ? `${actionState.message} / ${actionState.fileName} / ${actionState.sizeBytes} bytes`
        : actionState.message
  const isPdfLoading = actionState.kind === "pdf-loading"

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
              <dd>{artifact.date}</dd>
            </div>
            <div>
              <dt>REPORT ID</dt>
              <dd>{artifact.reportId}</dd>
            </div>
            <div>
              <dt>INCIDENT</dt>
              <dd>{selectedIncident.id}</dd>
            </div>
            <div>
              <dt>PERIOD</dt>
              <dd>{reportPeriod}</dd>
            </div>
            {rows.map((row) => (
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
            <rect x={0} y={0} width={120} height={90} fill="var(--surface-inset)" />
            <ellipse
              cx={60}
              cy={45}
              rx={40}
              ry={26}
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth={1}
            />
            {[18, 40, 60, 80, 102].map((x) => (
              <circle key={x} cx={x} cy={45 + (x % 3) * 4 - 6} r={2} fill="var(--accent-primary)" />
            ))}
            <rect
              x={48}
              y={36}
              width={24}
              height={18}
              fill="var(--map-cone)"
              stroke="var(--accent-primary)"
            />
          </svg>
        </div>
      </div>
      <div className="cop-report-actions">
        <button
          type="button"
          className="cop-button"
          onClick={() => {
            void createPdfPreview()
          }}
          disabled={isPdfLoading}
          aria-busy={isPdfLoading}
        >
          <FileText size={14} aria-hidden="true" />
          {isPdfLoading ? "PDF 생성 중" : "PDF 미리보기"}
        </button>
        <button type="button" className="cop-button accent" onClick={exportReport}>
          <FileDown size={14} aria-hidden="true" />
          보고서 내보내기
        </button>
      </div>
      {receiptText !== null && (
        <p
          className={`cop-report-receipt ${actionState.kind === "pdf-error" ? "is-error" : ""}`}
          aria-live="polite"
        >
          {receiptText}
        </p>
      )}
      {actionState.kind === "pdf" && (
        <div className="cop-report-pdf-shell">
          <iframe
            className="cop-report-pdf-preview"
            src={actionState.url}
            title={`${artifact.reportId} PDF 미리보기`}
          />
          <a className="cop-report-pdf-link" href={actionState.url} download={actionState.fileName}>
            PDF 파일 저장
          </a>
        </div>
      )}
    </section>
  )
}
