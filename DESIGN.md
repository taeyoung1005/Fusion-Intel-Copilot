# D4D Perimeter AI Harness Design System

## 1. Atmosphere & Identity

A dense command post for one operator supervising many perimeter sensors. The interface should feel calm under pressure: compact, legible, evidence-first, and operational rather than promotional. The signature is a dark COP grid with restrained amber and red alert rails, where camera panels, ledger citations, and human-confirmation controls sit in one scan path.

No-marketing-page constraint: the first screen is always the operator dashboard. Do not add hero sections, sales copy, decorative feature cards, or landing-page composition to `/`.

Product safety posture: the interface uses synthetic perimeter CCTV and simulated events only. Product UI must never imply real military data access, identity recognition, biometric matching, targeting, firing, or autonomous force. The system can surface uncertainty, request operator review, and package evidence, but the human operator owns every response decision.

Design read: operations COP for a trained single operator, `DESIGN_VARIANCE 3`, `MOTION_INTENSITY 2`, `VISUAL_DENSITY 8`. The design should resemble a working control room, not an arcade, marketing dashboard, purple gradient SaaS UI, or decorative analytics screen.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/primary | --surface-primary | #F4F7F8 | #0D1112 | App background |
| Surface/secondary | --surface-secondary | #E8EEF0 | #141A1C | Dashboard bands and panels |
| Surface/elevated | --surface-elevated | #FFFFFF | #1B2326 | Camera and evidence panels |
| Surface/inset | --surface-inset | #D8E1E4 | #081012 | Video wells and timelines |
| Text/primary | --text-primary | #0B1113 | #F1F6F7 | Primary labels and values |
| Text/secondary | --text-secondary | #425159 | #AAB7BC | Secondary metadata |
| Text/tertiary | --text-tertiary | #6E7E86 | #718087 | Disabled and quiet labels |
| Border/default | --border-default | #C6D1D5 | #2D3A3F | Panel outlines |
| Border/subtle | --border-subtle | #DDE6E9 | #20292D | Internal dividers |
| Accent/primary | --accent-primary | #006D77 | #4FB3BF | Active controls and links |
| Accent/hover | --accent-hover | #00545D | #7DD0DA | Control hover |
| Map/grid | --map-grid-line | rgba(0, 109, 119, 0.08) | rgba(79, 179, 191, 0.08) | COP map contour/grid lines |
| Map/cone | --map-cone | rgba(0, 109, 119, 0.22) | rgba(79, 179, 191, 0.22) | CCTV coverage cones |
| Map/route | --map-route | rgba(161, 98, 7, 0.82) | rgba(244, 196, 48, 0.82) | Handoff route overlays |
| Map/blind | --map-blind | rgba(185, 28, 28, 0.2) | rgba(248, 113, 113, 0.2) | Blind spot overlays |
| Map/panel | --map-panel | rgba(244, 247, 248, 0.88) | rgba(8, 16, 18, 0.86) | Map legends and coordinate wells |
| Alert/normal | --alert-normal | #0F766E | #36D399 | Normal watch state |
| Alert/watch | --alert-watch | #A16207 | #F4C430 | Suspicious or watch state |
| Alert/warn | --alert-warn | #B45309 | #F59E0B | Human review required |
| Alert/critical | --alert-critical | #B91C1C | #F87171 | Confirmed high-risk condition |
| Alert/uncertain | --alert-uncertain | #475569 | #94A3B8 | Low-confidence or insufficient judgment |
| Focus/ring | --focus-ring | #005FCC | #8BCBFF | Keyboard focus outline |

### Rules

- Surfaces use tonal shift plus one-pixel borders; no decorative gradients or glow backgrounds.
- Alert-stage colors are semantic only: `normal`, `watch`, `warn`, `critical`, and `uncertain`.
- Accent is reserved for command affordances, current route, and keyboard focus.
- Do not introduce a color outside this table without first extending the table.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | 28px | 700 | 1.15 | 0 | App title only |
| H1 | 24px | 700 | 1.2 | 0 | Primary dashboard region title |
| H2 | 18px | 700 | 1.25 | 0 | Panel titles |
| H3 | 15px | 700 | 1.35 | 0 | Camera and alert titles |
| Body | 14px | 400 | 1.5 | 0 | Default operator text |
| Body/sm | 13px | 400 | 1.45 | 0 | Dense panel text |
| Caption | 12px | 600 | 1.35 | 0 | Metadata, chips, timestamps |
| Mono | 12px | 600 | 1.4 | 0 | Event ids, camera ids, confidence |

