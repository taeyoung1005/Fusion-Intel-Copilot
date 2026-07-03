# Realtime Alert Popup + Timeline Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant EVIDENCE CLIPS section, move its detail-viewing job onto EVENT TIMELINE (hover tooltip + click-to-play), and add a new realtime alert popup that appears automatically when a CARLA simulation camera detects something.

**Architecture:** A new pure module (`realtimeAlerts.ts`) holds the two decision rules (is this a CARLA detection? has enough time passed to re-alert?) so they're unit-testable without React. A thin hook (`useRealtimeAlerts`) watches the dashboard's existing `visionEvidence` state and turns new CARLA-sourced clips into alert popups, deduped per camera by a time gap. A new `RealtimeAlertStack` component renders the popups using the same MJPEG stream URL the CARLA camera wall already uses. `EventTimeline` gains a `evidenceClips` prop so it can show a hover tooltip and open the existing `ClipPlayer` modal on click — no new player component needed. `EvidenceClips.tsx` is deleted once nothing depends on it.

**Tech Stack:** React 19 + TypeScript, Vitest (unit), Playwright (e2e), plain CSS (no CSS framework).

## Global Constraints

- Reuse `ClipPlayer.tsx` as-is for the timeline click-to-play modal — do not build a second player.
- The realtime alert popup fires **only** for CARLA camera detections. Distinguish by evidence clip id prefix: CARLA detections are emitted with id `ev-carla-vision-...` (`src/cop/useCarlaCameraDetection.ts`); the webcam test panel emits `ev-vision-...` (`src/cop/RealTimeVisionPanel.tsx`) and must never trigger a popup, even though it can share the same `camera` field value.
- Re-alert gap: default `8_000` ms, exported as a named constant so it's easy to retune later.
- Popup auto-close default: **on**, `10_000` ms. Setting is per-popup, not persisted, and lives inside the popup itself (gear icon), not a new settings panel.
- Multiple simultaneous alerts (different cameras) all render at once — no cap, no queueing.
- Follow existing code conventions: no comments explaining *what* code does, only non-obvious *why*; plain arrow-function handlers (the codebase does not memoize handlers with `useCallback` — see `src/cop/useCarlaCameras.ts`, `src/cop/dynamicMapCamera.ts` for the established style).

---

### Task 1: Pure realtime-alert decision logic + tests

**Files:**
- Create: `src/cop/realtimeAlerts.ts`
- Create: `src/cop/realtimeAlerts.test.ts`

**Interfaces:**
- Produces: `CARLA_VISION_ID_PREFIX: string`, `REALTIME_ALERT_GAP_MS: number`, `DEFAULT_AUTO_CLOSE: boolean`, `DEFAULT_AUTO_CLOSE_MS: number`, `type RealtimeAlert = { readonly id: string; readonly cameraId: string; readonly clip: EvidenceClip; readonly autoClose: boolean; readonly autoCloseMs: number }`, `isCarlaVisionClip(clip: EvidenceClip): boolean`, `shouldOpenNewAlert(lastAlertAt: number | undefined, now: number, gapMs?: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/cop/realtimeAlerts.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { EvidenceClip } from "./copData"
import { isCarlaVisionClip, shouldOpenNewAlert } from "./realtimeAlerts"

const clip = (id: string): EvidenceClip => ({
  id,
  time: "09:00:00",
  camera: "CARLA-N-01",
  tone: "watch",
  label: "person 탐지",
  detail: "CONF 90%",
  source: "vision",
  confidencePct: 90,
  frameDataUrl: null,
})

describe("isCarlaVisionClip", () => {
  it("recognizes CARLA-sourced detection clip ids", () => {
    expect(isCarlaVisionClip(clip("ev-carla-vision-CARLA-N-01-3"))).toBe(true)
  })

  it("rejects webcam test-panel detection clip ids", () => {
    expect(isCarlaVisionClip(clip("ev-vision-3"))).toBe(false)
  })
})

describe("shouldOpenNewAlert", () => {
  it("opens when there is no prior alert for the camera", () => {
    expect(shouldOpenNewAlert(undefined, 1_000)).toBe(true)
  })

  it("suppresses re-alert within the gap window", () => {
    expect(shouldOpenNewAlert(1_000, 5_000, 8_000)).toBe(false)
  })

  it("re-opens once the gap window has passed", () => {
    expect(shouldOpenNewAlert(1_000, 9_001, 8_000)).toBe(true)
  })

  it("uses the default gap when none is given", () => {
    expect(shouldOpenNewAlert(1_000, 1_000 + 8_000)).toBe(true)
    expect(shouldOpenNewAlert(1_000, 1_000 + 7_999)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cop/realtimeAlerts.test.ts`
