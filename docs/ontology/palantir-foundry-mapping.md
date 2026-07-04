# D4D Local Ontology → Palantir Foundry Mapping

Status note (read first): `src/ontology/contracts.ts` (plan Todo 1) is not present
in this repository at the time this document was written. The object/link/action
names below are taken verbatim from the Scope section of
`.omo/plans/palantir-ready-ontology.md` (the single source of truth for naming),
so the table is accurate and stable regardless of whether Todo 1-5 have landed
yet. Once `src/ontology/contracts.ts` exists, its exported schema names MUST
match this table exactly; if they ever diverge, this document should be updated
in the same change.

This document maps D4D's local, Palantir-adjacent ontology model to the object
types, link types, and action types a future Foundry Ontology would expose
through the Ontology SDK (OSDK). Today none of this is connected to Foundry:
there is no Foundry enrollment, no Developer Console app, and no generated
OSDK client in this repository. Every "Foundry" column below describes a
**planned future name**, not a live resource.

References:
- Palantir Ontology basics: https://www.palantir.com/docs/foundry/api/ontology-resources/ontologies/ontology-basics/
- Palantir OSDK overview: https://www.palantir.com/docs/foundry/ontology-sdk/overview/
- Palantir Getting Started: https://www.palantir.com/docs/foundry/getting-started/overview/
- Palantir Action Types overview: https://www.palantir.com/docs/foundry/action-types/overview/

## How to read the status columns

- **Local status** — whether the D4D-local TypeScript representation of this
  concept exists in the repository today.
  - `implemented (pre-ontology)` — the concept already exists as a plain
    TypeScript/Zod type in `src/domain/**` or `src/cop/**`, used by the live
    demo, but has not yet been re-expressed as a branded ontology object under
    `src/ontology/`.
  - `planned (ontology module not yet in repo)` — `src/ontology/contracts.ts`
    and related modules from plan Todos 1-5 have not landed yet; this row is
    scoped/named but not yet built as an ontology contract.
- **Foundry status** — always `deferred until Foundry enrollment`. No object
  type, link type, or action type in this document is backed by a real Foundry
  Ontology, OSDK client, or network call. Names are proposals for a future
  Developer Console app.

## Object types (12)

| Local ontology object | Primary key | Key properties | Source file(s) | Future Foundry object type | Local status | Foundry status |
| --- | --- | --- | --- | --- | --- | --- |
| `Sensor` | `cameraId` | `label`, `zone`, `status`, `coverageNote` | `src/domain/topology.ts` (`CameraSchema`) | `PerimeterSensor` | implemented (pre-ontology) as `Camera`; not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `SensorGroup` | `groupId` | `label`, `cameraIds`, `purpose` | `src/domain/topology.ts` (`CameraGroupSchema`) | `PerimeterSensorGroup` | implemented (pre-ontology) as `CameraGroup`; not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `Observation` | `eventId` | `simTime`, `cameraId`, `trackId`, `objectLabel`, `confidence`, `distanceBand` | `src/domain/events.ts` (`ObservationSchema`) | `SensorObservation` | implemented (pre-ontology); not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `Track` | `trackId` | `cameraId`, `firstSeen`, `lastSeen`, `confidence`, `observationEventIds` | `src/domain/track.ts` (`TrackSchema`) | `SubjectTrack` | implemented (pre-ontology); not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `TrackSession` | `sessionId` | `trackIds`, `cameraIds`, `currentStage`, `stateHistory` | `src/domain/track.ts` (`TrackSessionSchema`) | `TrackSession` | implemented (pre-ontology); not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `Incident` | `id` | `tone`, `zone`, `title`, `meta`, `time`, `confidence` | `src/cop/copAnalysisData.ts` (`Incident`) | `PerimeterIncident` | implemented (pre-ontology); not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `EvidenceClip` | `id` | `time`, `camera`, `tone`, `source`, `confidencePct`, `frameDataUrl` | `src/cop/copTimelineData.ts` (`EvidenceClip`) | `IncidentEvidenceClip` | implemented (pre-ontology); not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `Citation` | `id` | `label`, `time` | `src/cop/copAnalysisData.ts` (`Citation`) | `IncidentCitation` | implemented (pre-ontology); not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `Assessment` | `id` (planned) | `incidentId`, `decisionTitle`, `summary`, `recommendedAction`, `checkpoint` | `src/cop/codexAgentClient.ts` (`CodexAgentDecision`) | `IncidentAssessment` | planned (ontology module not yet in repo); today only the pre-ontology `CodexAgentDecision` shape exists | deferred until Foundry enrollment |
| `ResponseGate` | `id` | `label`, `initial` | `src/cop/copAnalysisData.ts` (`ResponseGate`) | `ResponseGate` | implemented (pre-ontology); not yet re-expressed under `src/ontology/` | deferred until Foundry enrollment |
| `CommanderReport` | `id` (planned) | `title`, `subtitle`, `date`, `period`, `rows` | `src/cop/copAnalysisData.ts` (`DAILY_REPORT`) | `CommanderSituationReport` | planned (ontology module not yet in repo); today only the pre-ontology `DAILY_REPORT` constant exists | deferred until Foundry enrollment |
| `Asset` | `cameraId` (reused) | `label`, `zone`, `status` | `src/domain/topology.ts` (`CameraSchema`, as the physical camera asset) | `PerimeterAsset` | planned (ontology module not yet in repo); no distinct local `Asset` type exists yet, currently folded into `Camera` | deferred until Foundry enrollment |

