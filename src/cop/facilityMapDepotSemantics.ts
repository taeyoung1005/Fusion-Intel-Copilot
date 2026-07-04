import type { AlertTone, DepotBunker, MapEvent } from "./copData"

export type DepotThreatSummary = {
  readonly bunkerId: string
  readonly nearestEventId: string | null
  readonly tone: AlertTone
  readonly distanceMeters: number | null
  readonly statusLabel: string
}

const MAP_METERS_PER_UNIT = 0.33

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
        distanceMeters: null,
        statusLabel: "CLEAR",
      }
    }
    const distanceMeters = Math.max(1, Math.round(nearest.distance * MAP_METERS_PER_UNIT))
    return {
      bunkerId: bunker.id,
      nearestEventId: nearest.event.id,
      tone: nearest.event.tone,
      distanceMeters,
      statusLabel: `${distanceMeters}m`,
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