Expected: FAIL — `Cannot find module './realtimeAlerts'`

- [ ] **Step 3: Write minimal implementation**

Create `src/cop/realtimeAlerts.ts`:

```ts
import type { EvidenceClip } from "./copData"

export const CARLA_VISION_ID_PREFIX = "ev-carla-vision-"
export const REALTIME_ALERT_GAP_MS = 8_000
export const DEFAULT_AUTO_CLOSE = true
export const DEFAULT_AUTO_CLOSE_MS = 10_000

export type RealtimeAlert = {
  readonly id: string
  readonly cameraId: string
  readonly clip: EvidenceClip
  readonly autoClose: boolean
  readonly autoCloseMs: number
}

export const isCarlaVisionClip = (clip: EvidenceClip): boolean =>
  clip.id.startsWith(CARLA_VISION_ID_PREFIX)

export const shouldOpenNewAlert = (
  lastAlertAt: number | undefined,
  now: number,
  gapMs: number = REALTIME_ALERT_GAP_MS,
): boolean => lastAlertAt === undefined || now - lastAlertAt >= gapMs
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cop/realtimeAlerts.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cop/realtimeAlerts.ts src/cop/realtimeAlerts.test.ts
git commit -m "Add pure realtime-alert decision logic (CARLA detection + re-alert gap)"
```

---

### Task 2: `useRealtimeAlerts` hook

**Files:**
- Create: `src/cop/useRealtimeAlerts.ts`

**Interfaces:**
- Consumes: `isCarlaVisionClip`, `shouldOpenNewAlert`, `REALTIME_ALERT_GAP_MS`, `DEFAULT_AUTO_CLOSE`, `DEFAULT_AUTO_CLOSE_MS`, `type RealtimeAlert` (all from `./realtimeAlerts`, Task 1); `type EvidenceClip` from `./copData`
- Produces: `useRealtimeAlerts(evidenceClips: readonly EvidenceClip[]): { alerts: readonly RealtimeAlert[]; dismissAlert: (id: string) => void; updateAlertSettings: (id: string, settings: { autoClose: boolean; autoCloseMs: number }) => void }`

No unit test for this task — it's a thin React wiring layer over the already-tested pure functions from Task 1; its behavior is covered by the e2e test in Task 7.

- [ ] **Step 1: Implement the hook**

Create `src/cop/useRealtimeAlerts.ts`:

```ts
import { useEffect, useRef, useState } from "react"
import type { EvidenceClip } from "./copData"
import {
  DEFAULT_AUTO_CLOSE,
  DEFAULT_AUTO_CLOSE_MS,
  REALTIME_ALERT_GAP_MS,
  type RealtimeAlert,
  isCarlaVisionClip,
  shouldOpenNewAlert,
} from "./realtimeAlerts"

type UseRealtimeAlertsResult = {
  readonly alerts: readonly RealtimeAlert[]
  readonly dismissAlert: (id: string) => void
  readonly updateAlertSettings: (
    id: string,
    settings: { readonly autoClose: boolean; readonly autoCloseMs: number },
  ) => void
}

export const useRealtimeAlerts = (
  evidenceClips: readonly EvidenceClip[],
): UseRealtimeAlertsResult => {
  const [alerts, setAlerts] = useState<readonly RealtimeAlert[]>([])
  const seenClipIdsRef = useRef<Set<string>>(new Set())
  const lastAlertAtRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const newClips = evidenceClips.filter(
      (clip) => isCarlaVisionClip(clip) && !seenClipIdsRef.current.has(clip.id),
    )
    if (newClips.length === 0) {
      return
    }
    const now = Date.now()
    const toOpen: RealtimeAlert[] = []
    for (const clip of newClips) {
      seenClipIdsRef.current.add(clip.id)
      const cameraId = clip.camera
      if (shouldOpenNewAlert(lastAlertAtRef.current.get(cameraId), now, REALTIME_ALERT_GAP_MS)) {
        toOpen.push({
          id: clip.id,
          cameraId,
          clip,
          autoClose: DEFAULT_AUTO_CLOSE,
          autoCloseMs: DEFAULT_AUTO_CLOSE_MS,
        })
      }
      lastAlertAtRef.current.set(cameraId, now)
    }
    if (toOpen.length > 0) {
      setAlerts((previous) => [...previous, ...toOpen])
    }
  }, [evidenceClips])

  const dismissAlert = (id: string): void => {
    setAlerts((previous) => previous.filter((alert) => alert.id !== id))
  }

  const updateAlertSettings = (
    id: string,
    settings: { readonly autoClose: boolean; readonly autoCloseMs: number },
  ): void => {
    setAlerts((previous) =>
      previous.map((alert) => (alert.id === id ? { ...alert, ...settings } : alert)),
    )
  }

  return { alerts, dismissAlert, updateAlertSettings }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (this file isn't imported anywhere yet, but must compile standalone)

- [ ] **Step 3: Commit**

```bash
git add src/cop/useRealtimeAlerts.ts
git commit -m "Add useRealtimeAlerts hook wiring CARLA-detection popups off visionEvidence"
```

---

### Task 3: `RealtimeAlertStack` component + CSS

**Files:**
- Create: `src/cop/RealtimeAlertStack.tsx`
- Create: `src/styles/cop.13.css`
- Modify: `src/styles/cop.css`

**Interfaces:**
- Consumes: `type RealtimeAlert` from `./realtimeAlerts` (Task 1); `carlaCameraStreamSrc(cameraId: string): string` from `./carlaCameraClient` (existing, used identically in `src/cop/CarlaCctvWall.tsx`)
- Produces: `<RealtimeAlertStack alerts={} onDismiss={} onUpdateSettings={} />` — same settings signature as `useRealtimeAlerts`'s `updateAlertSettings`

- [ ] **Step 1: Create the component**

Create `src/cop/RealtimeAlertStack.tsx`:

```tsx
import { Settings2, X } from "lucide-react"
import { type ReactElement, useEffect, useState } from "react"
import { carlaCameraStreamSrc } from "./carlaCameraClient"
import type { RealtimeAlert } from "./realtimeAlerts"

type AlertSettings = { readonly autoClose: boolean; readonly autoCloseMs: number }

type RealtimeAlertStackProps = {
  readonly alerts: readonly RealtimeAlert[]
  readonly onDismiss: (id: string) => void
  readonly onUpdateSettings: (id: string, settings: AlertSettings) => void
}

export function RealtimeAlertStack({
  alerts,
  onDismiss,
  onUpdateSettings,
}: RealtimeAlertStackProps): ReactElement {
  return (
    <div className="cop-realtime-alert-stack" aria-live="polite">
      {alerts.map((alert) => (
        <RealtimeAlertCard
          key={alert.id}
          alert={alert}
          onDismiss={onDismiss}
          onUpdateSettings={onUpdateSettings}
        />
      ))}
    </div>
  )
}

type RealtimeAlertCardProps = {
  readonly alert: RealtimeAlert
  readonly onDismiss: (id: string) => void
  readonly onUpdateSettings: (id: string, settings: AlertSettings) => void
}

function RealtimeAlertCard({
  alert,
  onDismiss,
  onUpdateSettings,
}: RealtimeAlertCardProps): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (!alert.autoClose) {
      return
    }
    const timer = window.setTimeout(() => onDismiss(alert.id), alert.autoCloseMs)
    return () => window.clearTimeout(timer)
  }, [alert.id, alert.autoClose, alert.autoCloseMs, onDismiss])

  return (
    <div className={`cop-realtime-alert tone-${alert.clip.tone}`} role="alert">
      <header className="cop-realtime-alert-head">
        <strong>{alert.cameraId}</strong>
        <div className="cop-realtime-alert-actions">
          <button
            type="button"
            className="cop-icon-btn"
            aria-label={`${alert.cameraId} 알림 설정`}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <Settings2 size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="cop-icon-btn"
            aria-label={`${alert.cameraId} 알림 닫기`}
            onClick={() => onDismiss(alert.id)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div className="cop-realtime-alert-settings">
          <label>
            <input
              type="checkbox"
              checked={alert.autoClose}
              onChange={(event) =>
                onUpdateSettings(alert.id, {
                  autoClose: event.currentTarget.checked,
                  autoCloseMs: alert.autoCloseMs,
                })
              }
            />
            자동 닫힘
          </label>
          <label>
            <input
              type="number"
              min={1}
              value={Math.round(alert.autoCloseMs / 1000)}
              onChange={(event) => {
                const seconds = Number(event.currentTarget.value)
                if (Number.isNaN(seconds) || seconds <= 0) {
                  return
                }
                onUpdateSettings(alert.id, {
                  autoClose: alert.autoClose,
                  autoCloseMs: seconds * 1000,
                })
              }}
            />
            초
          </label>
        </div>
      )}

      <div className="cop-realtime-alert-media">
        <img src={carlaCameraStreamSrc(alert.cameraId)} alt={`${alert.cameraId} 실시간 탐지 영상`} />
      </div>
      <p className="cop-realtime-alert-detail">
        {alert.clip.label} · {alert.clip.detail}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Add the CSS**

