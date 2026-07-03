import { describe, expect, it } from "vitest"
import {
  ScenarioFixtureSchema,
  TrackSessionSchema,
  collectEventIds,
  validateTrackSessionTransitions,
} from "../domain"
import { syntheticDayScenario } from "./syntheticDay"

const REQUIRED_SCENARIOS = [
  "benign_patrol_adjacent_movement",
  "restricted_zone_loitering",
  "low_confidence_ambiguous_motion",
  "distance_band_50m_30m_10m",
  "road_camera_A_to_B_handoff",
  "ammo_depot_repeated_appearance",
] as const

describe("synthetic 24-hour scenario fixture", () => {
  it("parses deterministic cameras, groups, topology, events, citations, and reports", () => {
    // Given: the deterministic 24-hour scenario fixture.
    const parsed = ScenarioFixtureSchema.parse(syntheticDayScenario)

    // When: callers inspect core scenario shape.
    const eventIds = collectEventIds(parsed)
    const citationIds = parsed.reports.flatMap((report) =>
      report.citations.map((citation) => citation.citationId),
    )
    const eventTimes = parsed.timeline.map((event) => event.simTime)

    // Then: the fixture exposes the required surface for downstream harness tasks.
    expect(parsed.topology.cameras).toHaveLength(6)
    expect(parsed.topology.cameras.map((camera) => camera.cameraId)).toEqual([
      "camera-A",
      "camera-B",
      "camera-C",
      "camera-D",
      "camera-E",
      "camera-F",
    ])
    expect(parsed.observations.length).toBeGreaterThanOrEqual(12)
    expect(parsed.semanticEvents.length).toBeGreaterThanOrEqual(10)
    expect(new Set(eventIds).size).toBe(eventIds.length)
    expect(new Set(citationIds).size).toBe(citationIds.length)
    expect(eventTimes).toEqual([...eventTimes].sort())
    expect(parsed.scenarioLabels).toEqual(expect.arrayContaining(REQUIRED_SCENARIOS))
    expect(parsed.reportWindows.map((window) => window.windowType)).toEqual([
      "shift",
      "day",
      "week",
    ])
  })

  it("models topology adjacency, group membership, session transitions, and correlations", () => {
    // Given: the parsed 24-hour scenario.
    const parsed = ScenarioFixtureSchema.parse(syntheticDayScenario)

    // When: callers inspect correlation primitives.
    const roadGroup = parsed.sharedMemory.cameraGroups.find(
      (group) => group.groupId === "group-road",
    )
    const ammoGroup = parsed.sharedMemory.cameraGroups.find(
      (group) => group.groupId === "group-ammo-depot",
    )
    const handoffIncident = parsed.facilityIncidents.find(
      (incident) => incident.incidentId === "incident-road-handoff-001",
    )
    const ammoIncident = parsed.facilityIncidents.find(
      (incident) => incident.incidentId === "incident-ammo-repeat-001",
    )
    const roadSession = parsed.trackSessions.find(
      (session) => session.sessionId === "session-road-A-B-001",
    )

    // Then: multi-camera relationships are explicit and schema-backed.
    expect(parsed.topology.edges).toContainEqual({
      fromCameraId: "camera-A",
      toCameraId: "camera-B",
      relationship: "adjacent",
      coverageNote: "구역 Alpha blind-spot handoff",
    })
    expect(roadGroup?.cameraIds).toEqual(["camera-A", "camera-B"])
    expect(ammoGroup?.cameraIds).toEqual(["camera-C", "camera-D", "camera-E", "camera-F"])
    expect(roadSession?.stateHistory.map((entry) => entry.state)).toEqual([
      "candidate",
      "active_track",
      "incident_session",
      "agent_review_cycle",
      "resolved",
    ])
    expect(validateTrackSessionTransitions(roadSession ?? parsed.trackSessions[0])).toBe(true)
    expect(handoffIncident?.correlation.cameraIds).toEqual(["camera-A", "camera-B"])
    expect(ammoIncident?.correlation.cameraIds).toEqual([
      "camera-C",
      "camera-D",
      "camera-E",
      "camera-F",
    ])
  })

  it("captures distance-band changes and required scenario labels", () => {
    // Given: the parsed 24-hour scenario.
    const parsed = ScenarioFixtureSchema.parse(syntheticDayScenario)

    // When: callers read distance-band semantic events.
    const distanceBands = parsed.semanticEvents
      .filter((event) => event.eventType === "distance_band_change")
      .map((event) => event.distanceBand)

    // Then: the restricted-zone approach is deterministic and ordered.
    expect(distanceBands).toEqual(["50m", "30m", "10m"])
    expect(parsed.scenarioLabels).toEqual(expect.arrayContaining(REQUIRED_SCENARIOS))
  })

  it("rejects duplicate event ids", () => {
    // Given: a scenario with a duplicated observation event id.
    const duplicateEventScenario = {
      ...syntheticDayScenario,
      observations: [
        syntheticDayScenario.observations[0],
        {
          ...syntheticDayScenario.observations[1],
          eventId: syntheticDayScenario.observations[0].eventId,
        },
        ...syntheticDayScenario.observations.slice(2),
      ],
    }

    // When: the scenario is parsed.
    const result = ScenarioFixtureSchema.safeParse(duplicateEventScenario)

    // Then: schema validation rejects the malformed ledger.
    expect(result.success).toBe(false)
  })

  it("rejects invalid TrackSession state transitions", () => {
    // Given: a session that jumps directly from candidate to resolved.
    const invalidTransitionSession = {
      ...syntheticDayScenario.trackSessions[0],
      stateHistory: [
        syntheticDayScenario.trackSessions[0].stateHistory[0],
        {
          ...syntheticDayScenario.trackSessions[0].stateHistory[1],
          state: "resolved",
        },
      ],
    }

    // When: the session is parsed.
    const result = TrackSessionSchema.safeParse(invalidTransitionSession)

    // Then: lifecycle validation rejects the impossible transition.
    expect(result.success).toBe(false)
  })

  it("rejects handoff events without a camera topology edge", () => {
    // Given: a road handoff scenario with its A to B edge removed.
    const missingEdgeScenario = {
      ...syntheticDayScenario,
      topology: {
        ...syntheticDayScenario.topology,
        edges: syntheticDayScenario.topology.edges.filter(
          (edge) => edge.fromCameraId !== "camera-A" || edge.toCameraId !== "camera-B",
        ),
      },
    }

    // When: the scenario is parsed.
    const result = ScenarioFixtureSchema.safeParse(missingEdgeScenario)

    // Then: correlation validation rejects the missing topology.
    expect(result.success).toBe(false)
  })
})
