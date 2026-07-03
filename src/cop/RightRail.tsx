import type { ReactElement } from "react"
import { CodexSummary } from "./RightRailCodex"
import { CitationsPanel, MissingContextPanel } from "./RightRailEvidence"
import { ActiveIncidents } from "./RightRailIncidents"
import { DailyReportPanel, ResponseGatePanel } from "./RightRailResponseReport"
import { VisionPipelinePanel } from "./VisionPipelinePanel"
import type {
  Citation,
  CodexMetric,
  EvidenceClip,
  Incident,
  MissingContext,
  ResponseGate,
} from "./copData"
import type { DailyReportRow } from "./operationalTelemetry"

type RightRailProps = {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly incidents: readonly Incident[]
  readonly citations: readonly Citation[]
  readonly codexMetrics: readonly CodexMetric[]
  readonly missingContext: readonly MissingContext[]
  readonly responseGates: readonly ResponseGate[]
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
  readonly cameraLabel: string
  readonly selectedCitationId: string
  readonly recentActivitySummary: string | undefined
  readonly onSelectCitation: (citationId: string) => void
  readonly onSelectIncident: (incidentId: string) => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
}

export function RightRail({
  selectedClip,
  selectedIncident,
  incidents,
  citations,
  codexMetrics,
  missingContext,
  responseGates,
  reportRows,
  reportPeriod,
  cameraLabel,
  selectedCitationId,
  recentActivitySummary,
  onSelectCitation,
  onSelectIncident,
  onVisionEvidence,
}: RightRailProps): ReactElement {
  const scrollToGate = (): void => {
    document.getElementById("cop-gate")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <aside className="cop-right" aria-label="운용자 명령 패널">
      <ActiveIncidents
        incidents={incidents}
        selectedIncidentId={selectedIncident.id}
        cameraLabel={cameraLabel}
        onSelectIncident={onSelectIncident}
      />
      <VisionPipelinePanel cameraLabel={cameraLabel} onVisionEvidence={onVisionEvidence} />
      <CodexSummary
        selectedClip={selectedClip}
        selectedIncident={selectedIncident}
        metrics={codexMetrics}
        citations={citations}
        missingContext={missingContext}
        recentActivitySummary={recentActivitySummary}
      />
      <CitationsPanel
        citations={citations}
        selectedCitationId={selectedCitationId}
        cameraLabel={cameraLabel}
        onGoToGate={scrollToGate}
        onSelectCitation={onSelectCitation}
      />
      <MissingContextPanel items={missingContext} />
      <ResponseGatePanel selectedIncident={selectedIncident} gates={responseGates} />
      <DailyReportPanel
        selectedClip={selectedClip}
        selectedIncident={selectedIncident}
        cameraLabel={cameraLabel}
        reportRows={reportRows}
        reportPeriod={reportPeriod}
      />
    </aside>
  )
}
