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
import type { ResponseAction, TakenResponseAction } from "./responseActionCatalog"
import type { RightRailTab } from "./useCopDashboardActions"

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
  readonly responseActionsByIncident: ReadonlyMap<string, TakenResponseAction>
  readonly onRecordResponseAction: (incidentId: string, action: ResponseAction) => void
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
  readonly cameraLabel: string
  readonly selectedCameraId: string
  readonly selectedClipId: string
  readonly selectedCitationId: string
  readonly relationshipGraph: EvidenceRelationshipGraph
  readonly codexRequestFingerprint: string
  readonly recentActivitySummary: string | undefined
  readonly activeTab: RightRailTab
  readonly onChangeTab: (tab: RightRailTab) => void
  readonly onSelectCitation: (citationId: string) => void
  readonly onSelectIncident: (incidentId: string) => void
  readonly onSelectRelationshipNode: (node: RelationshipGraphNode) => void
}

const TABS: readonly { readonly id: RightRailTab; readonly label: string }[] = [
  { id: "overview", label: "상황 개관" },
  { id: "decision", label: "판단·대응" },
]

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
  responseActionsByIncident,
  onRecordResponseAction,
  reportRows,
  reportPeriod,
  cameraLabel,
  selectedCameraId,
  selectedClipId,
  selectedCitationId,
  relationshipGraph,
  codexRequestFingerprint,
  recentActivitySummary,
  activeTab,
  onChangeTab,
  onSelectCitation,
  onSelectIncident,
  onSelectRelationshipNode,
}: RightRailProps): ReactElement {
  const scrollToGate = useCallback((): void => {
    document.getElementById("cop-gate")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])
  const takenResponseAction = responseActionsByIncident.get(selectedIncident.id)
  const recommendedAction = useMemo(
    () =>
      buildRecommendedAction(selectedIncident, missingContext, responseGates, takenResponseAction),
    [selectedIncident, missingContext, responseGates, takenResponseAction],
  )
  const recordResponseAction = useCallback(
    (action: ResponseAction): void => onRecordResponseAction(selectedIncident.id, action),
    [onRecordResponseAction, selectedIncident.id],
  )

  return (
    <aside className="cop-right" aria-label="운용자 명령 패널">
      <div className="cop-rail-tabs" role="tablist" aria-label="운용자 명령 패널 탭">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`cop-rail-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => onChangeTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Both groups stay mounted (hidden via the `hidden` attribute, not
          conditional JSX) so panels like Codex — which run an async request
          lifecycle independent of which tab the operator is looking at —
          don't lose their state every time the operator switches tabs. */}
      <div className="cop-rail-group" hidden={activeTab !== "overview"}>
        <OperationalMetricTiles metrics={operationalMetrics} />
        <ActivityStreamPanel />
        <ActiveIncidents
          incidents={incidents}
          selectedIncidentId={selectedIncident.id}
          cameraLabel={cameraLabel}
          responseActionsByIncident={responseActionsByIncident}
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
      </div>

      <div className="cop-rail-group" hidden={activeTab !== "decision"}>
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
        <div className="cop-readiness-group">
          <MissingContextPanel items={missingContext} />
          <ResponseGatePanel
            selectedIncident={selectedIncident}
            gates={responseGates}
            takenResponseAction={takenResponseAction}
            onRecordResponseAction={recordResponseAction}
          />
        </div>
        <DailyReportPanel
          selectedClip={selectedClip}
          selectedIncident={selectedIncident}
          cameraLabel={cameraLabel}
          evidenceClips={evidenceClips}
          citations={citations}
          missingContext={missingContext}
          responseGates={responseGates}
          takenResponseAction={takenResponseAction}
          reportRows={reportRows}
          reportPeriod={reportPeriod}
        />
      </div>
    </aside>
  )
})
