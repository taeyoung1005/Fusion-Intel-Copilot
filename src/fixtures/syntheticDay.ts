import { ScenarioFixtureSchema } from "../domain"
import {
  syntheticDayObservations,
  syntheticDaySemanticEvents,
} from "./syntheticDayEvents"
import {
  syntheticDayAgentErrors,
  syntheticDayAgentFindings,
  syntheticDayAgentInputs,
  syntheticDayAgentOutputs,
  syntheticDayFacilityIncidents,
  syntheticDayHumanDecisions,
  syntheticDayReportWindows,
  syntheticDayReports,
} from "./syntheticDayReviews"
import { syntheticDayCameraGroups, syntheticDayTopology } from "./syntheticDayTopology"
import { syntheticDayTracks, syntheticDayTrackSessions } from "./syntheticDayTracks"

export const syntheticDayScenario = ScenarioFixtureSchema.parse({
  fixtureId: "scenario-synthetic-24h-wave-1-4",
  generatedAt: "2026-06-29T00:00:00.000Z",
  scenarioLabels: [
    "benign_patrol_adjacent_movement",
    "restricted_zone_loitering",
    "low_confidence_ambiguous_motion",
    "distance_band_50m_30m_10m",
    "road_camera_A_to_B_handoff",
    "ammo_depot_repeated_appearance",
  ],
  topology: syntheticDayTopology,
  sharedMemory: {
    cameraGroups: syntheticDayCameraGroups,
    activeTrackSessionIds: [],
    incidentIds: ["incident-road-handoff-001", "incident-ammo-repeat-001"],
    notes: ["Synthetic-only scenario: no real identity, watchlist, or license plate data."],
    metadata: {
      safetyBoundary:
        "Human-confirmed visualization only; excludes targeting, firing, and autonomous force decisions.",
    },
  },
  observations: syntheticDayObservations,
  tracks: syntheticDayTracks,
  trackSessions: syntheticDayTrackSessions,
  semanticEvents: syntheticDaySemanticEvents,
  agentInputs: syntheticDayAgentInputs,
  agentOutputs: syntheticDayAgentOutputs,
  agentFindings: syntheticDayAgentFindings,
  humanDecisions: syntheticDayHumanDecisions,
  facilityIncidents: syntheticDayFacilityIncidents,
  corrections: [],
  agentErrors: syntheticDayAgentErrors,
  reports: syntheticDayReports,
  reportWindows: syntheticDayReportWindows,
  timeline: syntheticDaySemanticEvents,
  metadata: {
    fixtureKind: "deterministic-synthetic-24h",
    wave: "1.4",
  },
})