## Link types (7)

| Local ontology link | From → To | Cardinality | Source file(s) | Future Foundry link type | Local status | Foundry status |
| --- | --- | --- | --- | --- | --- | --- |
| `sensor_observed_observation` | `Sensor` → `Observation` | one-to-many | `src/domain/events.ts` (`ObservationSchema.cameraId`) | `sensorObservedObservation` | implemented (pre-ontology) as an implicit foreign key; not yet a first-class link object under `src/ontology/` | deferred until Foundry enrollment |
| `observation_supports_track` | `Observation` → `Track` | many-to-one | `src/domain/track.ts` (`TrackSchema.observationEventIds`) | `observationSupportsTrack` | implemented (pre-ontology) as an implicit foreign key; not yet a first-class link object under `src/ontology/` | deferred until Foundry enrollment |
| `track_raised_incident` | `Track` → `Incident` | many-to-one | `src/cop/relationshipGraph.ts` (`camera-track` / `track-detection` edges) | `trackRaisedIncident` | implemented (pre-ontology) inside `buildEvidenceRelationshipGraph`; not yet a first-class link object under `src/ontology/` | deferred until Foundry enrollment |
| `incident_has_evidence` | `Incident` → `EvidenceClip` | one-to-many | `src/cop/relationshipGraph.ts` (`track-detection` edge) | `incidentHasEvidence` | implemented (pre-ontology) inside `buildEvidenceRelationshipGraph`; not yet a first-class link object under `src/ontology/` | deferred until Foundry enrollment |
| `incident_has_assessment` | `Incident` → `Assessment` | one-to-many | `src/cop/codexAgentClient.ts` (`CodexAgentContext.incident`) | `incidentHasAssessment` | planned (ontology module not yet in repo); today the association is implicit via `CodexAgentContext` | deferred until Foundry enrollment |
| `incident_has_response_gate` | `Incident` → `ResponseGate` | one-to-many | `src/cop/relationshipGraph.ts` (`incident-response` edge) | `incidentHasResponseGate` | implemented (pre-ontology) inside `buildEvidenceRelationshipGraph`; not yet a first-class link object under `src/ontology/` | deferred until Foundry enrollment |
| `report_summarizes_incident` | `CommanderReport` → `Incident` | many-to-many | `src/cop/copAnalysisData.ts` (`DAILY_REPORT.rows`, `INCIDENTS`) | `reportSummarizesIncident` | planned (ontology module not yet in repo); today the association is implicit — the daily report rows aggregate incident counts without a modeled link | deferred until Foundry enrollment |

## Action types (3)

| Local ontology action | Primary input keys | Output | Source file(s) | Future Foundry action type | Local status | Foundry status |
| --- | --- | --- | --- | --- | --- | --- |
| `recordAssessment` | `incidentId`, `decision` (title/summary/recommendedAction/checkpoint), `citations` | `Assessment` object | `src/cop/codexAgentClient.ts` (`requestCodexAgent`, `CodexAgentDecision`) | `record-assessment` | planned (ontology module not yet in repo); today this is a network call to `/api/codex-agent`, not a local pure action | deferred until Foundry enrollment |
| `submitResponseGate` | `responseGateId`, `incidentId`, transition to `PASS`/`PENDING` | updated `ResponseGate` object | `src/cop/copAnalysisData.ts` (`ResponseGate`, `RESPONSE_GATES`) | `submit-response-gate` | planned (ontology module not yet in repo); today gate state is a static fixture with no local action/reducer | deferred until Foundry enrollment |
| `generateCommanderReport` | `windowType`, `startsAt`, `endsAt`, `incidentIds` | `CommanderReport` object | `src/cop/copAnalysisData.ts` (`DAILY_REPORT`), `src/domain/scenario.ts` (`ReportWindowSchema`) | `generate-commander-report` | planned (ontology module not yet in repo); today the report is a static fixture with no local action/builder | deferred until Foundry enrollment |

## Explicit non-claims

- This repository does **not** connect to any Foundry tenant. There is no
  environment-specific Foundry hostname, no OAuth client, no API credential,
  and no `@osdk/*` dependency anywhere in this codebase.
- Nothing described as "Foundry object type", "Foundry link type", or
  "Foundry action type" above is live or callable. These are naming proposals
  for a future Developer Console app, to be created only after a real Palantir
  Foundry enrollment exists.
- The current D4D demo runs entirely on local, in-repo data (`src/fixtures/**`,
  `src/domain/**`, `src/cop/**`) and does not depend on Palantir access to
  function.
