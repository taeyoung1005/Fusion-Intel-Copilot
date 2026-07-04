import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from "react"
import type {
  Citation,
  EvidenceClip,
  Incident,
  MapCamera,
  MapEvent,
  MapLayerId,
  TimelineEvent,
} from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import type { RelationshipGraphNode } from "./operationalTelemetry"

type AlertSettings = { readonly autoClose: boolean; readonly autoCloseMs: number }

type CopDashboardActionArgs = {
  readonly evidenceClips: readonly EvidenceClip[]
  readonly selectedClipId: string
  readonly selectedIncidentId: string
  readonly selectedCitationId: string
  readonly incidents: readonly Incident[]
  readonly citations: readonly Citation[]
  readonly setActiveLayers: Dispatch<SetStateAction<Set<MapLayerId>>>
  readonly setRefreshTick: Dispatch<SetStateAction<number>>
  readonly setSelectedClipId: Dispatch<SetStateAction<string>>
  readonly setSelectedIncidentId: Dispatch<SetStateAction<string>>
  readonly setSelectedCameraId: Dispatch<SetStateAction<string>>
  readonly setSelectedCitationId: Dispatch<SetStateAction<string>>
  readonly setCommandFeedback: Dispatch<SetStateAction<string>>
  readonly dismissAlert: (id: string) => void
  readonly dismissCorrelationAlert: (id: string) => void
  readonly updateAlertSettings: (id: string, settings: AlertSettings) => void
  readonly updateCorrelationAlertSettings: (id: string, settings: AlertSettings) => void
}

type CopDashboardActions = {
  readonly dismissAnyAlert: (id: string) => void
  readonly updateAnyAlertSettings: (id: string, settings: AlertSettings) => void
  readonly toggleLayer: (id: MapLayerId) => void
  readonly selectCamera: (camera: MapCamera) => void
  readonly selectMapEvent: (event: MapEvent) => void
  readonly selectTimelineEvent: (event: TimelineEvent) => void
  readonly selectIncident: (incidentId: string) => void
  readonly selectRelationshipNode: (node: RelationshipGraphNode) => void
  readonly navigateRail: (targetId: string, label: string) => void
  readonly selectDynamicCamera: (camera: DynamicCameraRecord) => void
  readonly refreshDashboard: () => void
}

