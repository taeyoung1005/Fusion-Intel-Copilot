# Cross-Camera Person Correlation (Roadmap Phase D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when two different CARLA cameras likely saw the same person (using the phase-B `PersonAttributes`), raise an amber real-time correlation alert, drop a synthetic evidence clip on the timeline, and auto-consult Codex only for ambiguous matches.

**Architecture:** A new pure module `personCorrelation.ts` computes a weighted similarity score and a distance-based travel-time window. A new hook `useCorrelationAlerts.ts` keeps its own correlation buffer (independent of the 6-item display cap), finds cross-camera candidates every render, emits a synthetic `EvidenceClip` into the existing evidence pipeline for confirmed matches, and for ambiguous matches shows a local "judging" alert while calling the existing `requestCodexAgent` directly, then updates the alert once Codex resolves. `CopDashboard` wires the new hook alongside `useRealtimeAlerts` and merges both alert arrays. A separate small cleanup removes the manual Codex-request button from `RightRailCodex.tsx`.

**Tech Stack:** React 19 + TypeScript, Vitest (unit), Playwright (e2e), Biome (lint/format), Zod (already used by the Codex client). No new dependencies.

## Global Constraints

These apply to every task. Copy values exactly.

- **Weighted similarity table (exact-match, additive):** topColor = 30, bagCarried = 20, sleeveLength = 20, hat = 20, build = 10. A full match sums to 100. build is weighted lowest because bounding-box size varies with camera distance.
- **Threshold bands:** score `< 55` → no candidate (no alert). `55–79` → **ambiguous** (rule-based alert immediately **plus** a direct `requestCodexAgent` call). `>= 80` → **confirmed** (rule-based alert only, no Codex call).
- **Match eligibility:** compare clips from **different cameras only**; both clips must have `attributes` (non-person detections excluded).
- **Distance-based time window:** reuse the map scale — `band-50` = `PERIMETER.rx (322) * 0.86` ≈ 277px = 50m, so `METERS_PER_PX = 50 / (PERIMETER.rx * 0.86)` ≈ 0.1806. Euclidean pixel distance between the two cameras' map nodes → meters → divide by walking speed **1.2 m/s** → clamp to **min 20_000 ms, max 240_000 ms**. Two clips correlate only if `|observedAtMsA − observedAtMsB|` is within that window.
- **Own buffer, separate from `MAX_VISION_EVIDENCE`:** correlation matching uses its own `ref`-held buffer inside `useCorrelationAlerts`, stamped with `Date.now()` on first observation and pruned when older than `MAX_TRAVEL_WINDOW_MS` (240_000 ms). It is completely independent of the 6-item `visionEvidence` display cap.
- **No new Codex backend wiring:** the synthetic confirmed `EvidenceClip` reaches Codex only through the existing `buildIncidents` → `incident.title` → `evidence.summary` path; ambiguous matches call the existing `requestCodexAgent` directly. Do not add new server endpoints or new client functions.
- **Never block evidence or alert emission on a Codex failure:** always emit the synthetic clip and always show/settle the alert; on any Codex error fall back to the rule-based text.
- **Copy language:** UI/label strings are Korean, matching the existing codebase.
- **Verification bar:** `npm run typecheck && npm run lint && npm run test && npm run build` (aliased as `npm run qa:final`) must pass, plus the Playwright e2e suite (`npm run test:e2e`).

---

### Task 1: `personCorrelation.ts` pure logic + unit tests

**Files:**
- Create: `src/cop/personCorrelation.ts`
- Test: `src/cop/personCorrelation.test.ts`

**Interfaces:**
- Consumes: `PersonAttributes` from `./attributeClassifier`, `EvidenceClip` from `./copTimelineData`, `Point` and `PERIMETER` from `./copMapBaseData`.
- Produces (relied on by Tasks 3–4):
  - `type CorrelationBand = "ambiguous" | "confirmed"`
  - `type CorrelationCandidate = { readonly clipA: EvidenceClip; readonly clipB: EvidenceClip; readonly observedAtMsA: number; readonly observedAtMsB: number; readonly score: number; readonly band: CorrelationBand }` — `clipA`/`observedAtMsA` is the earlier observation, `clipB`/`observedAtMsB` the later.
  - `type CorrelationEntry = { readonly clip: EvidenceClip; readonly cameraId: string; readonly observedAtMs: number; readonly node: Point }`
  - Constants: `AMBIGUOUS_MIN_SCORE = 55`, `CONFIRMED_MIN_SCORE = 80`, `WALKING_SPEED_MPS = 1.2`, `MIN_TRAVEL_WINDOW_MS = 20_000`, `MAX_TRAVEL_WINDOW_MS = 240_000`, `METERS_PER_PX`.
  - `computeSimilarityScore(a: PersonAttributes, b: PersonAttributes): number`
  - `travelTimeWindowMs(nodeA: Point, nodeB: Point): number`
  - `bandForScore(score: number): CorrelationBand | undefined`
  - `pairKey(idA: string, idB: string): string`
  - `findCorrelationCandidates(entries: readonly CorrelationEntry[], nowMs: number, seenPairKeys: ReadonlySet<string>): readonly CorrelationCandidate[]`

- [ ] **Step 1: Write the failing test**

