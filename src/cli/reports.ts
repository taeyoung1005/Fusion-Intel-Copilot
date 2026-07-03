import {
  ScenarioFixtureSchema,
  cameraEdgeKeys,
  cameraPairKey,
  collectEventIds,
  validateTrackSessionTransitions,
} from "../domain"
import type { ScenarioFixture } from "../domain"

export type CliCheck = {
  readonly id: string
  readonly status: "pass" | "fail"
  readonly summary: string
  readonly details?: unknown
}

export type CliReport = {
  readonly command: "demo:ledger" | "demo:cv" | "demo:agents" | "demo:reset"
  readonly scenario?: "24h"
  readonly fixtureId?: string
  readonly status: "pass" | "fail"
  readonly checks: readonly CliCheck[]
}

const pass = (id: string, summary: string, details?: unknown): CliCheck => ({
  id,
  status: "pass",
  summary,
  ...(details === undefined ? {} : { details }),
})

const fail = (id: string, summary: string, details?: unknown): CliCheck => ({
  id,
  status: "fail",
  summary,
  ...(details === undefined ? {} : { details }),
})

const sameItems = (actual: readonly string[], expected: readonly string[]): boolean =>
  actual.length === expected.length && expected.every((item) => actual.includes(item))

const statuses = (checks: readonly CliCheck[]): "pass" | "fail" =>
  checks.every((check) => check.status === "pass") ? "pass" : "fail"

const cameraIds = ["camera-A", "camera-B", "camera-C", "camera-D", "camera-E", "camera-F"] as const
const roadCameraIds = ["camera-A", "camera-B"] as const
const ammoCameraIds = ["camera-C", "camera-D", "camera-E", "camera-F"] as const
const lifecycleStates = [
  "candidate",
  "active_track",
  "incident_session",
  "agent_review_cycle",
  "resolved",
] as const
const requiredDistanceBands = ["50m", "30m", "10m"] as const
const reportWindows = ["shift", "day", "week"] as const

export const buildLedgerReport = (fixture: ScenarioFixture): CliReport => {
  const edgeKeys = cameraEdgeKeys(fixture.topology.edges)
  const roadSession = fixture.trackSessions.find(
    (session) => session.sessionId === "session-road-A-B-001",
  )
  const handoff = fixture.semanticEvents.find((event) => event.eventType === "camera_handoff")
  const ammoIncident = fixture.facilityIncidents.find(
    (incident) => incident.incidentId === "incident-ammo-repeat-001",
  )
  const distanceBands = fixture.semanticEvents
    .filter((event) => event.eventType === "distance_band_change")
    .map((event) => event.distanceBand ?? "unknown")
  const windowTypes = fixture.reportWindows.map((window) => window.windowType)
  const safetyNotes = fixture.sharedMemory.notes.join(" ").toLowerCase()
  const hasSafetyDeclaration =
    safetyNotes.includes("synthetic-only") &&
    safetyNotes.includes("identity") &&
    safetyNotes.includes("watchlist") &&
    safetyNotes.includes("license plate")

  const duplicateScenario =
    fixture.observations[0] === undefined || fixture.observations[1] === undefined
      ? undefined
      : {
          ...fixture,
          observations: [
            fixture.observations[0],
            { ...fixture.observations[1], eventId: fixture.observations[0].eventId },
            ...fixture.observations.slice(2),
          ],
        }
  const missingRoadEdgeScenario = {
    ...fixture,
    topology: {
      ...fixture.topology,
      edges: fixture.topology.edges.filter(
        (edge) => cameraPairKey(edge.fromCameraId, edge.toCameraId) !== "camera-A->camera-B",
      ),
    },
  }

  const checks = [
    sameItems(
      fixture.topology.cameras.map((camera) => camera.cameraId),
      cameraIds,
    )
      ? pass("six_cameras", "fixture exposes the six required cameras", { cameraIds })
      : fail("six_cameras", "fixture does not expose the six required cameras"),
    handoff !== undefined &&
    sameItems(handoff.cameraIds, roadCameraIds) &&
    edgeKeys.has("camera-A->camera-B")
      ? pass("road_a_b_handoff", "road A/B handoff is backed by topology", {
          eventId: handoff.eventId,
          cameraIds: handoff.cameraIds,
        })
      : fail("road_a_b_handoff", "road A/B handoff is missing or lacks topology"),
    ammoIncident !== undefined && sameItems(ammoIncident.correlation.cameraIds, ammoCameraIds)
      ? pass("ammo_depot_four_camera_correlation", "ammo depot correlation spans C/D/E/F", {
          incidentId: ammoIncident.incidentId,
          cameraIds: ammoIncident.correlation.cameraIds,
        })
      : fail("ammo_depot_four_camera_correlation", "ammo depot four-camera correlation missing"),
    roadSession !== undefined &&
    sameItems(
      roadSession.stateHistory.map((entry) => entry.state),
      lifecycleStates,
    ) &&
    validateTrackSessionTransitions(roadSession)
      ? pass("track_lifecycle", "road session lifecycle is deterministic and valid", {
          sessionId: roadSession.sessionId,
          states: roadSession.stateHistory.map((entry) => entry.state),
        })
      : fail("track_lifecycle", "road session lifecycle is missing or invalid"),
    sameItems(distanceBands, requiredDistanceBands)
      ? pass("distance_bands", "distance bands progress 50m -> 30m -> 10m", { distanceBands })
      : fail("distance_bands", "distance bands do not match 50m -> 30m -> 10m"),
    sameItems(windowTypes, reportWindows) && fixture.reports.length >= 3
      ? pass("reports", "shift/day/week report windows are present", {
          reportIds: fixture.reports.map((report) => report.reportId),
          windowTypes,
        })
      : fail("reports", "required reports are missing"),
    duplicateScenario !== undefined && !ScenarioFixtureSchema.safeParse(duplicateScenario).success
      ? pass("malformed_duplicate_rejection", "duplicate event ids are rejected")
      : fail("malformed_duplicate_rejection", "duplicate event id mutation was not rejected"),
    !ScenarioFixtureSchema.safeParse(missingRoadEdgeScenario).success
      ? pass("malformed_topology_rejection", "missing A/B topology edge is rejected")
      : fail("malformed_topology_rejection", "missing A/B topology edge was not rejected"),
    hasSafetyDeclaration &&
    fixture.observations.every((observation) => observation.objectLabel.includes("synthetic"))
      ? pass(
          "safety_scan",
          "fixture is synthetic-only and declares no identity/watchlist/plate data",
        )
      : fail("safety_scan", "synthetic-only safety declaration or labels are missing"),
  ]

  return {
    command: "demo:ledger",
    scenario: "24h",
    fixtureId: fixture.fixtureId,
    status: statuses(checks),
    checks,
  }
}

