import { type ReactElement, useEffect, useMemo, useState } from "react"
import { CommandBar } from "./CommandBar"
import { EventTimeline } from "./EventTimeline"
import { EvidenceClips } from "./EvidenceClips"
import { FacilityMap } from "./FacilityMap"
import { IconRail, LeftPanels } from "./LeftRail"
import { RealtimeAlertStack } from "./RealtimeAlertStack"
import { RightRail } from "./RightRail"
import {
  type EvidenceClip,
  LAST_UPDATED,
  MAP_LAYERS,
  type MapCamera,
  type MapEvent,
  type MapLayerId,
  type TimelineEvent,
  toneToLane,
} from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import {
  buildCitations,
  buildCodexMetrics,
  buildDailyReportPeriod,
  buildDailyReportRows,
  buildDetectionMarkers,
  buildIncidents,
  buildMissingContext,
  buildResponseGates,
} from "./operationalTelemetry"
import { useCarlaCameras } from "./useCarlaCameras"
import { useRealtimeAlerts } from "./useRealtimeAlerts"

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
  const [visionEvidence, setVisionEvidence] = useState<readonly EvidenceClip[]>([])
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
  const { alerts, dismissAlert, updateAlertSettings } = useRealtimeAlerts(evidenceClips)
  const incidents = useMemo(() => buildIncidents(cameras, evidenceClips), [cameras, evidenceClips])
  const citations = useMemo(() => buildCitations(evidenceClips), [evidenceClips])
  // Timeline events are the real evidence, placed on a live current-time axis.
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

  const selectedClip = evidenceClips.find((clip) => clip.id === selectedClipId)
  const selectedIncident =
    incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0]

  // The human-confirmation gate reflects the selected incident's real readiness.
  const responseGates = useMemo(
    () =>
      selectedIncident === undefined
        ? []
        : buildResponseGates(selectedIncident, evidenceClips, missingContext),
    [selectedIncident, evidenceClips, missingContext],
  )

  const addVisionEvidence = (clip: EvidenceClip): void => {
    setVisionEvidence((previous) => {
      const deduped = previous.filter((existing) => existing.id !== clip.id)
      return [clip, ...deduped].slice(0, MAX_VISION_EVIDENCE)
    })
  }

  // Keep selections valid as real data appears/disappears.
  const firstEvidenceId = evidenceClips[0]?.id ?? ""
  const hasSelectedClip = evidenceClips.some((clip) => clip.id === selectedClipId)
  useEffect(() => {
    if (!hasSelectedClip) {
      setSelectedClipId(firstEvidenceId)
    }
  }, [hasSelectedClip, firstEvidenceId])

  const firstIncidentId = incidents[0]?.id ?? ""
  const hasSelectedIncident = incidents.some((incident) => incident.id === selectedIncidentId)
  useEffect(() => {
    if (!hasSelectedIncident) {
      setSelectedIncidentId(firstIncidentId)
    }
  }, [hasSelectedIncident, firstIncidentId])

  const firstCitationId = citations[0]?.id ?? ""
  const hasSelectedCitation = citations.some((citation) => citation.id === selectedCitationId)
  useEffect(() => {
    if (!hasSelectedCitation) {
      setSelectedCitationId(firstCitationId)
    }
  }, [hasSelectedCitation, firstCitationId])

  const toggleLayer = (id: MapLayerId): void => {
    setActiveLayers((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectCamera = (camera: MapCamera): void => {
    setSelectedCameraId(camera.id)
    // Selecting a live camera node focuses its real incident, when one exists.
    const incidentId = `inc-${camera.id}`
    if (incidents.some((incident) => incident.id === incidentId)) {
      setSelectedIncidentId(incidentId)
      setCommandFeedback(`${camera.id} 선택: 해당 카메라의 실측 사건을 동기화했습니다.`)
      return
    }
    setCommandFeedback(`${camera.id} 선택: 아직 이 카메라에서 발생한 사건이 없습니다.`)
  }

  const selectMapEvent = (event: MapEvent): void => {
    const camera = event.id.replace(/^mk-/, "")
    const incidentId = `inc-${camera}`
    if (incidents.some((incident) => incident.id === incidentId)) {
      setSelectedIncidentId(incidentId)
      setCommandFeedback(`${event.time} 탐지 마커 선택: ${camera} 실측 사건을 동기화했습니다.`)
      return
    }
    setCommandFeedback(`${event.time} 탐지 마커 선택`)
  }

  const selectTimelineEvent = (event: TimelineEvent): void => {
    setSelectedClipId(event.id)
    setCommandFeedback(`${event.display} 타임라인 이벤트 선택: 해당 증거를 동기화했습니다.`)
  }

  const selectClip = (clipId: string): void => {
    setSelectedClipId(clipId)
    setCommandFeedback(`${clipId} 증거 클립 선택: Codex 입력을 동기화했습니다.`)
  }

  // Selecting an incident also focuses its camera on the map, tying the queue,
  // map node and right-rail panels to one subject.
  const selectIncident = (incidentId: string): void => {
    setSelectedIncidentId(incidentId)
    const incident = incidents.find((entry) => entry.id === incidentId)
    if (incident !== undefined && incident.id !== "inc-standby") {
      setSelectedCameraId(incident.zone)
    }
  }

  const navigateRail = (targetId: string, label: string): void => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" })
    setCommandFeedback(`${label} 패널로 이동했습니다.`)
  }

  const selectDynamicCamera = (camera: DynamicCameraRecord): void => {
    setSelectedCameraId(camera.id)
    setCommandFeedback(`${camera.id} 선택: ${camera.label} 지도 노드를 확인 중입니다.`)
  }

  return (
    <div className="cop-shell">
      <CommandBar onCommand={setCommandFeedback} />
      <p className="cop-shell-feedback" aria-live="polite">
        {commandFeedback}
      </p>
      <div className="cop-body">
        <IconRail onNavigate={navigateRail} />
        <LeftPanels
          activeLayers={activeLayers}
          onToggleLayer={toggleLayer}
          selectedCameraId={selectedCameraId}
          carlaCameras={cameras}
          lastUpdated={formatUpdated(refreshTick)}
          onRefresh={() => setRefreshTick((tick) => tick + 3)}
          onSelectDynamicCamera={selectDynamicCamera}
          onVisionEvidence={addVisionEvidence}
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
            selectedEventId={selectedClipId}
            onSelectEvent={selectTimelineEvent}
          />
          <EvidenceClips
            clips={evidenceClips}
            selectedClipId={selectedClipId}
            onSelectClip={selectClip}
          />
        </main>
        {selectedIncident !== undefined && (
          <RightRail
            selectedClip={selectedClip}
            selectedIncident={selectedIncident}
            incidents={incidents}
            citations={citations}
            codexMetrics={codexMetrics}
            missingContext={missingContext}
            responseGates={responseGates}
            reportRows={reportRows}
            reportPeriod={reportPeriod}
            cameraLabel={liveCameraLabel}
            selectedCitationId={selectedCitationId}
            onSelectCitation={setSelectedCitationId}
            onSelectIncident={selectIncident}
            onVisionEvidence={addVisionEvidence}
          />
        )}
      </div>
      <RealtimeAlertStack
        alerts={alerts}
        onDismiss={dismissAlert}
        onUpdateSettings={updateAlertSettings}
      />
    </div>
  )
}