Create `src/cop/personCorrelation.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { PersonAttributes } from "./attributeClassifier"
import type { EvidenceClip } from "./copData"
import type { Point } from "./copMapBaseData"
import {
  type CorrelationEntry,
  MAX_TRAVEL_WINDOW_MS,
  MIN_TRAVEL_WINDOW_MS,
  bandForScore,
  computeSimilarityScore,
  findCorrelationCandidates,
  pairKey,
  travelTimeWindowMs,
} from "./personCorrelation"

const attrs = (over: Partial<PersonAttributes> = {}): PersonAttributes => ({
  hat: "no_hat",
  sleeveLength: "short_sleeve",
  bagCarried: "carrying_bag",
  topColor: "red",
  build: "medium",
  attributeConfidence: 0.9,
  ...over,
})

const clip = (id: string, camera: string, attributes: PersonAttributes): EvidenceClip => ({
  id,
  time: "09:41:00",
  camera,
  tone: "watch",
  label: `${camera} 탐지`,
  detail: "CONF 90%",
  source: "vision",
  confidencePct: 90,
  attributes,
})

const entry = (
  id: string,
  cameraId: string,
  observedAtMs: number,
  node: Point,
  attributes: PersonAttributes,
): CorrelationEntry => ({ clip: clip(id, cameraId, attributes), cameraId, observedAtMs, node })

describe("computeSimilarityScore", () => {
  it("returns 100 when every attribute matches", () => {
    expect(computeSimilarityScore(attrs(), attrs())).toBe(100)
  })

  it("subtracts only the top-color weight (30) when top color differs", () => {
    expect(computeSimilarityScore(attrs(), attrs({ topColor: "blue" }))).toBe(70)
  })

  it("subtracts only the hat weight (20) when hat differs", () => {
    expect(computeSimilarityScore(attrs(), attrs({ hat: "wearing_hat" }))).toBe(80)
  })

  it("subtracts hat (20) and build (10) together", () => {
    expect(
      computeSimilarityScore(attrs(), attrs({ hat: "wearing_hat", build: "large" })),
    ).toBe(70)
  })

  it("subtracts top color (30) and bag (20) together", () => {
    expect(
      computeSimilarityScore(attrs(), attrs({ topColor: "blue", bagCarried: "no_bag" })),
    ).toBe(50)
  })

  it("returns 0 when nothing matches", () => {
    expect(
      computeSimilarityScore(
        attrs(),
        attrs({
          hat: "wearing_hat",
          sleeveLength: "long_sleeve",
          bagCarried: "no_bag",
          topColor: "blue",
          build: "large",
        }),
      ),
    ).toBe(0)
  })
})

describe("bandForScore", () => {
  it("classifies below 55 as no band", () => {
    expect(bandForScore(54)).toBeUndefined()
  })
  it("classifies 55–79 as ambiguous", () => {
    expect(bandForScore(55)).toBe("ambiguous")
    expect(bandForScore(79)).toBe("ambiguous")
  })
  it("classifies 80+ as confirmed", () => {
    expect(bandForScore(80)).toBe("confirmed")
    expect(bandForScore(100)).toBe("confirmed")
  })
})

describe("travelTimeWindowMs", () => {
  it("clamps very close cameras up to the minimum window", () => {
    expect(travelTimeWindowMs({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(MIN_TRAVEL_WINDOW_MS)
  })
  it("clamps very distant cameras down to the maximum window", () => {
    expect(travelTimeWindowMs({ x: 0, y: 0 }, { x: 5000, y: 0 })).toBe(MAX_TRAVEL_WINDOW_MS)
  })
  it("returns a mid-range value between the clamps for a moderate gap", () => {
    const window = travelTimeWindowMs({ x: 0, y: 0 }, { x: 277, y: 0 })
    expect(window).toBeGreaterThan(MIN_TRAVEL_WINDOW_MS)
    expect(window).toBeLessThan(MAX_TRAVEL_WINDOW_MS)
  })
})

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"))
  })
})

describe("findCorrelationCandidates", () => {
  const nodeNear = { x: 100, y: 100 }
  const nodeFar = { x: 160, y: 140 } // ~72px from nodeNear → window clamps to 20s

  it("excludes clips from the same camera", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-A", 2_000, nodeFar, attrs()),
    ]
    expect(findCorrelationCandidates(entries, 3_000, new Set())).toEqual([])
  })

  it("classifies a full match within the window as confirmed, earlier clip first", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-B", 2_000, nodeFar, attrs()),
    ]
    const [candidate] = findCorrelationCandidates(entries, 3_000, new Set())
    expect(candidate?.band).toBe("confirmed")
    expect(candidate?.score).toBe(100)
    expect(candidate?.clipA.id).toBe("c1")
    expect(candidate?.clipB.id).toBe("c2")
  })

  it("classifies a color-only mismatch as ambiguous", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-B", 2_000, nodeFar, attrs({ topColor: "blue" })),
    ]
    const [candidate] = findCorrelationCandidates(entries, 3_000, new Set())
    expect(candidate?.band).toBe("ambiguous")
    expect(candidate?.score).toBe(70)
  })

  it("excludes pairs whose observation gap exceeds the travel window", () => {
    const entries = [
      entry("c1", "CAM-A", 0, nodeNear, attrs()),
      entry("c2", "CAM-B", 30_000, nodeFar, attrs()), // 30s gap > 20s window
    ]
    expect(findCorrelationCandidates(entries, 31_000, new Set())).toEqual([])
  })

  it("excludes pairs below the ambiguous threshold", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry(
        "c2",
        "CAM-B",
        2_000,
        nodeFar,
        attrs({ topColor: "blue", bagCarried: "no_bag", sleeveLength: "long_sleeve" }),
      ), // 100-30-20-20 = 30 < 55
    ]
    expect(findCorrelationCandidates(entries, 3_000, new Set())).toEqual([])
  })

  it("excludes already-seen pairs", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-B", 2_000, nodeFar, attrs()),
    ]
    const seen = new Set([pairKey("c1", "c2")])
    expect(findCorrelationCandidates(entries, 3_000, seen)).toEqual([])
  })

  it("excludes entries older than the maximum travel window relative to now", () => {
    const entries = [
      entry("c1", "CAM-A", 1_000, nodeNear, attrs()),
      entry("c2", "CAM-B", 2_000, nodeFar, attrs()),
    ]
    const now = 2_000 + MAX_TRAVEL_WINDOW_MS + 1
    expect(findCorrelationCandidates(entries, now, new Set())).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cop/personCorrelation.test.ts`
Expected: FAIL — `Failed to resolve import "./personCorrelation"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/cop/personCorrelation.ts`:

```ts
import type { PersonAttributes } from "./attributeClassifier"
import { PERIMETER, type Point } from "./copMapBaseData"
import type { EvidenceClip } from "./copTimelineData"

export type CorrelationBand = "ambiguous" | "confirmed"

export type CorrelationCandidate = {
  readonly clipA: EvidenceClip
  readonly clipB: EvidenceClip
  readonly observedAtMsA: number
  readonly observedAtMsB: number
  readonly score: number
  readonly band: CorrelationBand
}

export type CorrelationEntry = {
  readonly clip: EvidenceClip
  readonly cameraId: string
  readonly observedAtMs: number
  readonly node: Point
}

export const AMBIGUOUS_MIN_SCORE = 55
export const CONFIRMED_MIN_SCORE = 80
export const WALKING_SPEED_MPS = 1.2
export const MIN_TRAVEL_WINDOW_MS = 20_000
export const MAX_TRAVEL_WINDOW_MS = 240_000

// Reuse the map's own scale: band-50 = PERIMETER.rx * 0.86 px = 50m.
export const METERS_PER_PX = 50 / (PERIMETER.rx * 0.86)

export const computeSimilarityScore = (a: PersonAttributes, b: PersonAttributes): number => {
  let score = 0
  if (a.topColor === b.topColor) {
    score += 30
  }
  if (a.bagCarried === b.bagCarried) {
    score += 20
  }
  if (a.sleeveLength === b.sleeveLength) {
    score += 20
  }
  if (a.hat === b.hat) {
    score += 20
  }
  if (a.build === b.build) {
    score += 10
  }
  return score
}

export const bandForScore = (score: number): CorrelationBand | undefined => {
  if (score >= CONFIRMED_MIN_SCORE) {
    return "confirmed"
  }
  if (score >= AMBIGUOUS_MIN_SCORE) {
    return "ambiguous"
  }
  return undefined
}

export const travelTimeWindowMs = (nodeA: Point, nodeB: Point): number => {
  const dx = nodeA.x - nodeB.x
  const dy = nodeA.y - nodeB.y
  const distancePx = Math.sqrt(dx * dx + dy * dy)
  const distanceMeters = distancePx * METERS_PER_PX
  const ms = (distanceMeters / WALKING_SPEED_MPS) * 1000
  return Math.min(MAX_TRAVEL_WINDOW_MS, Math.max(MIN_TRAVEL_WINDOW_MS, ms))
}

export const pairKey = (idA: string, idB: string): string =>
  idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`

export const findCorrelationCandidates = (
  entries: readonly CorrelationEntry[],
  nowMs: number,
  seenPairKeys: ReadonlySet<string>,
): readonly CorrelationCandidate[] => {
  const candidates: CorrelationCandidate[] = []
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const first = entries[i]
      const second = entries[j]
      if (first === undefined || second === undefined) {
        continue
      }
      if (first.cameraId === second.cameraId) {
        continue
      }
      const attrsA = first.clip.attributes
      const attrsB = second.clip.attributes
      if (attrsA === undefined || attrsB === undefined) {
        continue
      }
      if (
        nowMs - first.observedAtMs > MAX_TRAVEL_WINDOW_MS ||
        nowMs - second.observedAtMs > MAX_TRAVEL_WINDOW_MS
      ) {
        continue
      }
      if (seenPairKeys.has(pairKey(first.clip.id, second.clip.id))) {
        continue
      }
      const window = travelTimeWindowMs(first.node, second.node)
      if (Math.abs(first.observedAtMs - second.observedAtMs) > window) {
        continue
      }
      const score = computeSimilarityScore(attrsA, attrsB)
      const band = bandForScore(score)
      if (band === undefined) {
        continue
      }
      const earlier = first.observedAtMs <= second.observedAtMs ? first : second
      const later = earlier === first ? second : first
      candidates.push({
        clipA: earlier.clip,
        clipB: later.clip,
        observedAtMsA: earlier.observedAtMs,
        observedAtMsB: later.observedAtMs,
        score,
        band,
      })
    }
  }
  return candidates
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cop/personCorrelation.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/cop/personCorrelation.ts src/cop/personCorrelation.test.ts
git commit -m "feat(cop): add pure cross-camera person-correlation logic"
```

---

### Task 2: `correlation` evidence source + alert `kind` field + amber alert styling

**Files:**
- Modify: `src/cop/copTimelineData.ts` (`EvidenceClipSource` union)
- Modify: `src/cop/realtimeAlerts.ts` (`RealtimeAlert` type)
- Modify: `src/cop/useRealtimeAlerts.ts` (set `kind: "detection"`)
- Modify: `src/cop/RealtimeAlertStack.tsx` (render correlation-kind cards in amber)

**Interfaces:**
- Consumes: nothing new.
- Produces (relied on by Tasks 3–5): `EvidenceClipSource` now includes `"correlation"`; `RealtimeAlert` now has `readonly kind: "detection" | "correlation"`.

- [ ] **Step 1: Add the `correlation` source to `EvidenceClipSource`**

In `src/cop/copTimelineData.ts`, replace the `EvidenceClipSource` declaration:

```ts
export type EvidenceClipSource = "mobile" | "vision" | "correlation"
```

- [ ] **Step 2: Add `kind` to `RealtimeAlert`**

In `src/cop/realtimeAlerts.ts`, replace the `RealtimeAlert` type with:

```ts
export type RealtimeAlert = {
  readonly id: string
  readonly kind: "detection" | "correlation"
  readonly cameraId: string
  readonly clip: EvidenceClip
  readonly autoClose: boolean
  readonly autoCloseMs: number
}
```

- [ ] **Step 3: Set `kind: "detection"` in `useRealtimeAlerts`**

In `src/cop/useRealtimeAlerts.ts`, inside the `toOpen.push({ ... })` call, add the `kind` field so the object reads:

```ts
        toOpen.push({
          id: clip.id,
          kind: "detection",
          cameraId,
          clip,
          autoClose: DEFAULT_AUTO_CLOSE,
          autoCloseMs: DEFAULT_AUTO_CLOSE_MS,
        })
```

- [ ] **Step 4: Render correlation-kind cards with amber accent**

In `src/cop/RealtimeAlertStack.tsx`, replace the root element of `RealtimeAlertCard` (the `return (...)` block, from `<div className={`cop-realtime-alert tone-${alert.clip.tone}`} role="alert">` down through its closing `</div>`) with the correlation-aware version below. Only the root `<div>` opening tag and the header `<strong>` change; the settings block, media block, and detail paragraph are unchanged:

```tsx
  const isCorrelation = alert.kind === "correlation"

  return (
    <div
      className={`cop-realtime-alert tone-${alert.clip.tone}${isCorrelation ? " kind-correlation" : ""}`}
      role="alert"
      style={
        isCorrelation
          ? { borderColor: "#f4c430", boxShadow: "0 0 0 1px #f4c430 inset" }
          : undefined
      }
    >
      <header className="cop-realtime-alert-head">
        <strong>{isCorrelation ? `⚠ ${alert.cameraId}` : alert.cameraId}</strong>
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
        <img
          src={carlaCameraStreamSrc(alert.cameraId)}
          alt={`${alert.cameraId} 실시간 탐지 영상`}
        />
      </div>
      <p className="cop-realtime-alert-detail">
        {alert.clip.label} · {alert.clip.detail}
      </p>
    </div>
  )
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (`useRealtimeAlerts` now sets the required `kind`; no other consumer constructs a `RealtimeAlert` yet.)

