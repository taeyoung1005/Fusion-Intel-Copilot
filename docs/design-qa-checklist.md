# D4D Design QA Checklist

Use this checklist before UI implementation and again before declaring any UI work complete. All visual checks trace back to `DESIGN.md` and `docs/ui-ux-plan.md`.

## Baseline Coverage

- [ ] DESIGN source of truth exists and includes atmosphere, color, typography, spacing, components, motion, depth, required modes, and safety posture.
- [ ] UI plan covers Live Guard COP, Incident Review, Response Confirmation, Commander Reports, and optional AAR playback.
- [ ] No landing page, marketing hero, arcade treatment, decorative analytics dashboard, or purple gradient SaaS styling is introduced.
- [ ] Product UI copy uses synthetic perimeter CCTV framing and avoids real military data, identity recognition, targeting, firing, and autonomous-force language.

## Screen Mode Checks

### Live Guard COP

- [ ] Camera wall, alert ladder, incident queue, response gates, and command log are visible or reachable.
- [ ] 경계 state is clear in normal operation.
- [ ] At least three feed panels are visible at 1440x900.
- [ ] No critical alert context disappears when switching panels.

### Incident Review

- [ ] Evidence Packet shows incident id, time window, cameras, confidence, evidence stills/clips, timeline, rationale, operator notes, and citations.
- [ ] 판단 불충분 is visible in the packet header, timeline, and summary when context is weak.
- [ ] Evidence and inference are visually separated.
- [ ] Export is disabled when required evidence or response gates are incomplete.

### Response Confirmation

- [ ] 수하 Procedure gates are visible in order.
- [ ] Final confirmation remains disabled until all required gates pass.
- [ ] Disabled reasons are visible and keyboard reachable.
- [ ] Submitting/loading and validation error states retain operator-entered notes.

### Commander Reports

- [ ] Report layout includes query summary, executive summary, timeline, per-camera findings, response actions, 판단 불충분 items, and appendix citations.
- [ ] Every report claim can show cited event ids.
- [ ] Empty query results offer reset or filter adjustment.
- [ ] Report generation errors preserve query inputs and offer retry.

### AAR Playback

- [ ] Playback has paused, playing, scrub, jump-to-event, and speed states if implemented.
- [ ] Alert ladder changes and 수하 Procedure decisions remain synchronized with replay time.
- [ ] Lessons and unresolved items link back to evidence packets or reports.

## Alert Ladder

- [ ] Normal maps to 경계 maintained.
- [ ] Watch is visible but non-interruptive.
- [ ] Warn interrupts without blocking the whole COP.
- [ ] Critical is sticky until Response Confirmation is addressed.
- [ ] Uncertain uses 판단 불충분 and clearly states missing evidence.
- [ ] Status is never color-only.

## Interaction State Matrix

- [ ] Camera panels have default, hover, focus, disabled, loading, empty, and error states.
- [ ] Incident rows have default, hover, focus, disabled/archived, loading, empty, and error states.
- [ ] Evidence Packet has loading, empty, incomplete, export-disabled, export-ready, and export-error states.
- [ ] Response gates have default, hover/help, focus, disabled, loading/submitting, validation error, and complete states.
- [ ] Report query has default, hover, focus, disabled, loading, empty, and error states.
- [ ] Focus order follows the operating flow: mode, queue/feed, evidence, response gate, log/export.

## Responsive Visual QA

Required screenshot set:
- [ ] 390x844 Live Guard COP.
- [ ] 390x844 Incident Review with 판단 불충분.
- [ ] 390x844 Response Confirmation with 수하 gates disabled and enabled.
- [ ] 390x844 Commander Reports with report and empty state.
- [ ] 768x1024 Live Guard COP.
- [ ] 768x1024 Incident Review with 판단 불충분.
- [ ] 768x1024 Response Confirmation with 수하 gates disabled and enabled.
- [ ] 768x1024 Commander Reports with report and empty state.
- [ ] 1440x900 Live Guard COP.
- [ ] 1440x900 Incident Review with 판단 불충분.
- [ ] 1440x900 Response Confirmation with 수하 gates disabled and enabled.
- [ ] 1440x900 Commander Reports with report and empty state.

Visual pass criteria:
- [ ] No horizontal scroll at 390x844.
- [ ] No clipped Korean labels at 390x844 or 768x1024.
- [ ] Camera media keeps stable 16:9 aspect ratio.
- [ ] Critical and 판단 불충분 indicators remain visible after mode changes.
- [ ] Text contrast meets WCAG AA against `DESIGN.md` surfaces.
- [ ] Motion respects reduced-motion preferences.

## CJK And Korean Text

- [ ] Korean prose uses `word-break: keep-all`.
- [ ] Machine ids and citations use `overflow-wrap: anywhere`.
- [ ] Dense chips use short labels such as 경계, 수하, 판단 불충분, 확인 필요.
- [ ] Body text stays at 13px or larger.
- [ ] Korean labels are checked at 390x844, 768x1024, and 1440x900 screenshots.

## Evidence Requirements

For each completed UI scenario, record:
- Scenario name.
- Invocation: exact route, viewport, seed data, and user action.
- Binary observable: the specific text/state/screenshot condition that decides pass or fail.
- Artifact path: screenshot, trace, log, or exported packet.

Minimum scenario set:
- Live Guard COP renders synthetic feeds and 경계 state.
- Incident Review renders an Evidence Packet with 판단 불충분.
- Response Confirmation blocks final action until 수하 Procedure gates pass.
- Commander Reports renders a cited report and an empty state.
- Responsive captures exist for 390x844, 768x1024, and 1440x900.

## Pre-Implementation Gate

- [ ] `DESIGN.md` tokens are the only source for color, type, spacing, surface, and motion decisions.
- [ ] `docs/ui-ux-plan.md` is used as the screen map for implementation.
- [ ] This `docs/design-qa-checklist.md` is used as the visual QA acceptance checklist.
- [ ] Any new reusable component pattern is added back to DESIGN before implementation relies on it.
