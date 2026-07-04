import type { KeyboardEvent, ReactElement } from "react"
import {
  type AlertTone,
  BLIND_SPOTS,
  HANDOFF_PATH,
  MAP_VIEW,
  type MapCamera,
  type MapEvent,
  PERIMETER_PATH,
} from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"

const TONE_COLOR: Record<AlertTone, string> = {
  normal: "#36d399",
  watch: "#f4c430",
  alert: "#f87171",
  confirmed: "#59d7ff",
  uncertain: "#94a3b8",
}

const nodeColor = (camera: MapCamera): string => {
  if (camera.handoff !== undefined) {
    return "#f4c430"
  }
  if (camera.tone === "alert") {
    return "#f87171"
  }
  return "#59d7ff"
}

const runOnKeyboardSelect = (event: KeyboardEvent<SVGGElement>, action: () => void): void => {
  if (event.key !== "Enter" && event.key !== " ") {
    return
  }
  event.preventDefault()
  action()
}

// Real camera-handoff routes: dashed links between consecutive connected camera
// nodes, showing the handoff network across active CCTV. Needs at least 2 cameras.
export function CameraHandoffRoutes({
  records,
}: {
  readonly records: readonly DynamicCameraRecord[]
}): ReactElement {
  const segments = records.slice(1).map((record, index) => {
    const from = records[index]
    return { key: `${from?.id}-${record.id}`, from: from?.camera.node, to: record.camera.node }
  })
  return (
    <g>
      {segments.map((segment) =>
        segment.from === undefined || segment.to === undefined ? null : (
          <line
            key={segment.key}
            x1={segment.from.x}
            y1={segment.from.y}
            x2={segment.to.x}
            y2={segment.to.y}
            fill="none"
            stroke="#f4c430"
            strokeWidth={1.6}
            strokeDasharray="7 6"
            opacity={0.82}
            markerEnd="url(#cop-handoff-arrow)"
          />
        ),
      )}
    </g>
  )
}

export function HandoffOverlay(): ReactElement {
  const callout = HANDOFF_PATH.callout
  return (
    <g>
      <path
        d={HANDOFF_PATH.d}
        fill="none"
        stroke="#f4c430"
        strokeWidth={2}
        strokeDasharray="7 6"
        markerEnd="url(#cop-handoff-arrow)"
      />
      <g transform={`translate(${callout.point.x}, ${callout.point.y})`}>
        <rect
          x={0}
          y={0}
          width={158}
          height={48}
          rx={5}
          fill="rgba(6,16,22,0.94)"
          stroke="#f4c430"
          strokeWidth={1}
        />
        <text x={10} y={18} className="cop-svg-callout-title">
          {callout.title}
        </text>
        <text x={10} y={32} className="cop-svg-callout-route">
          {callout.route}
        </text>
        <text x={10} y={43} className="cop-svg-callout-time">
          {callout.time}
        </text>
      </g>
    </g>
  )
}

export function BlindSpots(): ReactElement {
  return (
    <g>
      {BLIND_SPOTS.map((spot) => (
        <g key={spot.id}>
          <polygon
            points={spot.points}
            fill="url(#cop-blind-hatch)"
            stroke="#f87171"
            strokeWidth={1.2}
          />
          <text
            x={spot.labelPoint.x}
            y={spot.labelPoint.y}
            className="cop-svg-blind"
            textAnchor="middle"
          >
            {spot.label}
          </text>
        </g>
      ))}
    </g>
  )
}