- [ ] **Step 6: Commit**

```bash
git add src/cop/copTimelineData.ts src/cop/realtimeAlerts.ts src/cop/useRealtimeAlerts.ts src/cop/RealtimeAlertStack.tsx
git commit -m "feat(cop): add correlation evidence source and alert kind with amber styling"
```

---

### Task 3: `useCorrelationAlerts` hook — buffer + confirmed band

**Files:**
- Create: `src/cop/useCorrelationAlerts.ts`

**Interfaces:**
- Consumes: `findCorrelationCandidates`, `pairKey`, `MAX_TRAVEL_WINDOW_MS`, `CorrelationCandidate`, `CorrelationEntry` from `./personCorrelation`; `EvidenceClip` from `./copTimelineData`; `DynamicCameraRecord` from `./dynamicMapCamera`; `RealtimeAlert`, `DEFAULT_AUTO_CLOSE`, `DEFAULT_AUTO_CLOSE_MS`, `isCarlaVisionClip` from `./realtimeAlerts`.
- Produces (relied on by Tasks 4–5):
  - `const CORRELATION_CLIP_PREFIX = "ev-correlation-"`
  - `useCorrelationAlerts(evidenceClips, cameras, onCorrelationEvidence)` returning `{ alerts: readonly RealtimeAlert[]; dismissAlert: (id: string) => void; updateAlertSettings: (id, { autoClose, autoCloseMs }) => void }`.

This task implements the buffer, dedup, and the **confirmed (80+)** path only. The ambiguous (55–79) path is added in Task 4.

- [ ] **Step 1: Write the confirmed-path implementation**

Create `src/cop/useCorrelationAlerts.ts`:

```ts
import { useEffect, useRef, useState } from "react"
import type { EvidenceClip } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import {
  type CorrelationCandidate,
  type CorrelationEntry,
  MAX_TRAVEL_WINDOW_MS,
  findCorrelationCandidates,
  pairKey,
} from "./personCorrelation"
import {
  DEFAULT_AUTO_CLOSE,
  DEFAULT_AUTO_CLOSE_MS,
  type RealtimeAlert,
  isCarlaVisionClip,
} from "./realtimeAlerts"

export const CORRELATION_CLIP_PREFIX = "ev-correlation-"

type AlertSettings = { readonly autoClose: boolean; readonly autoCloseMs: number }

type UseCorrelationAlertsResult = {
  readonly alerts: readonly RealtimeAlert[]
  readonly dismissAlert: (id: string) => void
  readonly updateAlertSettings: (id: string, settings: AlertSettings) => void
}

const nowClock = (): string => {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

const elapsedMinutes = (candidate: CorrelationCandidate): number =>
  Math.round((candidate.observedAtMsB - candidate.observedAtMsA) / 60_000)

const labelFor = (cameras: readonly DynamicCameraRecord[], cameraId: string): string =>
  cameras.find((camera) => camera.id === cameraId)?.label ?? cameraId

// The confirmed synthetic clip carries the LATER clip's attributes and camera so
// it lands on that camera's incident (buildIncidents → Codex evidence.summary).
const buildConfirmedClip = (
  candidate: CorrelationCandidate,
  cameras: readonly DynamicCameraRecord[],
): EvidenceClip => {
  const laterLabel = labelFor(cameras, candidate.clipB.camera)
  const minutes = elapsedMinutes(candidate)
  return {
    id: `${CORRELATION_CLIP_PREFIX}${pairKey(candidate.clipA.id, candidate.clipB.id)}`,
    time: nowClock(),
    camera: candidate.clipB.camera,
    tone: "watch",
    label: `${laterLabel} · ⚠️ ${candidate.clipA.camera}에서 ${minutes}분 전 동일 인물 가능성 ${candidate.score}%`,
    detail: `CORR ${candidate.score}%`,
    source: "correlation",
    confidencePct: candidate.score,
    ...(candidate.clipB.attributes !== undefined ? { attributes: candidate.clipB.attributes } : {}),
  }
}

const buildCorrelationAlert = (
  candidate: CorrelationCandidate,
  clip: EvidenceClip,
): RealtimeAlert => ({
  id: `corr-${pairKey(candidate.clipA.id, candidate.clipB.id)}`,
  kind: "correlation",
  cameraId: candidate.clipB.camera,
  clip,
  autoClose: DEFAULT_AUTO_CLOSE,
  autoCloseMs: DEFAULT_AUTO_CLOSE_MS,
})

export const useCorrelationAlerts = (
  evidenceClips: readonly EvidenceClip[],
  cameras: readonly DynamicCameraRecord[],
  onCorrelationEvidence: (clip: EvidenceClip) => void,
): UseCorrelationAlertsResult => {
  const [alerts, setAlerts] = useState<readonly RealtimeAlert[]>([])
  const bufferRef = useRef<readonly CorrelationEntry[]>([])
  const seenPairsRef = useRef<Set<string>>(new Set())
  const onCorrelationEvidenceRef = useRef(onCorrelationEvidence)
  onCorrelationEvidenceRef.current = onCorrelationEvidence
  const camerasRef = useRef(cameras)
  camerasRef.current = cameras

  useEffect(() => {
    const now = Date.now()

    // 1) Ingest new, attribute-bearing CARLA detections into the private buffer.
    const additions: CorrelationEntry[] = []
    for (const clip of evidenceClips) {
      if (!isCarlaVisionClip(clip) || clip.attributes === undefined) {
        continue
      }
      if (bufferRef.current.some((existing) => existing.clip.id === clip.id)) {
        continue
      }
      const record = camerasRef.current.find((camera) => camera.id === clip.camera)
      if (record === undefined) {
        continue
      }
      additions.push({
        clip,
        cameraId: clip.camera,
        observedAtMs: now,
        node: record.camera.node,
      })
    }

    // 2) Prune entries older than the maximum travel window (own buffer, not the
    //    6-item display cap).
    const pruned = [...bufferRef.current, ...additions].filter(
      (entry) => now - entry.observedAtMs <= MAX_TRAVEL_WINDOW_MS,
    )
    bufferRef.current = pruned

    // 3) Find fresh candidates and act on the confirmed band.
    const candidates = findCorrelationCandidates(pruned, now, seenPairsRef.current)
    for (const candidate of candidates) {
      seenPairsRef.current.add(pairKey(candidate.clipA.id, candidate.clipB.id))
      if (candidate.band === "confirmed") {
        const clip = buildConfirmedClip(candidate, camerasRef.current)
        onCorrelationEvidenceRef.current(clip)
        setAlerts((previous) => [...previous, buildCorrelationAlert(candidate, clip)])
      }
      // Ambiguous band handled in Task 4.
    }
  }, [evidenceClips])

  const dismissAlert = (id: string): void => {
    setAlerts((previous) => previous.filter((alert) => alert.id !== id))
  }

  const updateAlertSettings = (id: string, settings: AlertSettings): void => {
    setAlerts((previous) =>
      previous.map((alert) => (alert.id === id ? { ...alert, ...settings } : alert)),
    )
  }

  return { alerts, dismissAlert, updateAlertSettings }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. The hook is not yet wired anywhere, but it must compile and satisfy Biome.

- [ ] **Step 3: Commit**

```bash
git add src/cop/useCorrelationAlerts.ts
git commit -m "feat(cop): add correlation alerts hook with private buffer and confirmed band"
```

---

### Task 4: `useCorrelationAlerts` ambiguous band — judging alert + direct Codex call

**Files:**
- Modify: `src/cop/useCorrelationAlerts.ts`

**Interfaces:**
- Consumes: `requestCodexAgent`, `CodexAgentContext` from `./codexAgentClient`; `Incident`, `Citation` from `./copData`.
- Produces: no new exports; extends the hook's behavior so the ambiguous (55–79) band shows a "judging" alert immediately, calls Codex directly, then emits one final synthetic `EvidenceClip` and updates the alert text.

- [ ] **Step 1: Add ambiguous-band imports and helpers**

In `src/cop/useCorrelationAlerts.ts`, extend the imports. Replace the existing `import type { EvidenceClip } from "./copData"` line with:

```ts
import type { Citation, EvidenceClip, Incident } from "./copData"
```

Add, directly below that line, the Codex client import:

```ts
import { requestCodexAgent } from "./codexAgentClient"
```

- [ ] **Step 2: Add the ambiguous clip/context builders**

In `src/cop/useCorrelationAlerts.ts`, add these helpers immediately after the existing `buildConfirmedClip` function:

```ts
// Ambiguous clips are emitted once, when Codex resolves. `summary` is Codex's
// decision text on success, or undefined on any failure (rule-based fallback).
const buildAmbiguousClip = (
  candidate: CorrelationCandidate,
  cameras: readonly DynamicCameraRecord[],
  summary: string | undefined,
): EvidenceClip => {
  const laterLabel = labelFor(cameras, candidate.clipB.camera)
  const verdict =
    summary === undefined
      ? `유사도 ${candidate.score}% (규칙 기반)`
      : `Codex 판단: ${summary}`
  return {
    id: `${CORRELATION_CLIP_PREFIX}${pairKey(candidate.clipA.id, candidate.clipB.id)}`,
    time: nowClock(),
    camera: candidate.clipB.camera,
    tone: "watch",
    label: `${laterLabel} · ⚠️ ${candidate.clipA.camera} 동일 인물 가능성 ${candidate.score}% · ${verdict}`,
    detail: `CORR ${candidate.score}%`,
    source: "correlation",
    confidencePct: candidate.score,
    ...(candidate.clipB.attributes !== undefined ? { attributes: candidate.clipB.attributes } : {}),
  }
}

