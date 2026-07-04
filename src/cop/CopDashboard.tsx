import { type ReactElement, useCallback, useMemo, useState } from "react"
import { CommandBar } from "./CommandBar"
import { EventTimeline } from "./EventTimeline"
import { FacilityMap } from "./FacilityMap"
import { IconRail, LeftPanels } from "./LeftRail"
import { RealtimeAlertStack } from "./RealtimeAlertStack"
import { RightRail } from "./RightRail"
import { type EvidenceClip, LAST_UPDATED, MAP_LAYERS, type MapLayerId } from "./copData"
import { useEvidenceWindowBuffer } from "./evidenceWindowBuffer"
import type { ResponseAction, TakenResponseAction } from "./responseActionCatalog"
import { type DetrServerConnection, isDetrServerDisconnected } from "./serverDetectionClient"
import type { CarlaCameraDetectionFrame } from "./useCarlaCameraDetection"
import { useCarlaCameras } from "./useCarlaCameras"
import { type RightRailTab, useCopDashboardActions } from "./useCopDashboardActions"
import { useCorrelationAlerts } from "./useCorrelationAlerts"
import { useDashboardTelemetry } from "./useDashboardTelemetry"
import { useRealtimeAlerts } from "./useRealtimeAlerts"

type LiveDetectionFrame = Pick<CarlaCameraDetectionFrame, "width" | "height" | "objects">

const MAX_VISION_EVIDENCE = 6

const defaultLayers = (): Set<MapLayerId> =>
  new Set(MAP_LAYERS.filter((layer) => layer.defaultOn).map((layer) => layer.id))

const baseSeconds = Number(LAST_UPDATED.slice(-2))
const baseMinutes = Number(LAST_UPDATED.slice(3, 5))