export const useCopDashboardActions = ({
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
  setCommandFeedback,
  dismissAlert,
  dismissCorrelationAlert,
  updateAlertSettings,
  updateCorrelationAlertSettings,
}: CopDashboardActionArgs): CopDashboardActions => {
  const dismissAlertRef = useRef(dismissAlert)
  dismissAlertRef.current = dismissAlert
  const dismissCorrelationAlertRef = useRef(dismissCorrelationAlert)
  dismissCorrelationAlertRef.current = dismissCorrelationAlert
  const updateAlertSettingsRef = useRef(updateAlertSettings)
  updateAlertSettingsRef.current = updateAlertSettings
  const updateCorrelationAlertSettingsRef = useRef(updateCorrelationAlertSettings)
  updateCorrelationAlertSettingsRef.current = updateCorrelationAlertSettings

  const firstEvidenceId = evidenceClips[0]?.id ?? ""
  const hasSelectedClip = evidenceClips.some((clip) => clip.id === selectedClipId)
  useEffect(() => {
    if (!hasSelectedClip) {
      setSelectedClipId(firstEvidenceId)
    }
  }, [firstEvidenceId, hasSelectedClip, setSelectedClipId])

  const firstIncidentId = incidents[0]?.id ?? ""
  const hasSelectedIncident = incidents.some((incident) => incident.id === selectedIncidentId)
  useEffect(() => {
    if (!hasSelectedIncident) {
      setSelectedIncidentId(firstIncidentId)
    }
  }, [firstIncidentId, hasSelectedIncident, setSelectedIncidentId])

  const firstCitationId = citations[0]?.id ?? ""
  const hasSelectedCitation = citations.some((citation) => citation.id === selectedCitationId)
  useEffect(() => {
    if (!hasSelectedCitation) {
      setSelectedCitationId(firstCitationId)
    }
  }, [firstCitationId, hasSelectedCitation, setSelectedCitationId])

  const dismissAnyAlert = useCallback((id: string): void => {
    dismissAlertRef.current(id)
    dismissCorrelationAlertRef.current(id)
  }, [])

  const updateAnyAlertSettings = useCallback((id: string, settings: AlertSettings): void => {
    updateAlertSettingsRef.current(id, settings)
    updateCorrelationAlertSettingsRef.current(id, settings)
  }, [])

  const toggleLayer = useCallback(
    (id: MapLayerId): void => {
      setActiveLayers((previous) => {
        const next = new Set(previous)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    },
    [setActiveLayers],
  )

  const selectCamera = useCallback(
    (camera: MapCamera): void => {
      setSelectedCameraId(camera.id)
      const incidentId = `inc-${camera.id}`
      if (incidents.some((incident) => incident.id === incidentId)) {
        setSelectedIncidentId(incidentId)
        setCommandFeedback(`${camera.id} 선택: 해당 카메라의 실측 사건을 동기화했습니다.`)
        return
      }
      setCommandFeedback(`${camera.id} 선택: 아직 이 카메라에서 발생한 사건이 없습니다.`)
    },
    [incidents, setCommandFeedback, setSelectedCameraId, setSelectedIncidentId],
  )

  const selectMapEvent = useCallback(
    (event: MapEvent): void => {
      const camera = event.id.replace(/^mk-/, "")
      const incidentId = `inc-${camera}`
      if (incidents.some((incident) => incident.id === incidentId)) {
        setSelectedIncidentId(incidentId)
        setCommandFeedback(`${event.time} 탐지 마커 선택: ${camera} 실측 사건을 동기화했습니다.`)
        return
      }
      setCommandFeedback(`${event.time} 탐지 마커 선택`)
    },
    [incidents, setCommandFeedback, setSelectedIncidentId],
  )

  const selectTimelineEvent = useCallback(
    (event: TimelineEvent): void => {
      setSelectedClipId(event.id)
      setCommandFeedback(`${event.display} 타임라인 이벤트 선택: 해당 증거를 동기화했습니다.`)
    },
    [setCommandFeedback, setSelectedClipId],
  )

  const selectIncident = useCallback(
    (incidentId: string): void => {
      setSelectedIncidentId(incidentId)
      const incident = incidents.find((entry) => entry.id === incidentId)
      if (incident !== undefined && incident.id !== "inc-standby") {
        setSelectedCameraId(incident.zone)
      }
    },
    [incidents, setSelectedCameraId, setSelectedIncidentId],
  )

  const selectRelationshipNode = useCallback(
    (node: RelationshipGraphNode): void => {
      if (
        node.incidentId !== undefined &&
        incidents.some((incident) => incident.id === node.incidentId)
      ) {
        setSelectedIncidentId(node.incidentId)
      }
      if (node.cameraId !== undefined) {
        setSelectedCameraId(node.cameraId)
      }
      if (node.clipId !== undefined) {
        setSelectedClipId(node.clipId)
        document.getElementById("cop-timeline-panel")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        })
      }
      if (node.citationId !== undefined) {
        setSelectedCitationId(node.citationId)
      }
      if (node.responseGateId !== undefined) {
        document.getElementById("cop-gate")?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      setCommandFeedback(
        `${node.label} 관계 그래프 노드 선택: 실제 증거 컨텍스트를 동기화했습니다.`,
      )
    },
    [
      incidents,
      setCommandFeedback,
      setSelectedCameraId,
      setSelectedCitationId,
      setSelectedClipId,
      setSelectedIncidentId,
    ],
  )

  const navigateRail = useCallback(
    (targetId: string, label: string): void => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" })
      setCommandFeedback(`${label} 패널로 이동했습니다.`)
    },
    [setCommandFeedback],
  )

  const selectDynamicCamera = useCallback(
    (camera: DynamicCameraRecord): void => {
      setSelectedCameraId(camera.id)
      setCommandFeedback(`${camera.id} 선택: ${camera.label} 지도 노드를 확인 중입니다.`)
    },
    [setCommandFeedback, setSelectedCameraId],
  )

  const refreshDashboard = useCallback((): void => {
    setRefreshTick((tick) => tick + 3)
  }, [setRefreshTick])

  return {
    dismissAnyAlert,
    updateAnyAlertSettings,
    toggleLayer,
    selectCamera,
    selectMapEvent,
    selectTimelineEvent,
    selectIncident,
    selectRelationshipNode,
    navigateRail,
    selectDynamicCamera,
    refreshDashboard,
  }
}