export function EventMarkers({
  events,
  onSelectEvent,
}: {
  readonly events: readonly MapEvent[]
  readonly onSelectEvent: (event: MapEvent) => void
}): ReactElement {
  return (
    <g>
      {events.map((event) => {
        const color = TONE_COLOR[event.tone]
        return (
          <g
            key={event.id}
            className="cop-map-target"
            transform={`translate(${event.point.x}, ${event.point.y})`}
            // biome-ignore lint/a11y/useSemanticElements: SVG map targets cannot be native HTML buttons.
            role="button"
            tabIndex={0}
            aria-label={`${event.time} 지도 이벤트 선택`}
            onClick={() => onSelectEvent(event)}
            onKeyDown={(keyboardEvent) =>
              runOnKeyboardSelect(keyboardEvent, () => onSelectEvent(event))
            }
          >
            <title>{`${event.time} 지도 이벤트 선택`}</title>
            <circle r={13} fill="rgba(244,196,48,0.14)" stroke={color} strokeWidth={1.4} />
            <RunnerGlyph color={color} />
            <g transform="translate(18, -8)">
              <rect
                x={0}
                y={0}
                width={50}
                height={16}
                rx={3}
                fill="rgba(6,16,22,0.92)"
                stroke="rgba(244,196,48,0.45)"
                strokeWidth={0.8}
              />
              <text x={25} y={11.5} className="cop-svg-event-time" textAnchor="middle">
                {event.time}
              </text>
            </g>
          </g>
        )
      })}
    </g>
  )
}

export function ThreatVisualization({
  events,
}: {
  readonly events: readonly MapEvent[]
}): ReactElement {
  return (
    <g data-testid="map-threat-visualization">
      {events.map((event) => {
        const color = TONE_COLOR[event.tone]
        return (
          <g key={`threat-${event.id}`} className="cop-map-threat">
            <circle
              cx={event.point.x}
              cy={event.point.y}
              r={34}
              fill="none"
              stroke={color}
              strokeWidth={1.1}
              strokeDasharray="5 4"
              opacity={0.74}
            />
            <circle cx={event.point.x} cy={event.point.y} r={21} fill={color} opacity={0.08} />
          </g>
        )
      })}
    </g>
  )
}

export function DroneIsrOverlay({
  events,
}: {
  readonly events: readonly MapEvent[]
}): ReactElement {
  const first = events[0]
  if (first === undefined) {
    return <g data-testid="drone-isr-overlay" />
  }
  const droneX = clamp(first.point.x - 118, 48, MAP_VIEW.width - 48)
  const droneY = clamp(first.point.y - 86, 48, MAP_VIEW.height - 48)
  return (
    <g data-testid="drone-isr-overlay" className="cop-drone-isr">
      <path
        d={`M${droneX},${droneY} L${first.point.x},${first.point.y}`}
        fill="none"
        stroke="#59d7ff"
        strokeWidth={1.2}
        strokeDasharray="4 5"
      />
      <g transform={`translate(${droneX}, ${droneY})`}>
        <circle r={16} fill="rgba(89,215,255,0.12)" stroke="#59d7ff" strokeWidth={1.1} />
        <path
          d="M-12 0 H12 M0 -10 V10 M-6 -5 L6 5 M6 -5 L-6 5"
          stroke="#59d7ff"
          strokeWidth={1.2}
        />
        <text x={0} y={30} className="cop-svg-isr" textAnchor="middle">
          DRONE ISR
        </text>
      </g>
    </g>
  )
}

function RunnerGlyph({ color }: { readonly color: string }): ReactElement {
  return (
    <g stroke={color} strokeWidth={1.3} strokeLinecap="round" fill="none">
      <circle cx={1} cy={-5} r={1.8} fill={color} stroke="none" />
      <path d="M-1 -2 L2 0 L0 3 L-2 5" />
      <path d="M2 0 L5 1" />
      <path d="M0 3 L3 5" />
    </g>
  )
}

