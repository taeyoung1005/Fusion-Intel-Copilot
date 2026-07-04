import type { ReactElement } from "react"
import {
  type AlertTone,
  DEPOT_BUNKERS,
  DEPOT_FOOTPRINT,
  DEPOT_TITLE_POINT,
  type DepotBunker,
  type MapEvent,
} from "./copData"
import { type DepotThreatSummary, depotThreatSummaries } from "./facilityMapDepotSemantics"

const DEPOT_TONE_COLOR: Record<AlertTone, string> = {
  normal: "#36d399",
  watch: "#f4c430",
  alert: "#f87171",
  confirmed: "#59d7ff",
  uncertain: "#94a3b8",
}

export function DepotFootprint({ events }: { readonly events: readonly MapEvent[] }): ReactElement {
  const summaries = depotThreatSummaries(DEPOT_BUNKERS, events)
  const nearestStatus =
    summaries.find((summary) => summary.distanceMeters !== null)?.statusLabel ?? "CLEAR"
  return (
    <g>
      <rect
        x={DEPOT_FOOTPRINT.x}
        y={DEPOT_FOOTPRINT.y}
        width={DEPOT_FOOTPRINT.width}
        height={DEPOT_FOOTPRINT.height}
        rx={4}
        fill="rgba(8,24,33,0.42)"
        stroke="rgba(89,215,255,0.55)"
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {DEPOT_BUNKERS.map((bunker) => {
        const summary = summaryForBunker(bunker, summaries)
        const color = DEPOT_TONE_COLOR[summary.tone]
        return (
          <g key={bunker.id} className={`cop-depot-bunker tone-${summary.tone}`}>
            <title>{`${bunker.id} threat proximity ${summary.statusLabel}`}</title>
            <rect
              x={bunker.x}
              y={bunker.y}
              width={bunker.width}
              height={bunker.height}
              rx={2}
              fill="rgba(8,24,33,0.62)"
              stroke={color}
              strokeWidth={1}
            />
            <circle
              cx={bunker.x + bunker.width / 2}
              cy={bunker.y + bunker.height / 2}
              r={2}
              fill={color}
            />
            <text
              x={bunker.labelPoint.x}
              y={bunker.labelPoint.y}
              className="cop-svg-depot"
              textAnchor="middle"
            >
              {bunker.id}
            </text>
            <text
              x={bunker.labelPoint.x}
              y={bunker.labelPoint.y + 12}
              className="cop-svg-depot-status"
              textAnchor="middle"
            >
              {summary.statusLabel}
            </text>
          </g>
        )
      })}
      <text
        x={DEPOT_TITLE_POINT.x}
        y={DEPOT_TITLE_POINT.y}
        className="cop-svg-depot-title"
        textAnchor="middle"
      >
        AMMO DEPOT
      </text>
      <text
        x={DEPOT_TITLE_POINT.x}
        y={DEPOT_TITLE_POINT.y + 14}
        className="cop-svg-depot-status"
        textAnchor="middle"
      >
        {nearestStatus}
      </text>
    </g>
  )
}

const summaryForBunker = (
  bunker: DepotBunker,
  summaries: readonly DepotThreatSummary[],
): DepotThreatSummary =>
  summaries.find((summary) => summary.bunkerId === bunker.id) ?? {
    bunkerId: bunker.id,
    nearestEventId: null,
    tone: "normal",
    distanceMeters: null,
    statusLabel: "CLEAR",
  }