Create `src/styles/cop.13.css`:

```css
.cop-realtime-alert-stack {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 60;
  display: flex;
  flex-direction: column-reverse;
  gap: 10px;
  pointer-events: none;
}

.cop-realtime-alert {
  pointer-events: auto;
  width: 280px;
  background: rgba(6, 16, 23, 0.97);
  border: 1px solid var(--line);
  border-left-width: 3px;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.cop-realtime-alert.tone-normal {
  border-left-color: var(--c-green);
}

.cop-realtime-alert.tone-watch {
  border-left-color: var(--c-amber);
}

.cop-realtime-alert.tone-alert {
  border-left-color: var(--c-red);
}

.cop-realtime-alert-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 11px;
  margin-bottom: 6px;
}

.cop-realtime-alert-actions {
  display: flex;
  gap: 4px;
}

.cop-realtime-alert-settings {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  margin-bottom: 6px;
  color: var(--text-secondary);
}

.cop-realtime-alert-settings input[type="number"] {
  width: 48px;
}

.cop-realtime-alert-media {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 4px;
  background: var(--surface-inset);
}

.cop-realtime-alert-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cop-realtime-alert-detail {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Register the new stylesheet**

Modify `src/styles/cop.css` — append one line:

```css
@import "./cop.01.css";
@import "./cop.02.css";
@import "./cop.03.css";
@import "./cop.04.css";
@import "./cop.05.css";
@import "./cop.06.css";
@import "./cop.07.css";
@import "./cop.08.css";
@import "./cop.09.css";
@import "./cop.10.css";
@import "./cop.11.css";
@import "./cop.12.css";
@import "./cop.13.css";
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/cop/RealtimeAlertStack.tsx src/styles/cop.13.css src/styles/cop.css
git commit -m "Add RealtimeAlertStack popup UI for CARLA detection alerts"
```

---

### Task 4: Wire alerts into `CopDashboard`

**Files:**
- Modify: `src/cop/CopDashboard.tsx`

**Interfaces:**
- Consumes: `useRealtimeAlerts` (Task 2), `RealtimeAlertStack` (Task 3)

- [ ] **Step 1: Add imports**

In `src/cop/CopDashboard.tsx`, add these two import lines (keep the existing imports otherwise unchanged for now — `EvidenceClips` is removed in Task 6, not here):

```ts
import { RealtimeAlertStack } from "./RealtimeAlertStack"
```

and

```ts
import { useRealtimeAlerts } from "./useRealtimeAlerts"
```

Place `RealtimeAlertStack` alphabetically among the other same-level imports (after `RightRail`, before the `./copData` import block), and `useRealtimeAlerts` alphabetically among the other `use*` imports (after `useCarlaCameras`). Run `npx biome check --fix .` after this task if the import order is flagged — biome will reorder them for you.

- [ ] **Step 2: Call the hook**

Inside `export function CopDashboard()`, right after the existing `const evidenceClips = visionEvidence` line, add:

```ts
const { alerts, dismissAlert, updateAlertSettings } = useRealtimeAlerts(evidenceClips)
```

- [ ] **Step 3: Render the stack**

In the JSX returned by `CopDashboard`, add `<RealtimeAlertStack>` as the last child of the outermost `<div className="cop-shell">`, i.e. immediately after the closing `</div>` of `<div className="cop-body">` and before the closing `</div>` of `cop-shell`:

```tsx
      </div>
      <RealtimeAlertStack
        alerts={alerts}
        onDismiss={dismissAlert}
        onUpdateSettings={updateAlertSettings}
      />
    </div>
  )
}
```

(It's `position: fixed` via CSS from Task 3, so its position in the DOM tree doesn't affect layout — this placement just keeps it visually grouped with the rest of the shell in the source.)

- [ ] **Step 4: Typecheck, lint, unit test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass (48 existing vitest tests + the 7 new ones from Task 1 = 55)

- [ ] **Step 5: Commit**

```bash
git add src/cop/CopDashboard.tsx
git commit -m "Wire RealtimeAlertStack into CopDashboard"
```

---

### Task 5: `EventTimeline` hover tooltip + click-to-play

**Files:**
- Modify: `src/cop/EventTimeline.tsx`
- Modify: `src/styles/cop.06.css`
- Modify: `src/cop/CopDashboard.tsx`

**Interfaces:**
- Consumes: `ClipPlayer` (existing, `./ClipPlayer`, props `{ clip: EvidenceClip; onClose: () => void }`), `type EvidenceClip` from `./copData`
- Produces: `EventTimelineProps` gains `evidenceClips: readonly EvidenceClip[]`

- [ ] **Step 1: Add the tooltip CSS**

Append to the end of `src/styles/cop.06.css` (after the existing `.cop-track-block.tone-alert` rule):

```css