export function CameraNode({
  camera,
  selected,
  preview,
  onSelectCamera,
}: {
  readonly camera: MapCamera
  readonly selected: boolean
  readonly preview?: {
    readonly frameCount: number
    readonly imageDataUrl?: string | null
    readonly label: string
    readonly status: string
  }
  readonly onSelectCamera: (camera: MapCamera) => void
}): ReactElement {
  const color = nodeColor(camera)
  const dir = Math.atan2(PERIMETER_PATH.cy - camera.node.y, PERIMETER_PATH.cx - camera.node.x)
  const labelX = camera.node.x + 26 * Math.cos(dir)
  const labelY = camera.node.y + 26 * Math.sin(dir)
  const chipWidth = camera.id.length * 6.6 + 12
  const hitPadding = 5
  const hitLeft = Math.min(camera.node.x - 14, labelX - chipWidth / 2) - hitPadding
  const hitTop = Math.min(camera.node.y - 14, labelY - 8) - hitPadding
  const hitRight = Math.max(camera.node.x + 14, labelX + chipWidth / 2) + hitPadding
  const hitBottom = Math.max(camera.node.y + 14, labelY + 8) + hitPadding
  const previewX = clamp(camera.node.x + 24, 8, MAP_VIEW.width - 188)
  const previewY = clamp(camera.node.y - 80, 8, MAP_VIEW.height - 132)
  return (
    <>
      <g
        className={`cop-map-target${selected ? " selected" : ""}`}
        // biome-ignore lint/a11y/useSemanticElements: SVG map targets cannot be native HTML buttons.
        role="button"
        tabIndex={0}
        aria-label={`${camera.id} 카메라 선택`}
        onClick={() => onSelectCamera(camera)}
        onKeyDown={(event) => runOnKeyboardSelect(event, () => onSelectCamera(camera))}
      >
        <title>{`${camera.id} 카메라 선택`}</title>
        <rect
          x={hitLeft}
          y={hitTop}
          width={hitRight - hitLeft}
          height={hitBottom - hitTop}
          fill="transparent"
          pointerEvents="all"
        />
        <circle cx={camera.node.x} cy={camera.node.y} r={13} fill={color} opacity={0.16} />
        {selected && (
          <circle
            cx={camera.node.x}
            cy={camera.node.y}
            r={17}
            fill="none"
            stroke="#f4c430"
            strokeWidth={1.4}
            strokeDasharray="3 3"
          />
        )}
        <circle
          cx={camera.node.x}
          cy={camera.node.y}
          r={8}
          fill="rgba(4,12,17,0.9)"
          stroke={color}
          strokeWidth={1.8}
        />
        <circle cx={camera.node.x} cy={camera.node.y} r={2.6} fill={color} />
        <g transform={`translate(${labelX - chipWidth / 2}, ${labelY - 8})`}>
          <rect
            x={0}
            y={0}
            width={chipWidth}
            height={16}
            rx={3}
            fill="rgba(5,14,20,0.92)"
            stroke="rgba(89,215,255,0.3)"
            strokeWidth={0.7}
          />
          <text x={chipWidth / 2} y={11.5} className="cop-svg-camlabel" textAnchor="middle">
            {camera.id}
          </text>
        </g>
      </g>
      {preview !== undefined && (
        <foreignObject
          x={previewX}
          y={previewY}
          width={180}
          height={124}
          className="cop-map-camera-preview"
        >
          <div className="cop-map-preview-card">
            <header>
              <strong>{camera.id}</strong>
              <span>{preview.status}</span>
            </header>
            <div className="cop-map-preview-media">
              {preview.imageDataUrl !== null && preview.imageDataUrl !== undefined ? (
                <img src={preview.imageDataUrl} alt={`${camera.id} 지도 CCTV 미리보기`} />
              ) : (
                <span>프레임 대기</span>
              )}
            </div>
            <footer>
              <span>{preview.label}</span>
              <span>{preview.frameCount}F</span>
            </footer>
          </div>
        </foreignObject>
      )}
    </>
  )
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export function TerrainContours(): ReactElement {
  return (
    <g stroke="rgba(120,150,120,0.16)" strokeWidth={1} fill="none">
      {[0.5, 0.7, 0.85, 1.05, 1.2].map((scale) => (
        <ellipse
          key={scale}
          cx={PERIMETER_PATH.cx}
          cy={PERIMETER_PATH.cy}
          rx={PERIMETER_PATH.rx * scale}
          ry={PERIMETER_PATH.ry * scale}
        />
      ))}
    </g>
  )
}

export function PoiMarkers(): ReactElement {
  const points = [
    { x: 250, y: 460 },
    { x: 760, y: 470 },
    { x: 720, y: 110 },
  ]
  return (
    <g fill="#59d7ff">
      {points.map((point) => (
        <g key={`${point.x}-${point.y}`} transform={`translate(${point.x}, ${point.y})`}>
          <path d="M0 -8 C 5 -8 5 0 0 6 C -5 0 -5 -8 0 -8 Z" fill="rgba(89,215,255,0.85)" />
          <circle cx={0} cy={-5} r={1.6} fill="#03090d" />
        </g>
      ))}
    </g>
  )
}