### Font Stack

- Primary: Arial, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif
- Mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace

### Korean Text Handling

- Use `word-break: keep-all` for Korean labels and report prose.
- Use `overflow-wrap: anywhere` only for machine ids, timestamps, and long citations.
- Keep Korean procedure labels short and avoid orphaning one syllable on narrow panels.
- Body text never drops below 13px because Korean glyphs lose legibility faster than Latin text at dense sizes.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a base of 4px.

| Token | Value | Usage |
| --- | --- | --- |
| --space-1 | 4px | Hairline gaps |
| --space-2 | 8px | Compact inline groups |
| --space-3 | 12px | Dense panel padding |
| --space-4 | 16px | Standard dashboard padding |
| --space-5 | 20px | Camera wall gaps |
| --space-6 | 24px | Major column gaps |
| --space-8 | 32px | Page gutter |

### COP Layout

- App shell: top command bar, mode rail, three-column desktop dashboard, stacked tablet/mobile dashboard.
- Desktop content width: full viewport with 16px gutters; no centered marketing container.
- Primary grid at `lg`: `minmax(320px, 1fr) minmax(420px, 1.35fr) minmax(300px, 0.95fr)`.
- Camera wall: at least 3 stable panels visible in the first viewport, each with fixed media aspect ratio.
- Density: cockpit-like, `VISUAL_DENSITY 8`; compact rows, explicit labels, no oversized decorative whitespace.
- Required viewport QA: 390x844, 768x1024, and 1440x900.

### Required Screen Modes

- Live Guard COP: default first screen, camera wall, alert ladder, active incident queue, operator response gates, and command log.
- Incident Review: selected incident evidence, timeline scrubber, clip stills, model rationale, confidence, missing-context callouts, and export-ready packet preview.
- Response Confirmation: human-in-the-loop 수하 Procedure with confirmation prompts, contact attempts, escalation notes, and final disposition.
- Commander Reports: query and report workspace for summary, cited events, unresolved items, and export review.
- AAR playback: optional after-action playback mode for timeline reconstruction, speed control, and lessons-learned annotations.

### Responsive Map

- 390x844: one active feed or selected incident at a time, bottom mode switcher, sticky alert strip, response gates below evidence, no hidden critical state.
- 768x1024: two-column tablet composition with camera stack and evidence/response side panel, command log collapsible but reachable.
- 1440x900: full COP with camera wall, central incident/evidence workspace, right-side queue and response controls, all primary modes one click away.

### Camera Panel Dimensions

- Minimum panel width: 260px.
- Preferred panel width: 320px.
- Media aspect ratio: 16 / 9.
- Panel radius: 8px maximum.
- Overlay metadata height: 32px minimum, with camera id, confidence, and status visible.

## 5. Components

### Camera Panel

- Structure: panel header, 16:9 video well, metadata strip, event chips.
- Variants: normal, watch, warn, critical, uncertain.
- Spacing: `--space-3` panel padding and `--space-2` internal gaps.
- States: hover border lift, focus ring on actionable controls, disabled controls visibly muted.
- Accessibility: panel has a named region and camera status text is not color-only.
- Motion: status pulse only through opacity and limited to alert rails.

### Alert Ladder

- Normal: 경계 maintained, no operator action required.
- Watch: weak signal or pattern change, keep visible but do not interrupt the current response.
- Warn: operator review required because a signal crosses confidence or persistence thresholds.
- Critical: confirmed high-risk simulated perimeter condition, requires Response Confirmation before any external action is logged.
- Uncertain: 판단 불충분, the interface must say what evidence is missing and block automated conclusions.

Alert language is descriptive and procedural. It should never classify a person by identity, suggest a target, or imply force selection.

### Command Button

- Structure: icon plus concise label, or icon-only with accessible name when space is constrained.
- Variants: primary, secondary, danger, disabled.
- States: hover, active, focus-visible, disabled.
- Accessibility: all command icons need text or `aria-label`.