const buildJudgingClip = (
  candidate: CorrelationCandidate,
  cameras: readonly DynamicCameraRecord[],
): EvidenceClip => {
  const laterLabel = labelFor(cameras, candidate.clipB.camera)
  return {
    id: `${CORRELATION_CLIP_PREFIX}judging-${pairKey(candidate.clipA.id, candidate.clipB.id)}`,
    time: nowClock(),
    camera: candidate.clipB.camera,
    tone: "watch",
    label: `${laterLabel} · ⚠️ ${candidate.clipA.camera} 동일 인물 판단 중... 유사도 ${candidate.score}%`,
    detail: `CORR ${candidate.score}%`,
    source: "correlation",
    confidencePct: candidate.score,
    ...(candidate.clipB.attributes !== undefined ? { attributes: candidate.clipB.attributes } : {}),
  }
}

const buildCodexContext = (candidate: CorrelationCandidate): CodexAgentContext => {
  const key = pairKey(candidate.clipA.id, candidate.clipB.id)
  const incident: Incident = {
    id: `inc-corr-${key}`,
    tone: "WATCH",
    // All CARLA cameras ring the single AMMO DEPOT cluster (see design §3); the
    // DynamicCameraRecord has no zone field, so this fixed value is sufficient.
    zone: "AMMO DEPOT CLUSTER",
    title: `${candidate.clipA.camera} → ${candidate.clipB.camera} 동일 인물 가능성 검토`,
    meta: `유사도 ${candidate.score}%`,
    time: nowClock(),
    confidence: candidate.score,
  }
  const citations: readonly Citation[] = [
    { id: `cite-corr-a-${candidate.clipA.id}`, label: candidate.clipA.camera, time: candidate.clipA.time },
    { id: `cite-corr-b-${candidate.clipB.id}`, label: candidate.clipB.camera, time: candidate.clipB.time },
  ]
  return {
    incident,
    citations,
    missingContext: [],
    responseOutcome: "상관관계 자동 판단",
  }
}
```

Note: `CodexAgentContext` is a type; add it to the Codex import. Replace the import line added in Step 1 with:

```ts
import { type CodexAgentContext, requestCodexAgent } from "./codexAgentClient"
```

- [ ] **Step 3: Handle the ambiguous band inside the effect**

In `src/cop/useCorrelationAlerts.ts`, replace the candidate-processing loop (the `for (const candidate of candidates) { ... }` block) with:

```ts
    for (const candidate of candidates) {
      seenPairsRef.current.add(pairKey(candidate.clipA.id, candidate.clipB.id))
      if (candidate.band === "confirmed") {
        const clip = buildConfirmedClip(candidate, camerasRef.current)
        onCorrelationEvidenceRef.current(clip)
        setAlerts((previous) => [...previous, buildCorrelationAlert(candidate, clip)])
        continue
      }
      // Ambiguous: show a local "judging" alert immediately, then consult Codex.
      const judgingClip = buildJudgingClip(candidate, camerasRef.current)
      const alert = buildCorrelationAlert(candidate, judgingClip)
      setAlerts((previous) => [...previous, alert])
      void resolveAmbiguous(candidate, alert.id)
    }