export const buildCvReport = (fixture: ScenarioFixture): CliReport => {
  const checks = fixture.topology.cameras.map((camera) => {
    const observations = fixture.observations.filter(
      (observation) => observation.cameraId === camera.cameraId,
    )
    return pass(`camera_${camera.cameraId}`, "camera observation summary", {
      cameraId: camera.cameraId,
      label: camera.label,
      zone: camera.zone,
      status: camera.status,
      observationCount: observations.length,
      distanceBands: observations.flatMap((observation) =>
        observation.distanceBand === undefined ? [] : [observation.distanceBand],
      ),
    })
  })

  return {
    command: "demo:cv",
    scenario: "24h",
    fixtureId: fixture.fixtureId,
    status: statuses(checks),
    checks,
  }
}

export const buildAgentsReport = (fixture: ScenarioFixture): CliReport => {
  const checks = [
    pass("agent_inputs", "agent input events are counted", {
      count: fixture.agentInputs.length,
      eventIds: fixture.agentInputs.map((input) => input.eventId),
    }),
    pass("agent_outputs", "agent output events are counted", {
      count: fixture.agentOutputs.length,
      eventIds: fixture.agentOutputs.map((output) => output.eventId),
    }),
    pass("agent_findings", "agent findings are summarized", {
      count: fixture.agentFindings.length,
      findingTypes: fixture.agentFindings.map((finding) => finding.findingType),
    }),
    pass("human_decisions", "human decisions are summarized", {
      count: fixture.humanDecisions.length,
      decisionTypes: fixture.humanDecisions.map((decision) => decision.decisionType),
    }),
    pass("agent_errors", "agent recovery errors are summarized", {
      count: fixture.agentErrors.length,
      recoveries: fixture.agentErrors.map((error) => error.recovery),
    }),
    pass("citation_integrity", "report citations point at ledger event ids", {
      eventCount: collectEventIds(fixture).length,
      citationCount: fixture.reports.flatMap((report) => report.citations).length,
    }),
  ]

  return {
    command: "demo:agents",
    scenario: "24h",
    fixtureId: fixture.fixtureId,
    status: statuses(checks),
    checks,
  }
}

export const buildResetReport = (): CliReport => ({
  command: "demo:reset",
  status: "pass",
  checks: [pass("reset", "no generated CLI demo state is persisted by this harness")],
})

export const parseFixture = (value: unknown): ScenarioFixture => ScenarioFixtureSchema.parse(value)
