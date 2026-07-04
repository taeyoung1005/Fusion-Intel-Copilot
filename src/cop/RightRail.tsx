import { type ReactElement, memo, useCallback, useMemo } from "react"
import { ActivityStreamPanel } from "./ActivityStreamPanel"
import { OperationalMetricTiles } from "./OperationalMetricTilesPanel"
import { CodexSummary } from "./RightRailCodex"
import { CitationsPanel, MissingContextPanel } from "./RightRailEvidence"
import { ActiveIncidents } from "./RightRailIncidents"
import { RelationshipGraphPanel } from "./RightRailRelationshipGraph"
import { DailyReportPanel, ResponseGatePanel } from "./RightRailResponseReport"
import type {
  Citation,
  CodexMetric,
  EvidenceClip,
  Incident,
  MissingContext,
  ResponseGate,
} from "./copData"
import type {
  DailyReportRow,
  EvidenceRelationshipGraph,
  OperationalMetricTile,
  RelationshipGraphNode,
} from "./operationalTelemetry"
import { buildRecommendedAction } from "./operationalTelemetry"

type RightRailProps = {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly evidenceClips: readonly EvidenceClip[]
  readonly incidents: readonly Incident[]
  readonly citations: readonly Citation[]
  readonly codexMetrics: readonly CodexMetric[]
  readonly operationalMetrics: readonly OperationalMetricTile[]
  readonly missingContext: readonly MissingContext[]
  readonly responseGates: readonly ResponseGate[]
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
  readonly cameraLabel: string
  readonly selectedCameraId: string
  readonly selectedClipId: string
  readonly selectedCitationId: string
  readonly relationshipGraph: EvidenceRelationshipGraph
  readonly codexRequestFingerprint: string
  readonly recentActivitySummary: string | undefined
  readonly onSelectCitation: (citationId: string) => void
  readonly onSelectIncident: (incidentId: string) => void
  readonly onSelectRelationshipNode: (node: RelationshipGraphNode) => void
}

export const RightRail = memo(function RightRail({
  selectedClip,
  selectedIncident,
  evidenceClips,
  incidents,
  citations,
  codexMetrics,
  operationalMetrics,
  missingContext,
  responseGates,
  reportRows,
  reportPeriod,
  cameraLabel,
  selectedCameraId,
  selectedClipId,
  selectedCitationId,
  relationshipGraph,
  codexRequestFingerprint,
  recentActivitySummary,
  onSelectCitation,
  onSelectIncident,
  onSelectRelationshipNode,
}: RightRailProps): ReactElement {
  const scrollToGate = useCallback((): void => {
    document.getElementById("cop-gate")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])
  const recommendedAction = useMemo(
    () => buildRecommendedAction(selectedIncident, missingContext, responseGates),
    [selectedIncident, missingContext, responseGates],
  )

  return (
    <aside className="cop-right" aria-label="운용자 명령 패널">
      <OperationalMetricTiles metrics={operationalMetrics} />
      <ActivityStreamPanel />
      <ActiveIncidents
        incidents={incidents}
        selectedIncidentId={selectedIncident.id}
        cameraLabel={cameraLabel}
        onSelectIncident={onSelectIncident}
      />
      <RelationshipGraphPanel
        graph={relationshipGraph}
        selectedIncidentId={selectedIncident.id}
        selectedCameraId={selectedCameraId}
        selectedClipId={selectedClipId}
        selectedCitationId={selectedCitationId}
        onSelectNode={onSelectRelationshipNode}
      />
      <CodexSummary
        selectedClip={selectedClip}
        selectedIncident={selectedIncident}
        metrics={codexMetrics}
        citations={citations}
        missingContext={missingContext}
        telemetryFingerprint={codexRequestFingerprint}
        recentActivitySummary={recentActivitySummary}
      />
      <CitationsPanel
        citations={citations}
        selectedCitationId={selectedCitationId}
        cameraLabel={cameraLabel}
        recommendedAction={recommendedAction}
        onGoToGate={scrollToGate}
        onSelectCitation={onSelectCitation}
      />
      <MissingContextPanel items={missingContext} />
      <ResponseGatePanel selectedIncident={selectedIncident} gates={responseGates} />
      <DailyReportPanel
        selectedClip={selectedClip}
        selectedIncident={selectedIncident}
        cameraLabel={cameraLabel}
        evidenceClips={evidenceClips}
        citations={citations}
        missingContext={missingContext}
        responseGates={responseGates}
        reportRows={reportRows}
        reportPeriod={reportPeriod}
      />
    </aside>
  )
})