```

- [ ] **Step 4: Add the `resolveAmbiguous` closure**

In `src/cop/useCorrelationAlerts.ts`, add this function **inside** the hook body, directly above the `useEffect(...)` call (so it closes over `setAlerts` and the refs):

```ts
  const resolveAmbiguous = async (
    candidate: CorrelationCandidate,
    alertId: string,
  ): Promise<void> => {
    let summary: string | undefined
    try {
      const decision = await requestCodexAgent(buildCodexContext(candidate))
      summary = decision.decision.summary
    } catch {
      // Never block evidence/alert emission on a Codex failure — fall back to
      // the rule-based text below.
      summary = undefined
    }
    const finalClip = buildAmbiguousClip(candidate, camerasRef.current, summary)
    onCorrelationEvidenceRef.current(finalClip)
    setAlerts((previous) =>
      previous.map((alert) => (alert.id === alertId ? { ...alert, clip: finalClip } : alert)),
    )
  }
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Run the full unit suite (nothing should regress)**

Run: `npm run test`
Expected: PASS — `personCorrelation.test.ts` and all existing unit tests green.

- [ ] **Step 7: Commit**

```bash
git add src/cop/useCorrelationAlerts.ts
git commit -m "feat(cop): consult Codex directly for ambiguous correlation matches"
```

---

### Task 5: Wire `useCorrelationAlerts` into `CopDashboard`

**Files:**
- Modify: `src/cop/CopDashboard.tsx`

**Interfaces:**
- Consumes: `useCorrelationAlerts` from `./useCorrelationAlerts`.
- Produces: correlation alerts merged into the single `RealtimeAlertStack`; confirmed/ambiguous synthetic clips fed through the existing `addVisionEvidence`.

- [ ] **Step 1: Import the hook**

In `src/cop/CopDashboard.tsx`, add this import directly below the existing `import { useCarlaCameras } from "./useCarlaCameras"` line:

```ts
import { useCorrelationAlerts } from "./useCorrelationAlerts"
```

- [ ] **Step 2: Call the hook and merge alert arrays**

In `src/cop/CopDashboard.tsx`, replace the existing single line:

```ts
  const { alerts, dismissAlert, updateAlertSettings } = useRealtimeAlerts(evidenceClips)
```

with:

```ts
  const { alerts, dismissAlert, updateAlertSettings } = useRealtimeAlerts(evidenceClips)
  const {
    alerts: correlationAlerts,
    dismissAlert: dismissCorrelationAlert,
    updateAlertSettings: updateCorrelationAlertSettings,
  } = useCorrelationAlerts(evidenceClips, cameras, addVisionEvidence)
  const combinedAlerts = [...alerts, ...correlationAlerts]
  const dismissAnyAlert = (id: string): void => {
    dismissAlert(id)
    dismissCorrelationAlert(id)
  }
  const updateAnyAlertSettings = (
    id: string,
    settings: { readonly autoClose: boolean; readonly autoCloseMs: number },
  ): void => {
    updateAlertSettings(id, settings)
    updateCorrelationAlertSettings(id, settings)
  }
```

Note: `addVisionEvidence` is declared with `const addVisionEvidence = (clip) => {...}` later in the component (a function expression). Because `useCorrelationAlerts` stores the callback in a ref and only invokes it inside an effect/async resolution — never during render — passing it here before its textual declaration is safe at runtime (the effect runs after the full render). If Biome's `use-before-define` flags it, move the `useCorrelationAlerts` call to directly **below** the `addVisionEvidence` declaration instead; the merged-array variables must then also move below it. Keep `combinedAlerts`/`dismissAnyAlert`/`updateAnyAlertSettings` defined before the `return`.

- [ ] **Step 3: Pass the merged handlers to `RealtimeAlertStack`**

In `src/cop/CopDashboard.tsx`, replace the `RealtimeAlertStack` render at the bottom:

```tsx
      <RealtimeAlertStack
        alerts={combinedAlerts}
        onDismiss={dismissAnyAlert}
        onUpdateSettings={updateAnyAlertSettings}
      />
```

- [ ] **Step 4: Typecheck + lint + unit tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS. If Biome reports `use-before-define` for `addVisionEvidence`, apply the reordering described in Step 2's note, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/cop/CopDashboard.tsx
git commit -m "feat(cop): wire correlation alerts into the dashboard alert stack"
```

---

### Task 6: Remove the manual Codex-request button from `RightRailCodex.tsx`

**Files:**
- Modify: `src/cop/RightRailCodex.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: the auto `useEffect`-driven `requestDecision()` path and the failure display remain intact; the manual `<button>` is gone.

- [ ] **Step 1: Delete the manual button JSX**

In `src/cop/RightRailCodex.tsx`, remove the entire trailing `<button>...</button>` element (the block that renders `{state.kind === "loading" ? "서버 Codex 판단 요청 중" : "서버 Codex 판단 요청"}`), leaving the rest of the `<section>` unchanged. Delete exactly:

```tsx
      <button
        type="button"
        className="cop-button full"
        disabled={state.kind === "loading"}
        onClick={() => {
          void requestDecision()
        }}
      >
        {state.kind === "loading" ? "서버 Codex 판단 요청 중" : "서버 Codex 판단 요청"}
      </button>
```

The `requestDecision` callback, the `useEffect` that calls it on `selectionScope` change, and the `state.kind === "failure"` error paragraph all remain untouched.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. `requestDecision` is still referenced by the `useEffect`, so there is no unused-variable error.

- [ ] **Step 3: Commit**

```bash
git add src/cop/RightRailCodex.tsx
git commit -m "refactor(cop): drop manual server Codex request button, keep auto request"
```

---

### Task 7: e2e coverage — correlation alerts + Codex auto-call + button-removal updates

**Files:**
- Modify: `tests/e2e/cop.spec.ts`

**Interfaces:**
- Consumes: the full wired feature (Tasks 1–6).
- Produces: two new correlation tests; three existing tests updated for the removed manual button.

- [ ] **Step 1: Update the main test — drop the manual button click**

In `tests/e2e/cop.spec.ts`, inside the test `"컨셉의 모든 표면과 기능을 노출한다"`, the Codex-summary block currently reads:

```ts
      await page.getByRole("button", { name: "서버 Codex 판단 요청" }).click()
      await expect(page.getByText(/서버 Codex 하네스 판단/)).toBeVisible()
```

Replace it with (the auto `useEffect` request already fires on mount for the standby incident, so the decision text appears without a click):

```ts
      // The Codex request now fires automatically on selection; the manual
      // button was removed. The decision text appears without any click.
      await expect(page.getByText(/서버 Codex 하네스 판단/)).toBeVisible()
```

