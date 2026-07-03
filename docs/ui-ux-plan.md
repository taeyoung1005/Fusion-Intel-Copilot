# D4D Perimeter AI Harness UI/UX Plan

This plan implements the `DESIGN.md` baseline for a dense operations COP. It defines the screen map and operator journey before UI implementation. The product uses synthetic perimeter CCTV feeds only and must not present real military data, identity recognition, targeting, firing, or autonomous-force concepts in product UI.

## Screen Map

### Live Guard COP

Purpose: the default first screen for one operator supervising many synthetic feeds.

Primary regions:
- Top command bar: system state, exercise clock, mode switcher, current operator, and global search.
- Camera wall: stable 16:9 feed panels with status, confidence, camera id, and latest evidence chip.
- Alert ladder: Normal, Watch, Warn, Critical, and Uncertain states with text labels and non-color cues.
- Incident queue: sorted active incidents with time, camera, severity, and 판단 불충분 flags.
- Response gates: compact gate status for the selected incident.
- Command log: immutable visible record of operator acknowledgments and state transitions.

Primary success: an operator can see 경계 state, identify which feed changed, inspect why, and enter the right response mode without losing the camera wall.

### Incident Review

Purpose: turn a selected alert into a reviewable evidence packet.

Primary regions:
- Incident header: incident id, ladder state, confidence, time window, and selected synthetic cameras.
- Evidence strip: stills, clips, event markers, and missing-context markers.
- Timeline: ordered observations, model rationale, operator notes, and response events.
- Evidence Packet preview: export layout with citations and unresolved caveats.
- Packet controls: mark reviewed, add note, request more context, export when allowed.

Primary success: the operator can distinguish evidence from inference and cannot miss 판단 불충분 when context is weak.

### Response Confirmation

Purpose: complete the human-in-the-loop 수하 Procedure before any response is logged.

Primary regions:
- Selected incident summary: evidence, current alert state, and confidence.
- 수하 Procedure checklist: review evidence, attempt challenge/contact, record result, request supervisor when required, select disposition.
- Gate panel: required fields, disabled/focus/loading/error states, and final confirmation control.
- Communication log: attempt time, channel, operator note, and result.

Primary success: final confirmation is impossible until all required human confirmation gates are satisfied.

### Commander Reports

Purpose: query simulated incidents and generate command-ready reports with citations.

Primary regions:
- Query builder: time range, camera set, severity, unresolved-only filter, and free-text query.
- Report body: summary, timeline, per-camera findings, response actions, 판단 불충분 items, and appendix citations.
- Evidence citations: event ids and camera ids remain visible beside each claim.
- Export preview: packet/report output and blocked state when required evidence is incomplete.

Primary success: a commander-facing answer is traceable to evidence and visibly separates facts, operator notes, and uncertainty.

### AAR Playback

Purpose: optional after-action reconstruction.

Primary regions:
- Playback timeline: speed, pause, step, and event jump controls.
- Camera replay: synchronized synthetic feeds.
- Decision overlay: alert ladder changes, 수하 Procedure timestamps, and operator notes.
- Lessons panel: findings, unresolved items, and report links.

Primary success: users can replay what changed, what was known, and which human decisions occurred.

## Operator Journey

1. 경계 monitoring starts in Live Guard COP with all feeds stable and the incident queue empty or low priority.
2. A synthetic feed enters Watch or Warn. The alert ladder updates, the camera panel shows a reason, and the queue adds a selectable incident.
3. The operator opens Incident Review. Evidence, confidence, missing context, and 판단 불충분 are shown before any response action.
4. If response is required, the operator enters Response Confirmation and completes the 수하 Procedure gates.
5. The final disposition is logged with evidence citations and visible operator notes.
6. Commander Reports can query the event later, generate a report, and preserve all caveats.
7. AAR playback can reconstruct the incident for training and evaluation.

## Alert Ladder

| Level | UI Meaning | Interrupts Operator | Required Action |
| --- | --- | --- | --- |
| Normal | 경계 maintained | No | Continue monitoring |
| Watch | Weak signal or pattern change | No | Keep visible in queue |
| Warn | Review threshold crossed | Yes, non-modal | Inspect Incident Review |
| Critical | Confirmed simulated high-risk condition | Yes, sticky | Complete Response Confirmation |
| Uncertain | 판단 불충분 | Contextual | Show missing evidence and block conclusions |

