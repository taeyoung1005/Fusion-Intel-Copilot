import type { CSSProperties, ReactElement } from "react"
import {
  DEPOT_BUNKERS,
  DEPOT_TITLE_POINT,
  type MapCamera,
  type MapEvent,
  type Point,
} from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import { depotThreatSummaries } from "./facilityMapDepotSemantics"
import { type RoadviewProjection, projectRoadviewPoint } from "./facilityMapRoadviewProjection"

type FacilityMapRoadviewProps = {
  readonly selectedCameraId: string
  readonly dynamicCameraRecords: readonly DynamicCameraRecord[]
  readonly detectionMarkers: readonly MapEvent[]
  readonly onSelectCamera: (camera: MapCamera) => void
  readonly onSelectDynamicCamera: (camera: DynamicCameraRecord) => void
  readonly onSelectEvent: (event: MapEvent) => void
}

type RoadviewCameraMarker = {
  readonly kind: "camera"
  readonly record: DynamicCameraRecord
  readonly projection: RoadviewProjection
}

type RoadviewEventMarker = {
  readonly kind: "event"
  readonly event: MapEvent
  readonly projection: RoadviewProjection
}

type RoadviewDepotMarker = {
  readonly id: string
  readonly statusLabel: string
  readonly projection: RoadviewProjection
}

export function FacilityMapRoadview({
  selectedCameraId,
  dynamicCameraRecords,
  detectionMarkers,
  onSelectCamera,
  onSelectDynamicCamera,
  onSelectEvent,
}: FacilityMapRoadviewProps): ReactElement {
  const cameraMarkers = dynamicCameraRecords
    .map((record): RoadviewCameraMarker | null => {
      const projection = projectRoadviewPoint(record.camera.node)
      return projection === null ? null : { kind: "camera", record, projection }
    })
    .filter(isCameraMarker)
  const eventMarkers = detectionMarkers
    .map((event): RoadviewEventMarker | null => {
      const projection = projectRoadviewPoint(event.point)
      return projection === null ? null : { kind: "event", event, projection }
    })
    .filter(isEventMarker)
  const depotSummaries = depotThreatSummaries(DEPOT_BUNKERS, detectionMarkers)
  const depotMarkers = DEPOT_BUNKERS.map((bunker): RoadviewDepotMarker | null => {
    const projection = projectRoadviewPoint(centerOf(bunker))
    const summary = depotSummaries.find((item) => item.bunkerId === bunker.id)
    if (projection === null || summary === undefined) {
      return null
    }
    return { id: bunker.id, statusLabel: summary.statusLabel, projection }
  }).filter(isDepotMarker)
  const depotProjection = projectRoadviewPoint(DEPOT_TITLE_POINT)
  const depotStatus =
    depotSummaries.find((summary) => summary.distanceMeters !== null)?.statusLabel ?? "CLEAR"

  return (
    <div className="cop-map-roadview" role="img" aria-label="시설 3D 로드뷰">
      <div className="cop-roadview-sky" aria-hidden="true" />
      <div className="cop-roadview-horizon">
        <span>SOUTH GATE APPROACH</span>
        <strong>AMMO DEPOT ROADVIEW</strong>
      </div>
      <div className="cop-roadview-ground" aria-hidden="true">
        <span className="cop-roadview-lane lane-left" />
        <span className="cop-roadview-lane lane-right" />
        <span className="cop-roadview-grid grid-a" />
        <span className="cop-roadview-grid grid-b" />
        <span className="cop-roadview-grid grid-c" />
      </div>

      {depotProjection !== null && (
        <div className="cop-roadview-depot" style={markerStyle(depotProjection)}>
          <strong>AMMO DEPOT</strong>
          <span>{depotStatus}</span>
        </div>
      )}

      {depotMarkers.map((marker) => (
        <span
          key={marker.id}
          className="cop-roadview-marker depot"
          style={markerStyle(marker.projection)}
          aria-label={`${marker.id} 탄약고 상태 ${marker.statusLabel}`}
        >
          <strong>{marker.id}</strong>
          <span>{marker.statusLabel}</span>
        </span>
      ))}

      {cameraMarkers.map((marker) => {
        const selected = marker.record.id === selectedCameraId
        return (
          <button
            key={marker.record.id}
            type="button"
            className={`cop-roadview-marker camera${selected ? " selected" : ""}`}
            style={markerStyle(marker.projection)}
            aria-label={`${marker.record.id} 3D 카메라 선택`}
            onClick={() => {
              onSelectCamera(marker.record.camera)
              onSelectDynamicCamera(marker.record)
            }}
          >
            <strong>{marker.record.id}</strong>
            <span>{marker.record.frameCount ?? 0}F</span>
          </button>
        )
      })}

      {eventMarkers.map((marker) => (
        <button
          key={marker.event.id}
          type="button"
          className={`cop-roadview-marker event tone-${marker.event.tone}`}
          style={markerStyle(marker.projection)}
          aria-label={`${marker.event.time} 3D 이벤트 선택`}
          onClick={() => onSelectEvent(marker.event)}
        >
          <strong>{marker.event.time}</strong>
          <span>{marker.event.tone.toUpperCase()}</span>
        </button>
      ))}

      <div className="cop-roadview-status">
        <span>{cameraMarkers.length} CCTV</span>
        <span>{eventMarkers.length} EVENTS</span>
      </div>
    </div>
  )
}

const isCameraMarker = (marker: RoadviewCameraMarker | null): marker is RoadviewCameraMarker =>
  marker !== null

const isEventMarker = (marker: RoadviewEventMarker | null): marker is RoadviewEventMarker =>
  marker !== null

const isDepotMarker = (marker: RoadviewDepotMarker | null): marker is RoadviewDepotMarker =>
  marker !== null

const markerStyle = (projection: RoadviewProjection): CSSProperties => ({
  bottom: `${projection.bottomPercent}%`,
  left: `${projection.leftPercent}%`,
  transform: `translate(-50%, 0) scale(${projection.scale})`,
  zIndex: Math.round(projection.depthPercent),
})

const centerOf = (bunker: {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}): Point => ({
  x: bunker.x + bunker.width / 2,
  y: bunker.y + bunker.height / 2,
})
