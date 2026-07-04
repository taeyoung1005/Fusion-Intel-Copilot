import type { ReactElement } from "react"
import { DepotFootprint } from "./FacilityMapDepot"
import {
  BlindSpots,
  CameraHandoffRoutes,
  CameraNode,
  DroneIsrOverlay,
  EventMarkers,
  PoiMarkers,
  TerrainContours,
  ThreatVisualization,
} from "./FacilityMapOverlays"
import { SatelliteBase, SatelliteTiles } from "./FacilityMapTerrain"
import { cameraConnectionState } from "./cameraConnectionStatus"
import {
  DISTANCE_BANDS,
  type MapCamera,
  type MapEvent,
  type MapLayerId,
  PERIMETER_PATH,
  ZONE_LABELS,
} from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import { type OsmFeatures, pointsToSvg } from "./osmFeatures"

type MapSceneProps = {
  readonly has: (id: MapLayerId) => boolean
  readonly selectedCameraId: string
  readonly dynamicCameraRecords: readonly DynamicCameraRecord[]
  readonly detectionMarkers: readonly MapEvent[]
  readonly osmFeatures: OsmFeatures
  readonly onSelectCamera: (camera: MapCamera) => void
  readonly onSelectDynamicCamera: (camera: DynamicCameraRecord) => void
  readonly onSelectEvent: (event: MapEvent) => void
}

export function MapScene({
  has,
  selectedCameraId,
  dynamicCameraRecords,
  detectionMarkers,
  osmFeatures,
  onSelectCamera,
  onSelectDynamicCamera,
  onSelectEvent,
}: MapSceneProps): ReactElement {
  return (
    <g>
      <SatelliteBase />
      <SatelliteTiles />

      {has("roads") && <RealRoads roads={osmFeatures.roads} />}
      {has("buildings") && <RealBuildings buildings={osmFeatures.buildings} />}

      {has("terrainContours") && <TerrainContours />}

      {has("facilityZones") && <ZoneFill />}
      {has("distanceBands") && <DistanceBands />}
      {has("perimeterFence") && (
        <ellipse
          cx={PERIMETER_PATH.cx}
          cy={PERIMETER_PATH.cy}
          rx={PERIMETER_PATH.rx}
          ry={PERIMETER_PATH.ry}
          fill="none"
          stroke="rgba(89,215,255,0.85)"
          strokeWidth={1.6}
        />
      )}

      {has("protectedAssets") && <DepotFootprint events={detectionMarkers} />}

      {has("cameraCoverage") &&
        dynamicCameraRecords.map((record) => (
          <polygon
            key={`cone-${record.id}`}
            points={record.camera.conePoints}
            fill="#59d7ff"
            fillOpacity={0.18}
            stroke="rgba(89,215,255,0.3)"
            strokeWidth={0.6}
          />
        ))}

      {has("cameraHandoff") && dynamicCameraRecords.length >= 2 && (
        <CameraHandoffRoutes records={dynamicCameraRecords} />
      )}

      {has("blindSpots") && <BlindSpots />}

      {has("facilityZones") && <ZoneLabels />}

      {has("poi") && <PoiMarkers />}

      {has("events") && detectionMarkers.length > 0 && (
        <ThreatVisualization events={detectionMarkers} />
      )}
      {detectionMarkers.length > 0 && has("cctvCameras") && (
        <DroneIsrOverlay events={detectionMarkers} />
      )}
      {has("events") && <EventMarkers events={detectionMarkers} onSelectEvent={onSelectEvent} />}

      {has("cctvCameras") &&
        dynamicCameraRecords.map((record) => {
          const connection = cameraConnectionState(record)
          return (
            <CameraNode
              key={record.id}
              camera={record.camera}
              selected={record.id === selectedCameraId}
              preview={{
                frameCount: record.frameCount ?? 0,
                imageDataUrl: record.latestFrameDataUrl ?? null,
                label: record.label,
                status: connection.label,
              }}
              onSelectCamera={() => {
                onSelectCamera(record.camera)
                onSelectDynamicCamera(record)
              }}
            />
          )
        })}
    </g>
  )
}

function RealRoads({ roads }: { readonly roads: OsmFeatures["roads"] }): ReactElement {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {roads.map((road) => {
        const points = pointsToSvg(road.points)
        return (
          <g key={road.id}>
            <polyline
              points={points}
              stroke="rgba(8,14,10,0.5)"
              strokeWidth={road.major ? 4.4 : 3}
            />
            <polyline
              points={points}
              stroke={road.major ? "rgba(246,214,130,0.95)" : "rgba(226,205,150,0.78)"}
              strokeWidth={road.major ? 2.6 : 1.5}
            />
          </g>
        )
      })}
    </g>
  )
}

function RealBuildings({
  buildings,
}: { readonly buildings: OsmFeatures["buildings"] }): ReactElement {
  return (
    <g>
      {buildings.map((points) => (
        <polygon
          key={pointsToSvg(points)}
          points={pointsToSvg(points)}
          fill="rgba(89,215,255,0.2)"
          stroke="rgba(89,215,255,0.85)"
          strokeWidth={0.8}
        />
      ))}
    </g>
  )
}

function ZoneFill(): ReactElement {
  return (
    <ellipse
      cx={PERIMETER_PATH.cx}
      cy={PERIMETER_PATH.cy}
      rx={PERIMETER_PATH.rx}
      ry={PERIMETER_PATH.ry}
      fill="rgba(28,74,86,0.16)"
      stroke="none"
    />
  )
}

function DistanceBands(): ReactElement {
  return (
    <g>
      {DISTANCE_BANDS.map((band) => (
        <g key={band.id}>
          <ellipse
            cx={PERIMETER_PATH.cx}
            cy={PERIMETER_PATH.cy}
            rx={band.rx}
            ry={band.ry}
            fill="none"
            stroke="rgba(89,215,255,0.42)"
            strokeWidth={1}
            strokeDasharray="4 5"
          />
          <text
            x={band.labelPoint.x}
            y={band.labelPoint.y}
            className="cop-svg-band"
            textAnchor="middle"
          >
            {band.label}
          </text>
        </g>
      ))}
    </g>
  )
}

function ZoneLabels(): ReactElement {
  return (
    <g>
      {ZONE_LABELS.map((zone) => (
        <text
          key={zone.id}
          x={zone.point.x}
          y={zone.point.y}
          className="cop-svg-zone"
          textAnchor="middle"
        >
          {zone.label}
        </text>
      ))}
    </g>
  )
}