.cop-track-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 160px;
  padding: 6px 8px;
  border: 1px solid var(--c-cyan);
  border-radius: 6px;
  background: rgba(6, 16, 23, 0.98);
  font-family: var(--mono);
  font-size: 10px;
  line-height: 1.4;
  white-space: normal;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.12s ease;
  z-index: 4;
}

.cop-track-block:hover .cop-track-tooltip,
.cop-track-block:focus-visible .cop-track-tooltip {
  opacity: 1;
  visibility: visible;
}

.cop-track-tooltip strong {
  display: block;
  font-size: 11px;
  margin-bottom: 2px;
}
```

- [ ] **Step 2: Modify `EventTimeline.tsx`**

Replace the full contents of `src/cop/EventTimeline.tsx` with:

```tsx
import { type ReactElement, useEffect, useMemo, useState } from "react"
import { ClipPlayer } from "./ClipPlayer"
import {
  TIMELINE_FILTERS,
  TIMELINE_LANES,
  TIMELINE_LANE_LABEL,
  TIMELINE_RANGES,
  type EvidenceClip,
  type TimelineEvent,
  type TimelineFilter,
  type TimelineLane,
  type TimelineRange,
  timelinePercentIn,
  timelineTicksIn,
  timelineWindow,
} from "./copData"

const LANE_TOP: Record<TimelineLane, string> = {
  alert: "16%",
  watch: "50%",
  normal: "84%",
}