### Report Text

- Structure: title, reporting window, summary rows, cited event ids.
- Typography: H2 for report titles, Body for narrative, Mono for citations.
- Report prose uses Korean-friendly line height and `word-break: keep-all`.

### Evidence Packet

- Structure: incident id, time window, involved synthetic cameras, alert ladder state, confidence, evidence stills, timeline citations, operator notes, and unresolved questions.
- Layout: evidence first, rationale second, response history third, export controls last.
- States: loading packet, empty evidence, incomplete evidence, export disabled, export ready, export error.
- Rule: no packet can hide 판단 불충분. If confidence or context is insufficient, the packet shows that state in the header and summary.

### Facility Situation Map

- Structure: synthetic facility map, CCTV nodes, coverage cones, topology handoff lines, active event markers, and shared-memory group overlays.
- Layer controls: coverage, handoff path, event markers, shared memory. Layer state must be visible and toggleable without hiding the selected incident summary.
- Camera nodes: use mono camera ids, Korean labels, confidence, and status. Camera direction is shown as a coverage cone, not decorative glow.
- Map semantics: the map visualizes correlation and blind-spot handoff only. It must not imply autonomous targeting or identity recognition.
- Responsive rule: on mobile, the map remains scroll-free inside the panel and layer controls wrap above the map.

### Event Timeline

- Structure: time rail, event markers, camera chips, alert tone, event summary, and selected incident citations.
- Timeline events must show where the action occurred in time and which CCTV ids were involved.
- Low-confidence and 판단 불충분 items remain visible in the same timeline as high-confidence events.
- The timeline is evidence navigation, not a decision engine; Codex and operator panels explain the decision separately.

### Shared Memory Strip

- Structure: camera group, involved camera ids, correlation purpose, active status, and unresolved caveat.
- Purpose: make multi-CCTV 판단 visible before high-cost actions such as 5-minute standby dispatch are considered.
- Copy must distinguish "correlated synthetic observations" from confirmed real-world identity or intent.

### Response Gate

- Structure: selected incident, 수하 Procedure step list, required operator acknowledgment, escalation destination, confirmation checkbox, and final log action.
- Required gates: evidence reviewed, 수하 attempted or marked not possible, supervisor/escalation note entered when needed, final disposition selected.
- Disabled state: final confirmation remains disabled until all required gates are satisfied.
- Copy: use short Korean labels for procedure steps and longer explanatory text in the details panel.

### Commander Report Workspace

- Structure: natural-language query input, filters, generated answer, cited event list, unresolved caveats, export preview.
- Required report layout: summary, timeline, per-camera findings, response actions, 판단 불충분 items, and appendix citations.
- Empty state: no matching simulated events with visible query/filter reset.
- Error state: report generation unavailable with retained filters and retry control.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 120ms | ease-out | Button press, hover |
| Standard | 180ms | ease-in-out | Panel state changes |
| Status | 900ms | ease-in-out | Optional alert rail opacity pulse |

### Rules

- Only animate `transform`, `opacity`, and border-color.
- Respect `prefers-reduced-motion`; disable status pulses and transitions where requested.
- Focus states use a 2px `--focus-ring` outline plus 2px offset.
- Disabled states use `--text-tertiary`, reduced opacity, and `not-allowed` cursor without hiding labels.
- Loading states use skeleton blocks matching final panel geometry, not spinners as the primary feedback.
- Empty states stay operational: state the absence of simulated evidence, offer reset/retry, and keep mode navigation available.
- Error states are inline and recoverable. Never replace the COP with a full-page failure unless the app shell itself cannot load.

## 7. Depth & Surface

### Strategy

Mixed, with tonal shifts plus borders. No heavy shadows.

| Type | Value | Usage |
| --- | --- | --- |
| Border/default | 1px solid var(--border-default) | Panels and command controls |
| Border/subtle | 1px solid var(--border-subtle) | Rows and dividers |
| Shadow/subtle | 0 1px 2px rgba(0, 0, 0, 0.18) | Active popovers only |

Depth must help operators separate live video, alert rationale, and report evidence. Do not use floating cards inside cards.
