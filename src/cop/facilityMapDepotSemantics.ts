import type { AlertTone, DepotBunker, MapEvent } from "./copData"

export type DepotThreatSummary = {
  readonly bunkerId: string
  readonly nearestEventId: string | null
  readonly tone: AlertTone
  readonly statusLabel: string
}

const DEPOT_STATUS_LABEL: Record<AlertTone, string> = {
  normal: "CLEAR",
  watch: "WATCH",
  alert: "ALERT",
  confirmed: "CONFIRMED",
  uncertain: "REVIEW",
}

export const depotThreatSummaries = (
  bunkers: readonly DepotBunker[],
  events: readonly MapEvent[],
): readonly DepotThreatSummary[] =>
  bunkers.map((bunker) => {
    const nearest = nearestEventForBunker(bunker, events)
    if (nearest === null) {
      return {
        bunkerId: bunker.id,
        nearestEventId: null,
        tone: "normal",
        statusLabel: DEPOT_STATUS_LABEL.normal,
      }
    }
    return {
      bunkerId: bunker.id,
      nearestEventId: nearest.event.id,
      tone: nearest.event.tone,
      statusLabel: DEPOT_STATUS_LABEL[nearest.event.tone],
    }
  })

const nearestEventForBunker = (
  bunker: DepotBunker,
  events: readonly MapEvent[],
): { readonly event: MapEvent; readonly distance: number } | null => {
  const center = {
    x: bunker.x + bunker.width / 2,
    y: bunker.y + bunker.height / 2,
  }
  return events.reduce<{ readonly event: MapEvent; readonly distance: number } | null>(
    (nearest, event) => {
      const distance = Math.hypot(event.point.x - center.x, event.point.y - center.y)
      if (nearest !== null && nearest.distance <= distance) {
        return nearest
      }
      return { event, distance }
    },
    null,
  )
}
