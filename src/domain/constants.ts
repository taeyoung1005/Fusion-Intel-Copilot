export const CAMERA_IDS = [
  "camera-A",
  "camera-B",
  "camera-C",
  "camera-D",
  "camera-E",
  "camera-F",
] as const

export const CAMERA_GROUP_IDS = ["group-road", "group-ammo-depot"] as const

export const ALERT_STAGES = [
  "info",
  "watch",
  "caution",
  "warning",
  "commander_review",
] as const

export const CAMERA_ZONES = ["구역 Alpha", "구역 Bravo", "탄약고 구역"] as const

export const DISTANCE_BANDS = ["50m", "30m", "10m", "unknown"] as const

export const TRACK_SESSION_STATES = [
  "candidate",
  "active_track",
  "incident_session",
  "agent_review_cycle",
  "resolved",
  "closed",
] as const

export const SEMANTIC_EVENT_TYPES = [
  "candidate_opened",
  "active_track_started",
  "restricted_zone_approach",
  "loitering_detected",
  "low_confidence_motion",
  "distance_band_change",
  "camera_handoff",
  "repeated_appearance",
  "agent_review_requested",
  "human_decision_recorded",
  "report_generated",
] as const

export const REPORT_WINDOW_TYPES = ["shift", "day", "week"] as const

export const SCENARIO_LABELS = [
  "benign_patrol_adjacent_movement",
  "restricted_zone_loitering",
  "low_confidence_ambiguous_motion",
  "distance_band_50m_30m_10m",
  "road_camera_A_to_B_handoff",
  "ammo_depot_repeated_appearance",
] as const