const pad = (value: number): string => String(value).padStart(2, "0")
const nowMinutes = (): number => {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}
const nowClock = (): string => {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

type EventTimelineProps = {
  readonly events: readonly TimelineEvent[]
  readonly evidenceClips: readonly EvidenceClip[]
  readonly selectedEventId: string
  readonly onSelectEvent: (event: TimelineEvent) => void
}

export function EventTimeline({
  events,
  evidenceClips,
  selectedEventId,
  onSelectEvent,
}: EventTimelineProps): ReactElement {
  const [range, setRange] = useState<TimelineRange>("1H")
  const [filter, setFilter] = useState<TimelineFilter>("all")
  // Real current time, ticking so the axis and "now" marker stay live.
  const [clock, setClock] = useState(nowClock)
  const [minute, setMinute] = useState(nowMinutes)
  const [playingClipId, setPlayingClipId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(nowClock())
      setMinute(nowMinutes())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const viewWindow = useMemo(() => timelineWindow(range, minute), [range, minute])
  const ticks = useMemo(() => timelineTicksIn(viewWindow), [viewWindow])
  const nowPercent = timelinePercentIn(clock, viewWindow)

  const clipsById = useMemo(() => {
    const map = new Map<string, EvidenceClip>()
    for (const clip of evidenceClips) {
      map.set(clip.id, clip)
    }
    return map
  }, [evidenceClips])
  const playingClip = playingClipId === null ? undefined : clipsById.get(playingClipId)

  const matches = (tone: string): boolean => filter === "all" || filter === tone

  return (
    <section
      id="cop-timeline-panel"
      className="cop-panel cop-timeline"
      aria-labelledby="cop-timeline-title"
    >
      <div className="cop-timeline-head">
        <h2 id="cop-timeline-title">
          <span className="cop-kicker">EVENT TIMELINE</span>
        </h2>
        <div className="cop-range-group" aria-label="시간 범위">
          {TIMELINE_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={`cop-range${range === option ? " active" : ""}`}
              aria-pressed={range === option}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="cop-filter-group" aria-label="이벤트 필터">
          {TIMELINE_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`cop-filter tone-${option.id}${filter === option.id ? " active" : ""}`}
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
            >
              <span className="cop-filter-dot" aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cop-timeline-chart">
        <div className="cop-chart-corner" />
        <div className="cop-chart-axis">
          {ticks.map((tick) => (
            <span key={tick.percent} className="cop-axis-tick" style={{ left: `${tick.percent}%` }}>
              {tick.label}
            </span>
          ))}
          <span className="cop-now-pill" style={{ left: `${nowPercent}%` }}>
            {clock}
          </span>
        </div>

        <div className="cop-chart-lanes-labels">
          {TIMELINE_LANES.map((lane) => (
            <span key={lane} style={{ top: LANE_TOP[lane] }}>
              {TIMELINE_LANE_LABEL[lane]}
            </span>
          ))}
        </div>

        <div className="cop-chart-track">
          {TIMELINE_LANES.map((lane) => (
            <span key={lane} className="cop-lane-line" style={{ top: LANE_TOP[lane] }} />
          ))}
          <span className="cop-now-line" style={{ left: `${nowPercent}%` }} />

          {events.length === 0 ? (
            <p className="cop-timeline-empty">
              실시간 이벤트 없음 — CARLA 시뮬레이션 CCTV·DETR 탐지가 수집되면 현재 시각 기준으로
              표시됩니다.
            </p>
          ) : (
            events.map((event) => {
              const clip = clipsById.get(event.id)
              return (
                <button
                  key={event.id}
                  type="button"
                  className={`cop-track-block tone-${event.tone}${
                    event.id === selectedEventId ? " selected" : ""
                  }`}
                  aria-pressed={event.id === selectedEventId}
                  aria-label={`${event.display} 타임라인 이벤트 선택`}
                  onClick={() => {
                    onSelectEvent(event)
                    setPlayingClipId(event.id)
                  }}
                  style={{
                    left: `${timelinePercentIn(event.time, viewWindow)}%`,
                    top: LANE_TOP[event.lane],
                    opacity: matches(event.tone) ? 1 : 0.2,
                  }}
                >
                  <strong>{TIMELINE_LANE_LABEL[event.lane]}</strong>
                  <time>{event.display}</time>
                  {clip !== undefined && (
                    <span className="cop-track-tooltip">
                      <strong>{clip.label}</strong>
                      {clip.time} · {clip.detail}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {playingClip !== undefined && (
        <ClipPlayer clip={playingClip} onClose={() => setPlayingClipId(null)} />
      )}
    </section>
  )
}
```

- [ ] **Step 3: Pass the new prop from `CopDashboard`**

In `src/cop/CopDashboard.tsx`, find the `<EventTimeline ... />` element and add the `evidenceClips` prop:

```tsx
          <EventTimeline
            events={timelineEvents}
            evidenceClips={evidenceClips}
            selectedEventId={selectedClipId}
            onSelectEvent={selectTimelineEvent}
          />
```

- [ ] **Step 4: Typecheck, lint, unit test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/cop/EventTimeline.tsx src/styles/cop.06.css src/cop/CopDashboard.tsx
git commit -m "EVENT TIMELINE: hover tooltip + click opens ClipPlayer"
```

---

### Task 6: Remove the EVIDENCE CLIPS section

**Files:**
- Delete: `src/cop/EvidenceClips.tsx`
- Modify: `src/cop/CopDashboard.tsx`

- [ ] **Step 1: Remove the import and the JSX**

In `src/cop/CopDashboard.tsx`:

Remove this import line:

```ts
import { EvidenceClips } from "./EvidenceClips"
```

Remove this JSX block (it currently sits right after `<EventTimeline .../>` inside `<main className="cop-center" ...>`):

```tsx
          <EvidenceClips
            clips={evidenceClips}
            selectedClipId={selectedClipId}
            onSelectClip={selectClip}
          />
```

Leave the `selectClip` function definition in place even though it's no longer passed to a component — check first whether anything else calls it:

Run: `grep -n "selectClip\b" src/cop/CopDashboard.tsx`

If `selectClip` is now unused (no other reference besides its own definition), delete its definition too:

```ts
  const selectClip = (clipId: string): void => {
    setSelectedClipId(clipId)
    setCommandFeedback(`${clipId} 증거 클립 선택: Codex 입력을 동기화했습니다.`)
  }
```

- [ ] **Step 2: Delete the file**

```bash
rm src/cop/EvidenceClips.tsx
```

- [ ] **Step 3: Typecheck, lint, unit test**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass, no "unused import" or "unused variable" errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Remove EVIDENCE CLIPS section (superseded by EVENT TIMELINE hover/click)"
```

---

### Task 7: Update e2e tests

**Files:**
- Modify: `tests/e2e/cop.spec.ts`

- [ ] **Step 1: Remove the EVIDENCE CLIPS assertions from the main comprehensive test**

Find this block (inside the `"컨셉의 모든 표면과 기능을 노출한다"` test):

```ts
      // --- Evidence clips ------------------------------------------------------
      // With no live cameras and no DETR detections, there is no fabricated
      // evidence: the strip shows an honest empty state, not static demo clips.
      await expect(page.getByText("EVIDENCE CLIPS")).toBeVisible()
      await expect(page.getByText("탐지된 영상 증거 없음")).toBeVisible()
      await expect(page.locator(".cop-clip")).toHaveCount(0)
      await expect(page.locator(".cop-clips-count")).toHaveText("0 Clips")
```

Delete it entirely (the EVENT TIMELINE empty-state assertion just above it, `.cop-timeline-empty`, already covers "no fabricated evidence").

- [ ] **Step 2: Update the realtime DETR test's evidence assertion**

Find this block (inside `"실시간 DETR 추론 루프가 탐지 프레임을 에이전트 판단 API로 전달한다"`):

```ts
    // A real DETR detection lands in EVIDENCE CLIPS as a captured-frame clip.
    await expect.poll(() => page.locator(".cop-clip").count()).toBeGreaterThanOrEqual(1)
    await expect(page.locator(".cop-clip .cop-clip-frame").first()).toBeVisible()
    await expect(page.locator(".cop-clip-foot").first()).toContainText("CONF")
```

Replace with:

```ts
    // A real DETR detection lands on EVENT TIMELINE as a track block.
    await expect.poll(() => page.locator(".cop-track-block").count()).toBeGreaterThanOrEqual(1)
    // This is the webcam test panel, not a CARLA camera, so it must never
    // trigger the realtime alert popup (that's CARLA-only, see Task 7 below).
    await expect(page.locator(".cop-realtime-alert")).toHaveCount(0)
```

- [ ] **Step 3: Remove the leftover EVIDENCE CLIPS assertions from the CARLA display test**

Find this block (inside `"CARLA 시뮬레이션 카메라를 CARLA SIM CCTV와 지도에 표시한다"`):

```ts
    // A connected camera's frame heartbeat alone is not "evidence" — EVIDENCE
    // CLIPS only fills in from a real DETR detection (covered by the realtime
    // DETR test above), so it stays honestly empty here.
    await expect(page.locator(".cop-clip")).toHaveCount(0)
    await expect(page.locator(".cop-clips-count")).toHaveText("0 Clips")
```

Delete it entirely (there is no more EVIDENCE CLIPS section to assert against).

- [ ] **Step 4: Update the stale-Codex-request test's evidence assertion**

Find this line (inside `"Codex 요청 중 사건을 바꿔도 이전 판단을 표시하지 않는다"`):

```ts
    await expect.poll(() => page.locator(".cop-clip").count()).toBeGreaterThanOrEqual(1)
```

Replace with:

```ts
    await expect.poll(() => page.locator(".cop-track-block").count()).toBeGreaterThanOrEqual(1)
```

- [ ] **Step 5: Add the new realtime alert + timeline interaction test**

Add this as a new test at the end of the `test.describe("D4D COP 표면과 상호작용", ...)` block, just before its closing `})`:

```ts
  test("CARLA 탐지 시 실시간 알림 팝업이 뜨고, EVENT TIMELINE 호버/클릭이 동작한다", async ({
    page,
  }) => {
    const TINY_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    )
    const carlaCamera = {
      id: "CARLA-ALERT-01",
      label: "E2E 알림 테스트",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl: null,
    }

    await page.route("**/api/carla-cameras*", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [carlaCamera] }),
      })
    })

    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "person", score: 0.88, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "carla-alert-test-sequence",
          cameraId: "CARLA-ALERT-01",
          detections: [{ id: "det-alert-001", label: "person", confidence: 0.88 }],
          tracks: [{ id: "trk-alert-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    await page.goto("/")

    // A real CARLA-sourced detection opens a realtime alert popup automatically.
    const alert = page.locator(".cop-realtime-alert")
    await expect(alert).toBeVisible({ timeout: 10_000 })
    await expect(alert.getByText("CARLA-ALERT-01")).toBeVisible()
    await expect.poll(() => page.locator(".cop-track-block").count()).toBeGreaterThanOrEqual(1)

    // Closing it manually works.
    await page.getByRole("button", { name: "CARLA-ALERT-01 알림 닫기" }).click()
    await expect(alert).toHaveCount(0)

    // Clicking the resulting EVENT TIMELINE block opens the clip player modal.
    await page.locator(".cop-track-block").first().click()
    await expect(page.locator(".cop-clip-player")).toBeVisible()
    await page.getByRole("button", { name: "재생 닫기" }).click()
    await expect(page.locator(".cop-clip-player")).toHaveCount(0)

    // Hovering a block reveals its tooltip.
    await page.locator(".cop-track-block").first().hover()
    await expect(page.locator(".cop-track-tooltip").first()).toBeVisible()
  })
```

- [ ] **Step 6: Run the full e2e suite**

Run: `npx playwright test tests/e2e/cop.spec.ts`
Expected: all tests pass (10 total — the 9 existing plus the new one)

If the new test's `alert` locator times out waiting for `.cop-realtime-alert`, check (in order): (a) the mocked `/api/carla-cameras` list response actually has `frameCount: 1` and a non-null `lastFrameAt` (both are required for `useCarlaCameraDetection`'s effect to fire at all), (b) the `/frame.jpg` route match — Playwright's route glob `**/api/carla-cameras*` combined with the `route.request().url().includes("/frame.jpg")` check inside the handler is what routes frame-image requests to the PNG response instead of the JSON list response.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/cop.spec.ts
git commit -m "Update e2e tests for EVIDENCE CLIPS removal and realtime alert popup"
```

---

### Task 8: Final full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the complete QA suite**

Run: `npm run qa:final`

This runs, in order: `typecheck`, `lint`, `test` (vitest), `build`. Expected: all pass, production build succeeds.

- [ ] **Step 2: Run the e2e suite once more standalone**

Run: `npx playwright test tests/e2e/cop.spec.ts`
Expected: 10/10 pass

- [ ] **Step 3: Manual sanity check (optional but recommended)**

Start the dev server (`npm run dev`), open the dashboard, and if a CARLA bridge or the earlier curl-based frame-injection approach is available, verify by eye:
- EVIDENCE CLIPS section is gone
- Hovering an EVENT TIMELINE block shows the tooltip; clicking opens the same clip-player modal that used to live in EVIDENCE CLIPS
- A CARLA camera detection pops up an alert card in the bottom-right with the live MJPEG stream, auto-closes after ~10s, and the gear icon lets you toggle/adjust that before it does

- [ ] **Step 4: Final commit (if Step 3 turned up any fixes)**

```bash
git add -A
git commit -m "Fix issues found during manual verification"
```

(Skip if Step 3 needed no changes — nothing to commit.)

---

## Self-Review Notes

- **Spec coverage:** EVIDENCE CLIPS removal → Task 6. EVENT TIMELINE hover/click → Task 5. Realtime alert popup (trigger detection, dedup gap, live stream, X close, per-popup auto-close settings default on/10s, multiple simultaneous popups) → Tasks 1–4. e2e coverage for all of the above → Task 7. All spec sections have a task.
- **Type consistency checked:** `RealtimeAlert` (Task 1) → consumed identically in `useRealtimeAlerts` (Task 2) and `RealtimeAlertStack`/`RealtimeAlertCard` (Task 3). `updateAlertSettings`'s settings shape (`{ autoClose: boolean; autoCloseMs: number }`) matches across the hook (Task 2) and the component's `onUpdateSettings` prop (Task 3). `EventTimelineProps.evidenceClips` (Task 5) matches the `evidenceClips` variable already in scope in `CopDashboard.tsx`.
- **No placeholders:** every step above has complete, runnable code — verified by re-reading each step.