const formatUpdated = (tick: number): string => {
  const total = baseSeconds + tick
  const minutes = baseMinutes + Math.floor(total / 60)
  const seconds = total % 60
  return `09:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function CopDashboard(): ReactElement {
  const [activeLayers, setActiveLayers] = useState<Set<MapLayerId>>(defaultLayers)
  const [refreshTick, setRefreshTick] = useState(0)
  const [selectedClipId, setSelectedClipId] = useState("")
  const [selectedIncidentId, setSelectedIncidentId] = useState("")
  const [selectedCameraId, setSelectedCameraId] = useState("")
  const [selectedCitationId, setSelectedCitationId] = useState("")
  const [rightRailTab, setRightRailTab] = useState<RightRailTab>("overview")
  const [visionEvidence, setVisionEvidence] = useState<readonly EvidenceClip[]>([])
  const [cctvWindowOpen, setCctvWindowOpen] = useState(false)
  const [disconnectedDetectionCameraIds, setDisconnectedDetectionCameraIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const [liveDetectionFrames, setLiveDetectionFrames] = useState<
    ReadonlyMap<string, LiveDetectionFrame>
  >(() => new Map())
  const [responseActionsByIncident, setResponseActionsByIncident] = useState<
    ReadonlyMap<string, TakenResponseAction>
  >(() => new Map())
  const [commandFeedback, setCommandFeedback] = useState(
    "COP 준비 완료: 합성 CCTV와 서버 Codex 하네스 연결 대기",
  )

  const carlaRegistry = useCarlaCameras({ setCommandFeedback })
  const cameras = carlaRegistry.carlaCameras
  const liveCameraLabel = cameras[0]?.id ?? "CARLA 시뮬레이션 CCTV 대기"

  // All right-rail panels derive from the real signal: DETR detections (webcam
  // and CARLA simulation CCTV alike). With nothing detected they show a quiet
  // baseline.
  const evidenceClips = visionEvidence
  const windowBuffer = useEvidenceWindowBuffer(evidenceClips)
  const { alerts, dismissAlert, updateAlertSettings } = useRealtimeAlerts(evidenceClips)
  const {
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
    recentActivitySummary,
    recentActivityEscalated,
    responseGates,
    relationshipGraph,
  } = useDashboardTelemetry({
    cameras,
    evidenceClips,
    selectedClipId,
    selectedIncidentId,
    windowBuffer,
  })

  const addVisionEvidence = useCallback((clip: EvidenceClip): void => {
    setVisionEvidence((previous) => {
      const deduped = previous.filter((existing) => existing.id !== clip.id)
      return [clip, ...deduped].slice(0, MAX_VISION_EVIDENCE)
    })
  }, [])

  const updateLiveDetectionFrame = useCallback(
    (cameraId: string, frame: LiveDetectionFrame | null): void => {
      setLiveDetectionFrames((previous) => {
        if (frame === null) {
          if (!previous.has(cameraId)) {
            return previous
          }
          const next = new Map(previous)
          next.delete(cameraId)
          return next
        }
        const next = new Map(previous)
        next.set(cameraId, frame)
        return next
      })
    },
    [],
  )

  const recordResponseAction = useCallback((incidentId: string, action: ResponseAction): void => {
    setResponseActionsByIncident((previous) => {
      const next = new Map(previous)
      next.set(incidentId, { actionId: action.id, label: action.label, takenAtMs: Date.now() })
      return next
    })
  }, [])

  const updateDetectionServerConnection = useCallback(
    (cameraId: string, connection: DetrServerConnection): void => {
      const disconnected = isDetrServerDisconnected(connection)
      setDisconnectedDetectionCameraIds((previous) => {
        if (previous.has(cameraId) === disconnected) {
          return previous
        }
        const next = new Set(previous)
        if (disconnected) {
          next.add(cameraId)
        } else {
          next.delete(cameraId)
        }
        return next
      })
    },
    [],
  )

  const disconnectedDetectionCameraLabels = useMemo(
    () => [...disconnectedDetectionCameraIds].sort(),
    [disconnectedDetectionCameraIds],
  )

  const {
    alerts: correlationAlerts,
    dismissAlert: dismissCorrelationAlert,
    updateAlertSettings: updateCorrelationAlertSettings,
  } = useCorrelationAlerts(evidenceClips, cameras, addVisionEvidence, windowBuffer)
  const combinedAlerts = useMemo(
    () => [...alerts, ...correlationAlerts],
    [alerts, correlationAlerts],
  )
  const {
    dismissAnyAlert,
    updateAnyAlertSettings,
    toggleLayer,
    selectCamera,
    selectMapEvent,
    selectTimelineEvent,
    selectIncident,
    selectCitation,
    selectRelationshipNode,
    navigateRail,
    selectDynamicCamera,
    refreshDashboard,
  } = useCopDashboardActions({
    evidenceClips,
    selectedClipId,
    selectedIncidentId,
    selectedCitationId,
    incidents,
    citations,
    setActiveLayers,
    setRefreshTick,
    setSelectedClipId,
    setSelectedIncidentId,
    setSelectedCameraId,
    setSelectedCitationId,
    setRightRailTab,
    setCommandFeedback,
    dismissAlert,
    dismissCorrelationAlert,
    updateAlertSettings,
    updateCorrelationAlertSettings,
  })

  return (
    <div className="cop-shell">
      <CommandBar onCommand={setCommandFeedback} />
      <p className="cop-shell-feedback" aria-live="polite">
        {commandFeedback}
      </p>
      {disconnectedDetectionCameraLabels.length > 0 && (
        <output className="cop-server-disconnected" aria-live="polite">
          <span className="cop-server-disconnected-dot" aria-hidden="true" />
          <strong>서버 연결 끊김</strong>
          <span>
            {disconnectedDetectionCameraLabels.length === 1
              ? `${disconnectedDetectionCameraLabels[0]} /detect 응답 없음`
              : `${disconnectedDetectionCameraLabels.length}개 카메라 /detect 응답 없음`}
          </span>
        </output>
      )}
      <div className="cop-body">
        <IconRail onNavigate={navigateRail} onOpenCctvWindow={() => setCctvWindowOpen(true)} />
        <LeftPanels
          activeLayers={activeLayers}
          onToggleLayer={toggleLayer}
          selectedCameraId={selectedCameraId}
          carlaCameras={cameras}
          lastUpdated={formatUpdated(refreshTick)}
          onRefresh={refreshDashboard}
          onSelectDynamicCamera={selectDynamicCamera}
          onVisionEvidence={addVisionEvidence}
          cctvWindowOpen={cctvWindowOpen}
          onCloseCctvWindow={() => setCctvWindowOpen(false)}
          onDetectionServerConnectionChange={updateDetectionServerConnection}
          onDetectionFrameChange={updateLiveDetectionFrame}
        />
        <main className="cop-center" aria-label="시설 지도와 증거 타임라인">
          <FacilityMap
            activeLayers={activeLayers}
            selectedCameraId={selectedCameraId}
            dynamicCameraRecords={cameras}
            detectionMarkers={detectionMarkers}
            onSelectCamera={selectCamera}
            onSelectDynamicCamera={selectDynamicCamera}
            onSelectEvent={selectMapEvent}
          />
          <EventTimeline
            events={timelineEvents}
            evidenceClips={evidenceClips}
            selectedEventId={selectedClipId}
            onSelectEvent={selectTimelineEvent}
          />
        </main>
        {selectedIncident !== undefined && (
          <RightRail
            selectedClip={selectedClip}
            selectedIncident={selectedIncident}
            evidenceClips={evidenceClips}
            incidents={incidents}
            citations={citations}
            codexMetrics={codexMetrics}
            operationalMetrics={operationalMetrics}
            missingContext={missingContext}
            responseGates={responseGates}
            responseActionsByIncident={responseActionsByIncident}
            onRecordResponseAction={recordResponseAction}
            reportRows={reportRows}
            reportPeriod={reportPeriod}
            cameraLabel={liveCameraLabel}
            selectedCameraId={selectedCameraId}
            selectedClipId={selectedClipId}
            selectedCitationId={selectedCitationId}
            relationshipGraph={relationshipGraph}
            codexRequestFingerprint={codexRequestFingerprint}
            recentActivitySummary={recentActivitySummary}
            activeTab={rightRailTab}
            onChangeTab={setRightRailTab}
            onSelectCitation={selectCitation}
            onSelectIncident={selectIncident}
            onSelectRelationshipNode={selectRelationshipNode}
          />
        )}
      </div>
      <RealtimeAlertStack
        alerts={combinedAlerts}
        escalated={recentActivityEscalated}
        detectionFrames={liveDetectionFrames}
        onDismiss={dismissAnyAlert}
        onUpdateSettings={updateAnyAlertSettings}
      />
    </div>
  )
}
