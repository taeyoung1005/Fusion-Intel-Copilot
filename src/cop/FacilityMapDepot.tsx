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
  return (
    <g>
      <title>
        {
          "AMMO DEPOT — 보호 자산 구역. 각 벙커 테두리 색은 인근 최근접 이벤트의 위험도를 나타냅니다."
        }
      </title>
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
            <title>{`${bunker.id} · 보호 자산 · 인근 위협 상태: ${summary.statusLabel}`}</title>
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
    statusLabel: "CLEAR",
  }