- [ ] **Step 2: Update the attribute test — drop the manual button click**

In `tests/e2e/cop.spec.ts`, inside the test `"추출된 인물 속성이 EVENT TIMELINE과 Codex 입력에 반영된다"`, the tail currently reads:

```ts
    await page.getByRole("button", { name: "서버 Codex 판단 요청" }).click()
    await expect.poll(() => postedSummary).toContain("배낭 소지")
    await expect.poll(() => postedSummary).toContain("모자 없음")
```

Replace it with (the attribute-enriched incident is auto-selected and auto-requested; the posted summary carries the attributes without a click):

```ts
    // The auto Codex request for the selected attribute-enriched incident posts
    // the enriched summary; no manual button is needed.
    await expect.poll(() => postedSummary, { timeout: 10_000 }).toContain("배낭 소지")
    await expect.poll(() => postedSummary, { timeout: 10_000 }).toContain("모자 없음")
```

- [ ] **Step 3: Rewrite the stale-race test to use auto requests**

In `tests/e2e/cop.spec.ts`, inside the test `"Codex 요청 중 사건을 바꿔도 이전 판단을 표시하지 않는다"`, replace the tail block (from `await incidents.locator(".cop-incident", { hasText: "CARLA-STALE-A" }).click()` through the final `await expect(page.getByRole("button", { name: "서버 Codex 판단 요청" })).toBeEnabled()`) with the auto-request race below. The Codex mock already echoes the incident id and delays 300 ms, so switching selection A→B lets A's response arrive stale and the `requestVersion` guard must drop it:

```ts
    // Selecting incident A auto-fires a Codex request (300ms delayed mock).
    // Immediately switching to B fires a second request; the requestVersion
    // guard must drop A's stale response so it never replaces the panel.
    const staleResponseA = page.waitForResponse(
      (response) =>
        response.url().includes("/api/codex-agent") &&
        (response.request().postDataJSON()?.evidence?.incidentId ?? "") ===
          "inc-CARLA-STALE-A",
    )
    await incidents.locator(".cop-incident", { hasText: "CARLA-STALE-A" }).click()
    await incidents.locator(".cop-incident", { hasText: "CARLA-STALE-B" }).click()
    await staleResponseA

    await expect(page.locator(".cop-codex")).toHaveCount(1)
    // The stale request bound to incident A must never replace the active panel.
    await expect(page.getByText("판단-inc-CARLA-STALE-A")).toHaveCount(0)
    // B's decision is the one that lands.
    await expect(page.getByText("판단-inc-CARLA-STALE-B")).toBeVisible()
```

- [ ] **Step 4: Add the confirmed-band correlation test**

In `tests/e2e/cop.spec.ts`, add this test at the end of the `test.describe("D4D COP 표면과 상호작용", ...)` block (before its closing `})`). Two CARLA cameras both stream the **same** solid-red frame, DETR detects a person in each, and the CLIP mock returns identical binary attributes — so both clips share every attribute (score 100 → confirmed). An amber correlation alert appears and a synthetic clip lands on EVENT TIMELINE:

```ts
  test("동일 속성이 두 카메라에서 잡히면 확신 구간 상관관계 알림과 합성 클립을 만든다", async ({
    page,
  }) => {
    const RED_FRAME =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4IyICAALUAQVZcNPCAAAAAElFTkSuQmCC"
    const RED_PNG = Buffer.from(RED_FRAME.split(",")[1] ?? "", "base64")

    const cameraA = {
      id: "CARLA-CORR-A",
      label: "상관관계 A",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl: RED_FRAME,
    }
    const cameraB = {
      id: "CARLA-CORR-B",
      label: "상관관계 B",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:02.000Z",
      lastFrameAt: "2026-07-03T00:00:03.000Z",
      latestFrameDataUrl: RED_FRAME,
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({ status: 200, contentType: "image/png", body: RED_PNG })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [cameraA, cameraB] }),
      })
    })

    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "person", score: 0.9, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
      window.__D4D_TEST_CLIP_CLASSIFIER__ = async (_source, candidateLabels) => {
        const first = candidateLabels[0]
        const second = candidateLabels[1]
        if (first === undefined || second === undefined) {
          return []
        }
        return [
          { label: first, score: 0.85 },
          { label: second, score: 0.15 },
        ]
      }
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "corr-confirmed-sequence",
          cameraId: "CARLA-CORR",
          detections: [{ id: "det-corr-001", label: "person", confidence: 0.9 }],
          tracks: [{ id: "trk-corr-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    await page.goto("/")

    // A cross-camera full match (score 100) raises an amber correlation alert.
    const correlationAlert = page.locator(".cop-realtime-alert.kind-correlation")
    await expect(correlationAlert.first()).toBeVisible({ timeout: 15_000 })
    await expect(correlationAlert.first().getByText(/동일 인물 가능성 100%/)).toBeVisible()

    // The synthetic correlation clip lands on EVENT TIMELINE as a track block.
    await expect
      .poll(() => page.locator(".cop-track-block").count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2)
  })
```

- [ ] **Step 5: Add the ambiguous-band Codex auto-call test**

In `tests/e2e/cop.spec.ts`, add this test directly after the confirmed test. Camera A streams a **red** frame and camera B a **blue** frame, so `topColor` differs (−30 → score 70, ambiguous) while every other attribute matches. The hook shows a "판단 중" alert, calls Codex directly, and updates the alert text to `Codex 판단: <summary>`:

```ts
  test("애매 구간 상관관계는 Codex를 자동 호출하고 알림 문구를 갱신한다", async ({ page }) => {
    const RED_FRAME =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4IyICAALUAQVZcNPCAAAAAElFTkSuQmCC"
    const BLUE_FRAME =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQEbkDAAFEAQUI0UFLAAAAAElFTkSuQmCC"
    const RED_PNG = Buffer.from(RED_FRAME.split(",")[1] ?? "", "base64")

    const cameraA = {
      id: "CARLA-AMB-A",
      label: "애매 A",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl: RED_FRAME,
    }
    const cameraB = {
      id: "CARLA-AMB-B",
      label: "애매 B",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:02.000Z",
      lastFrameAt: "2026-07-03T00:00:03.000Z",
      latestFrameDataUrl: BLUE_FRAME,
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({ status: 200, contentType: "image/png", body: RED_PNG })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [cameraA, cameraB] }),
      })
    })

    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "person", score: 0.9, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
      window.__D4D_TEST_CLIP_CLASSIFIER__ = async (_source, candidateLabels) => {
        const first = candidateLabels[0]
        const second = candidateLabels[1]
        if (first === undefined || second === undefined) {
          return []
        }
        return [
          { label: first, score: 0.85 },
          { label: second, score: 0.15 },
        ]
      }
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "corr-ambiguous-sequence",
          cameraId: "CARLA-AMB",
          detections: [{ id: "det-amb-001", label: "person", confidence: 0.9 }],
          tracks: [{ id: "trk-amb-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    let correlationCodexCalled = false
    await page.route("**/api/codex-agent", async (route) => {
      const payload = route.request().postDataJSON()
      if ((payload?.evidence?.responseOutcome ?? "") === "상관관계 자동 판단") {
        correlationCodexCalled = true
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          codexMode: "local-codex-adapter",
          decision: {
            title: "상관관계 판단",
            summary: "동일 인물 가능성 높음",
            recommendedAction: "사람 확인 유지",
            checkpoint: "correlation-review",
          },
          citations: ["CARLA-AMB-A", "CARLA-AMB-B"],
          adapterNotice: "테스트 응답",
        }),
      })
    })

    await page.goto("/")

    // A color-only mismatch (score 70) is ambiguous: a "판단 중" alert appears,
    // Codex is consulted directly, and the alert text is rewritten with the
    // Codex summary.
    const correlationAlert = page.locator(".cop-realtime-alert.kind-correlation")
    await expect(correlationAlert.first()).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(() => correlationCodexCalled, { timeout: 15_000 })
      .toBe(true)
    await expect(
      correlationAlert.getByText(/Codex 판단: 동일 인물 가능성 높음/),
    ).toBeVisible({ timeout: 15_000 })
  })
```

- [ ] **Step 6: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS — all existing tests plus the two new correlation tests are green. If the confirmed/ambiguous timing is flaky, raise the affected `timeout` values; do not weaken the assertions.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/cop.spec.ts
git commit -m "test(cop): cover correlation alerts, ambiguous Codex auto-call, button removal"
```

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full QA gate**

Run: `npm run qa:final`
Expected: PASS — typecheck, Biome, Vitest, and the production build all succeed.

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS — full Playwright suite green.

- [ ] **Step 3: Fix anything found**

If any check fails, use superpowers:systematic-debugging to find the root cause, fix it, re-run the failing command until green, and commit the fix:

```bash
git add -A
git commit -m "fix(cop): resolve correlation feature verification findings"
```

- [ ] **Step 4: Confirm no unrelated files were touched**

Run: `git status --short`
Expected: the correlation feature files are committed; the pre-existing uncommitted CARLA-WebRTC WIP in the working tree is unchanged and was never staged.

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-03-cross-camera-correlation-design.md`):

- §1 similarity score (weights 30/20/20/20/10) → Task 1 `computeSimilarityScore` + tests. ✓
- §1 bands (<55 none, 55–79 ambiguous, 80+ confirmed) → Task 1 `bandForScore` + tests; Task 3 confirmed; Task 4 ambiguous. ✓
- §1 different-camera-only + both-have-attributes → Task 1 `findCorrelationCandidates` (camera-id skip, attributes skip) + tests. ✓
- §1 distance-based time window (band-50 scale, 1.2 m/s, clamp 20–240s) → Task 1 `METERS_PER_PX`, `travelTimeWindowMs` + clamp tests. ✓
- §2 separate buffer independent of `MAX_VISION_EVIDENCE`, `Date.now()` stamp, prune > `MAX_TRAVEL_WINDOW_MS` → Task 3 `bufferRef` ingest/prune. ✓
- §3 `personCorrelation.ts` exact types/functions → Task 1. ✓
- §3 `useCorrelationAlerts` inputs (`evidenceClips`, `cameras`, `onCorrelationEvidence`) → Task 3 signature. ✓
- §3 confirmed synthetic clip (`source: "correlation"`, later camera, label with elapsed minutes + score, later attributes) → Task 3 `buildConfirmedClip`. ✓
- §3 ambiguous local judging alert + direct `requestCodexAgent` with synthetic Incident (`WATCH`, `AMMO DEPOT CLUSTER`, title, meta, time, `confidence: score`), citations = two camera ids, `missingContext: []`, `responseOutcome: "상관관계 자동 판단"`, one final clip on resolve (success summary / failure fallback), alert text update → Task 4. ✓
- §3 confirmed clip reuses `buildIncidents` → `evidence.summary` with no new Codex wiring → Task 3 clip carries later camera so it becomes that camera's latest clip / incident title (existing pipeline). ✓
- §3 `RealtimeAlertStack` `kind` field + amber correlation styling; merge in `CopDashboard` → Task 2 + Task 5. ✓
- §3 `RightRailCodex` manual button removal, auto request kept → Task 6. ✓
- §5 unit tests (score, window clamps, candidate filtering incl. seen pairs) → Task 1 tests. ✓
- §5 e2e (confirmed alert, ambiguous Codex auto-call + text update, synthetic clip on timeline, button-removal test updates) → Task 7. ✓
- §6 verification (`typecheck && lint && test`, both scenarios, button gone with fallback intact) → Task 8 + Task 7. ✓

No uncovered spec requirement found.

**2. Placeholder scan:** No `TBD`/`TODO`/`similar to Task N`/"add error handling" placeholders. Every code step contains complete runnable code; the two 1×1 PNG data URLs are concrete verified values (red → `topColor "red"`, blue → `topColor "blue"`).

**3. Type consistency:** `CorrelationCandidate` (`clipA`/`clipB`/`observedAtMsA`/`observedAtMsB`/`score`/`band`), `CorrelationEntry`, `pairKey`, `findCorrelationCandidates(entries, nowMs, seenPairKeys)`, `CORRELATION_CLIP_PREFIX`, and the hook return shape (`alerts`/`dismissAlert`/`updateAlertSettings`) are named identically everywhere they appear across Tasks 1, 3, 4, 5. `RealtimeAlert.kind` is `"detection" | "correlation"` in Task 2 and set consistently in `useRealtimeAlerts` (Task 2) and `useCorrelationAlerts` (Task 3). `EvidenceClipSource` includes `"correlation"` (Task 2) and every synthetic clip sets `source: "correlation"` (Tasks 3–4). `Incident`/`Citation`/`CodexAgentContext` field names match `copAnalysisData.ts` and `codexAgentClient.ts` exactly.
