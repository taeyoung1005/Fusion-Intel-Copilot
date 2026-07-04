import { useMemo } from "react"
import type {
  Citation,
  CodexMetric,
  EvidenceClip,
  Incident,
  MapEvent,
  MissingContext,
  ResponseGate,
  TimelineEvent,
} from "./copData"
import { toneToLane } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import type { WindowEntry } from "./evidenceWindowSummary"
import { summarizeWindow, windowMsForTone } from "./evidenceWindowSummary"
import {
  type DailyReportRow,
  type EvidenceRelationshipGraph,
  type OperationalMetricTile,
  buildCitations,
  buildCodexMetrics,
  buildDailyReportPeriod,
  buildDailyReportRows,
  buildDetectionMarkers,
  buildEvidenceRelationshipGraph,
  buildIncidents,
  buildMissingContext,
  buildOperationalMetricTiles,
  buildResponseGates,
} from "./operationalTelemetry"

type DashboardTelemetryInput = {
  readonly cameras: readonly DynamicCameraRecord[]
  readonly evidenceClips: readonly EvidenceClip[]
  readonly selectedClipId: string
  readonly selectedIncidentId: string
  readonly windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>
}

type DashboardTelemetry = {
  readonly incidents: readonly Incident[]
  readonly citations: readonly Citation[]
  readonly timelineEvents: readonly TimelineEvent[]
  readonly detectionMarkers: readonly MapEvent[]
  readonly missingContext: readonly MissingContext[]
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
  readonly codexMetrics: readonly CodexMetric[]
  readonly operationalMetrics: readonly OperationalMetricTile[]
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident | undefined
  readonly codexRequestFingerprint: string
  readonly recentActivitySummary: string | undefined
  readonly recentActivityEscalated: boolean
  readonly responseGates: readonly ResponseGate[]
  readonly relationshipGraph: EvidenceRelationshipGraph
}

const codexFingerprintFor = ({
  selectedClip,
  selectedIncident,
  citations,
  missingContext,
  recentActivitySummary,
}: {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident | undefined
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly recentActivitySummary: string | undefined
}): string =>
  JSON.stringify({
    selectedClipId: selectedClip?.id ?? "no-clip",
    selectedClipLabel: selectedClip?.label ?? "",
    selectedIncidentId: selectedIncident?.id ?? "no-incident",
    selectedIncidentTitle: selectedIncident?.title ?? "",
    selectedIncidentTone: selectedIncident?.tone ?? "",
    citations: citations
      .slice(0, 2)
      .map((citation) => [citation.id, citation.label, citation.time ?? ""]),
    missingContext: missingContext.map((item) => [item.id, item.camera, item.reason]),
    recentActivitySummary: recentActivitySummary ?? "",
  })

export const useDashboardTelemetry = ({
  cameras,
  evidenceClips,
  selectedClipId,
  selectedIncidentId,
  windowBuffer,
}: DashboardTelemetryInput): DashboardTelemetry => {
  const incidents = useMemo(() => buildIncidents(cameras, evidenceClips), [cameras, evidenceClips])
  const citations = useMemo(() => buildCitations(evidenceClips), [evidenceClips])
  const timelineEvents = useMemo<readonly TimelineEvent[]>(
    () =>
      evidenceClips.map((clip) => ({
        id: clip.id,
        time: clip.time,
        display: clip.time,
        tone: clip.tone,
        lane: toneToLane(clip.tone),
      })),
    [evidenceClips],
  )
  const detectionMarkers = useMemo(
    () => buildDetectionMarkers(cameras, evidenceClips),
    [cameras, evidenceClips],
  )
  const missingContext = useMemo(() => buildMissingContext(cameras), [cameras])
  const reportRows = useMemo(() => buildDailyReportRows(evidenceClips), [evidenceClips])
  const reportPeriod = useMemo(() => buildDailyReportPeriod(evidenceClips), [evidenceClips])
  const codexMetrics = useMemo(
    () => buildCodexMetrics(cameras, evidenceClips),
    [cameras, evidenceClips],
  )
  const operationalMetrics = useMemo(
    () =>
      buildOperationalMetricTiles({
        cameras,
        evidence: evidenceClips,
        windowBuffer,
      }),
    [cameras, evidenceClips, windowBuffer],
  )

  const selectedClip = useMemo(
    () => evidenceClips.find((clip) => clip.id === selectedClipId),
    [evidenceClips, selectedClipId],
  )
  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0],
    [incidents, selectedIncidentId],
  )

  const selectedIncidentZone = selectedIncident?.zone
  const recentWindowSummary = useMemo(() => {
    if (selectedIncidentZone === undefined) {
      return undefined
    }
    const entries = windowBuffer.get(selectedIncidentZone)
    if (entries === undefined || entries.length === 0) {
      return undefined
    }
    const latestTone = entries[entries.length - 1]?.clip.tone ?? "normal"
    return summarizeWindow(entries, Date.now(), windowMsForTone(latestTone))
  }, [selectedIncidentZone, windowBuffer])

  const codexRequestFingerprint = useMemo(
    () =>
      codexFingerprintFor({
        selectedClip,
        selectedIncident,
        citations,
        missingContext,
        recentActivitySummary: recentWindowSummary?.text,
      }),
    [selectedClip, selectedIncident, citations, missingContext, recentWindowSummary?.text],
  )

  const responseGates = useMemo(
    () =>
      selectedIncident === undefined
        ? []
        : buildResponseGates(selectedIncident, evidenceClips, missingContext),
    [selectedIncident, evidenceClips, missingContext],
  )
  const relationshipGraph = useMemo(
    () =>
      buildEvidenceRelationshipGraph({
        incidents,
        citations,
        evidence: evidenceClips,
        windowBuffer,
        responseGates,
        selectedIncidentId: selectedIncident?.id ?? "",
      }),
    [incidents, citations, evidenceClips, windowBuffer, responseGates, selectedIncident?.id],
  )

  return {
    incidents,
    citations,
    timelineEvents,
    detectionMarkers,
    missingContext,
    reportRows,
    reportPeriod,
    codexMetrics,
    operationalMetrics,
    selectedClip,
    selectedIncident,
    codexRequestFingerprint,
    recentActivitySummary: recentWindowSummary?.text,
    recentActivityEscalated: recentWindowSummary?.escalated ?? false,
    responseGates,
    relationshipGraph,
  }
}
