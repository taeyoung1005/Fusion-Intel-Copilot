import { syntheticDayCitations } from "./syntheticDayEvents"

const roadFinding = {
  eventId: "agent-finding-road-001",
  simTime: "2026-06-29T08:06:00.000Z",
  agentId: "agent-correlation-001",
  findingType: "needs_human_review",
  confidence: 0.84,
  rationale: "A/B handoff is topology-backed and remains synthetic review-only.",
  citations: [{ ...syntheticDayCitations.roadHandoff, summary: "Road A/B handoff event." }],
} as const

const depotFinding = {
  eventId: "agent-finding-depot-001",
  simTime: "2026-06-29T12:32:00.000Z",
  agentId: "agent-correlation-001",
  findingType: "suspicious",
  confidence: 0.86,
  rationale: "Repeated C/D/E/F appearances and distance-band changes require human review.",
  citations: [
    { ...syntheticDayCitations.depotRepeat, summary: "Depot repeated appearance event." },
    { ...syntheticDayCitations.distance10m, summary: "Closest synthetic distance band." },
  ],
} as const

export const syntheticDayAgentInputs = [
  {
    eventId: "agent-input-road-001",
    simTime: "2026-06-29T08:05:30.000Z",
    agentId: "agent-correlation-001",
    trackSessionId: "session-road-A-B-001",
    promptLabel: "road-handoff-correlation",
    evidenceEventIds: ["evt-road-handoff", "evt-road-review"],
  },
  {
    eventId: "agent-input-depot-001",
    simTime: "2026-06-29T12:31:00.000Z",
    agentId: "agent-correlation-001",
    trackSessionId: "session-depot-CDEF-001",
    promptLabel: "depot-repeat-correlation",
    evidenceEventIds: [
      "evt-distance-50m",
      "evt-distance-30m",
      "evt-distance-10m",
      "evt-depot-repeat",
    ],
  },
] as const

export const syntheticDayAgentFindings = [roadFinding, depotFinding] as const

export const syntheticDayAgentOutputs = [
  {
    eventId: "agent-output-road-001",
    simTime: "2026-06-29T08:06:30.000Z",
    agentId: "agent-correlation-001",
    finding: roadFinding,
    recommendedStage: "commander_review",
    citations: roadFinding.citations,
  },
  {
    eventId: "agent-output-depot-001",
    simTime: "2026-06-29T12:33:00.000Z",
    agentId: "agent-correlation-001",
    finding: depotFinding,
    recommendedStage: "commander_review",
    citations: depotFinding.citations,
  },
] as const

export const syntheticDayHumanDecisions = [
  {
    eventId: "human-road-001",
    simTime: "2026-06-29T08:20:00.000Z",
    decisionType: "resolve",
    operatorRole: "shift reviewer",
    rationale: "Resolved as benign synthetic patrol handoff after human confirmation.",
    citations: [{ ...syntheticDayCitations.roadHandoff, summary: "Road A/B handoff citation." }],
  },
  {
    eventId: "human-visual-001",
    simTime: "2026-06-29T12:45:00.000Z",
    decisionType: "acknowledge",
    operatorRole: "commander reviewer",
    rationale: "Simulated 수하/경고 is a human-confirmed visualization only.",
    citations: [{ ...syntheticDayCitations.humanVisual, summary: "Human visualization decision." }],
  },
] as const

export const syntheticDayFacilityIncidents = [
  {
    incidentId: "incident-road-handoff-001",
    openedAt: "2026-06-29T08:00:00.000Z",
    closedAt: "2026-06-29T08:20:00.000Z",
    stage: "commander_review",
    correlation: {
      cameraIds: ["camera-A", "camera-B"],
      trackSessionIds: ["session-road-A-B-001"],
      eventIds: ["evt-road-handoff", "evt-road-review", "human-road-001"],
      rationale: "A/B handoff follows the configured Alpha road topology edge.",
    },
    summary: "Synthetic road handoff incident.",
  },
  {
    incidentId: "incident-ammo-repeat-001",
    openedAt: "2026-06-29T03:35:00.000Z",
    closedAt: "2026-06-29T12:45:00.000Z",
    stage: "commander_review",
    correlation: {
      cameraIds: ["camera-C", "camera-D", "camera-E", "camera-F"],
      trackSessionIds: ["session-depot-CDEF-001"],
      eventIds: ["evt-distance-10m", "evt-depot-repeat", "human-visual-001"],
      rationale: "C/D/E/F repeated appearance follows the configured depot topology chain.",
    },
    summary: "Synthetic depot repeated-appearance incident.",
  },
] as const

export const syntheticDayAgentErrors = [
  {
    eventId: "error-low-confidence-001",
    simTime: "2026-06-29T04:11:00.000Z",
    agentId: "agent-correlation-001",
    errorType: "low_confidence",
    recovery: "human_review",
    summary: "Low-confidence synthetic motion was routed to human review.",
  },
] as const

export const syntheticDayReports = [
  {
    reportId: "report-shift-001",
    eventId: "report-event-shift",
    windowType: "shift",
    generatedAt: "2026-06-29T08:30:00.000Z",
    title: "Synthetic shift report",
    summary: "Shift report covers the topology-backed road handoff.",
    citations: [{ ...syntheticDayCitations.reportShift, summary: "Shift report event." }],
  },
  {
    reportId: "report-day-001",
    eventId: "report-event-day",
    windowType: "day",
    generatedAt: "2026-06-29T23:59:00.000Z",
    title: "Synthetic day report",
    summary: "Day report covers distance bands, loitering, low confidence, and depot repeat.",
    citations: [{ ...syntheticDayCitations.reportDay, summary: "Day report event." }],
  },
  {
    reportId: "report-week-001",
    eventId: "report-event-week",
    windowType: "week",
    generatedAt: "2026-06-29T23:59:30.000Z",
    title: "Synthetic week report",
    summary: "Week report aggregates this deterministic 24-hour fixture for regression tests.",
    citations: [{ ...syntheticDayCitations.reportWeek, summary: "Week report event." }],
  },
] as const

export const syntheticDayReportWindows = [
  {
    windowType: "shift",
    startsAt: "2026-06-29T00:00:00.000Z",
    endsAt: "2026-06-29T08:00:00.000Z",
    reportId: "report-shift-001",
  },
  {
    windowType: "day",
    startsAt: "2026-06-29T00:00:00.000Z",
    endsAt: "2026-06-29T23:59:59.000Z",
    reportId: "report-day-001",
  },
  {
    windowType: "week",
    startsAt: "2026-06-23T00:00:00.000Z",
    endsAt: "2026-06-29T23:59:59.000Z",
    reportId: "report-week-001",
  },
] as const