Rules:
- State must be communicated by text, icon, and placement, not color alone.
- Uncertain can coexist with Watch, Warn, or Critical and must remain visible in headers, packets, and reports.
- Alerts describe observations and procedure state. They do not identify people or suggest force.

## State Matrix

| Surface | Default | Hover | Focus | Disabled | Loading | Empty | Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Camera panel | Feed, camera id, status, confidence | Border lift and controls visible | 2px focus ring on actions | Controls muted, feed remains readable | Skeleton preserving 16:9 | No synthetic feed assigned | Feed unavailable with retry |
| Incident row | Severity, time, camera, evidence count | Row contrast increases | Keyboard selection ring | Archived or blocked state dimmed | Placeholder rows | No active incidents | Queue unavailable |
| Evidence Packet | Header, stills, timeline, citations | Citation affordances reveal | Focus order follows packet layout | Export disabled until gates pass | Packet skeleton | No evidence for filters | Export or load failure |
| Response gate | Gate label and status | Help text/action affordance | Focus ring and visible description | Final action blocked until required gates pass | Submitting state with retained fields | No selected incident | Validation message and recovery |
| Report query | Filters and prompt input | Control border contrast | Visible label and focus ring | Export blocked when evidence incomplete | Generating report | No matching simulated events | Retry, preserve query |

## Response Gates

Response Confirmation must enforce these gates:
- Evidence reviewed: operator opened the Incident Review evidence packet.
- 수하 attempted or marked not possible: result and reason are recorded.
- 판단 불충분 resolved or acknowledged: missing-context caveat remains in final log.
- Escalation note: required for Critical or unresolved Uncertain states.
- Final disposition: selected from approved non-force outcomes such as continue monitoring, request human patrol confirmation, mark false alarm, or escalate for supervisor review.

Binary observable for UI implementation: the final confirmation control is disabled until all gates pass, and each disabled reason is visible.

## Evidence Packet Layout

Order:
1. Incident header: id, time window, alert level, confidence, and 판단 불충분 if present.
2. Evidence media: stills/clips from synthetic CCTV with camera ids and timestamps.
3. Timeline: observation entries, operator notes, 수하 Procedure events, and state changes.
4. Rationale: concise model rationale with confidence and missing evidence.
5. Response history: acknowledgments, escalation notes, and final disposition.
6. Export footer: citation list, generated timestamp, and safety disclaimer.

The packet must fit the 1440x900 desktop workflow without pushing export status below the fold. At 390x844, it becomes a single-column packet with sticky incident header and persistent return to Live Guard COP.

## Commander Report Layout

Order:
1. Query summary and reporting window.
2. Executive summary with cited event ids.
3. Timeline table.
4. Per-camera findings.
5. Response actions and 수하 Procedure outcomes.
6. 판단 불충분 and unresolved items.
7. Appendix citations and export metadata.

Report text must use Korean-friendly wrapping from `DESIGN.md`: `word-break: keep-all` for prose and `overflow-wrap: anywhere` for long machine ids.

## Responsive Visual QA Targets

Required viewports:
- 390x844: mobile operator view, no horizontal scroll, sticky critical alert context, single selected work item visible.
- 768x1024: tablet view, two-column operating posture, no clipped Korean labels.
- 1440x900: desktop COP, camera wall plus evidence/response/queue visible in one scan path.

Screenshot evidence expectations:
- Capture Live Guard COP at all three viewports.
- Capture Incident Review at all three viewports with a 판단 불충분 packet.
- Capture Response Confirmation at all three viewports with 수하 Procedure gates disabled and then enabled.
- Capture Commander Reports at all three viewports with a cited report and an empty-query state.
- Optional AAR playback screenshots should include paused, playing, and event-jump states.

## Copy And Language Rules

- Use concise operational copy. Avoid marketing claims, decorative analytics phrasing, and arcade terms.
- Korean labels must be short enough for narrow controls: 경계, 수하, 판단 불충분, 확인 필요, 보고.
- Longer Korean explanations belong in detail panels or report prose, not in dense chips.
- Product UI must never mention real deployments, identity recognition, targeting, firing, or autonomous force.
- Synthetic data disclaimers appear in packet/report metadata, not as a blocking modal.
