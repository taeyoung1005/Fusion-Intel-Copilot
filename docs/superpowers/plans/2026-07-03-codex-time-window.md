# Codex Time-Window Judgment Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Codex judgment request (both the automatic per-selected-incident request and the D-phase ambiguous-correlation auto-call) include a summary of recent activity for the relevant camera — detection count, duration, and risk trend over an adaptive time window — instead of judging from a single evidence snapshot.

**Architecture:** A new pure module (`evidenceWindowSummary.ts`) computes the adaptive window size from a camera's most recent tone and summarizes a list of timestamped evidence entries into a short Korean sentence. A new hook (`evidenceWindowBuffer.ts`) maintains a private, time-pruned, per-camera buffer of all vision-source evidence clips (independent of the small `MAX_VISION_EVIDENCE=6` display cap, mirroring the D-phase `useCorrelationAlerts` buffer pattern). `codexAgentClient.ts` grows one new optional context field that gets folded into `evidence.summary` — no new backend wiring. Both existing Codex call sites (`RightRailCodex.tsx`'s automatic per-selection request, and `useCorrelationAlerts.ts`'s ambiguous-band auto-call) pass this field through.

**Tech Stack:** TypeScript, React 19, Vitest, Playwright, Biome.

## Global Constraints

- Adaptive window size by the camera's most recent actual `EvidenceClip.tone` (`AlertTone`): `alert` → 2 minutes (120,000ms), `watch` → 5 minutes (300,000ms), everything else (`normal`, `confirmed`, `uncertain`) → 10 minutes (600,000ms).
- Summary content: detection count, first/last observed time span, and risk trend ("상승" if the worst tone in the window outranks the first clip's tone, otherwise "유지").
- The per-camera buffer stores every `source: "vision"` evidence clip (attributes or not — vehicles count too), independent of the 6-item `MAX_VISION_EVIDENCE` display cap. It must NOT include `"correlation"`-source synthetic clips (they would summarize themselves).
- No new Codex backend wiring: the new context field is folded into the existing `evidence.summary` string exactly like the B-phase attribute text and the D-phase correlation principle — reuse, don't rebuild.
- A missing/empty window (no entries) must not produce an empty or malformed summary — omit the field entirely rather than send blank text.
- This repo has no separate feature branch — work and commit directly on `main` (established pattern for this project).

---

### Task 1: `evidenceWindowSummary.ts` pure logic + tests

**Files:**
- Create: `src/cop/evidenceWindowSummary.ts`
- Create: `src/cop/evidenceWindowSummary.test.ts`

**Interfaces:**
- Consumes: `type AlertTone` from `./copMapBaseData`; `type EvidenceClip` from `./copTimelineData`.
- Produces (relied on by Tasks 2, 4, 5): `type WindowEntry = { readonly clip: EvidenceClip; readonly observedAtMs: number }`, `type WindowSummary = { readonly count: number; readonly firstObservedAtMs: number; readonly lastObservedAtMs: number; readonly worstTone: AlertTone; readonly escalated: boolean; readonly text: string }`, `MAX_WINDOW_MS = 600_000`, `windowMsForTone(tone: AlertTone): number`, `summarizeWindow(entries: readonly WindowEntry[], nowMs: number, windowMs: number): WindowSummary | undefined`.

- [ ] **Step 1: Write the failing tests**

Create `src/cop/evidenceWindowSummary.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { EvidenceClip } from "./copTimelineData"
import {
  MAX_WINDOW_MS,
  type WindowEntry,
  summarizeWindow,
  windowMsForTone,
} from "./evidenceWindowSummary"

const clip = (id: string, tone: EvidenceClip["tone"], time: string): EvidenceClip => ({
  id,
  time,
  camera: "CARLA-01",
  tone,
  label: `CARLA-01 ${tone} 탐지`,
  detail: "CONF 90%",
  source: "vision",
  confidencePct: 90,
})

const entry = (id: string, tone: EvidenceClip["tone"], time: string, observedAtMs: number): WindowEntry => ({
  clip: clip(id, tone, time),
  observedAtMs,
})

describe("windowMsForTone", () => {
  it("returns 2 minutes for alert", () => {
    expect(windowMsForTone("alert")).toBe(120_000)
  })

  it("returns 5 minutes for watch", () => {
    expect(windowMsForTone("watch")).toBe(300_000)
  })

  it("returns 10 minutes for normal", () => {
    expect(windowMsForTone("normal")).toBe(600_000)
  })

  it("returns 10 minutes for confirmed and uncertain (fallback)", () => {
    expect(windowMsForTone("confirmed")).toBe(MAX_WINDOW_MS)
    expect(windowMsForTone("uncertain")).toBe(MAX_WINDOW_MS)
  })
})

describe("summarizeWindow", () => {
  it("returns undefined for an empty entry list", () => {
    expect(summarizeWindow([], 10_000, 300_000)).toBeUndefined()
  })

  it("returns undefined when every entry falls outside the window", () => {
    const entries = [entry("c1", "normal", "09:00:00", 0)]
    expect(summarizeWindow(entries, 400_000, 300_000)).toBeUndefined()
  })

  it("summarizes a single in-window entry as steady (not escalated)", () => {
    const entries = [entry("c1", "watch", "09:10:00", 100_000)]
    const summary = summarizeWindow(entries, 150_000, 300_000)
    expect(summary).toEqual({
      count: 1,
      firstObservedAtMs: 100_000,
      lastObservedAtMs: 100_000,
      worstTone: "watch",
      escalated: false,
      text: "5분간 1회 탐지, 09:10:00~09:10:00 지속, 위험도 유지",
    })
  })

  it("marks escalated when the worst tone outranks the first tone", () => {
    const entries = [
      entry("c1", "normal", "09:10:00", 100_000),
      entry("c2", "watch", "09:11:00", 160_000),
      entry("c3", "alert", "09:12:00", 220_000),
    ]
    const summary = summarizeWindow(entries, 300_000, 300_000)
    expect(summary?.count).toBe(3)
    expect(summary?.worstTone).toBe("alert")
    expect(summary?.escalated).toBe(true)
    expect(summary?.text).toBe("5분간 3회 탐지, 09:10:00~09:12:00 지속, 위험도 상승(normal→alert)")
  })

  it("excludes entries older than the window relative to nowMs", () => {
    const entries = [
      entry("old", "alert", "08:00:00", 0),
      entry("recent", "normal", "09:14:00", 280_000),
    ]
    const summary = summarizeWindow(entries, 300_001, 300_000)
    expect(summary?.count).toBe(1)
    expect(summary?.worstTone).toBe("normal")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cop/evidenceWindowSummary.test.ts`
Expected: FAIL with "Cannot find module './evidenceWindowSummary'"

- [ ] **Step 3: Write the implementation**

Create `src/cop/evidenceWindowSummary.ts`:

```ts
import type { AlertTone } from "./copMapBaseData"
import type { EvidenceClip } from "./copTimelineData"

export const ALERT_WINDOW_MS = 120_000
export const WATCH_WINDOW_MS = 300_000
export const MAX_WINDOW_MS = 600_000

export type WindowEntry = {
  readonly clip: EvidenceClip
  readonly observedAtMs: number
}

export type WindowSummary = {
  readonly count: number
  readonly firstObservedAtMs: number
  readonly lastObservedAtMs: number
  readonly worstTone: AlertTone
  readonly escalated: boolean
  readonly text: string
}

export const windowMsForTone = (tone: AlertTone): number => {
  if (tone === "alert") {
    return ALERT_WINDOW_MS
  }
  if (tone === "watch") {
    return WATCH_WINDOW_MS
  }
  return MAX_WINDOW_MS
}

// Mirrors operationalTelemetry.ts's local toneRank: alert is worst (3), watch is
// middle (2), everything else (normal/confirmed/uncertain) ranks lowest (1) —
// those three tones never practically occur on EvidenceClip.tone in this harness.
const toneRank = (tone: AlertTone): number => {
  if (tone === "alert") {
    return 3
  }
  if (tone === "watch") {
    return 2
  }
  return 1
}

const formatMinutes = (windowMs: number): number => Math.round(windowMs / 60_000)

export const summarizeWindow = (
  entries: readonly WindowEntry[],
  nowMs: number,
  windowMs: number,
): WindowSummary | undefined => {
  const inWindow = entries.filter((entry) => nowMs - entry.observedAtMs <= windowMs)
  if (inWindow.length === 0) {
    return undefined
  }

  const sorted = [...inWindow].sort((a, b) => a.observedAtMs - b.observedAtMs)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) {
    return undefined
  }

  const worst = sorted.reduce(
    (max, entry) => (toneRank(entry.clip.tone) > toneRank(max.clip.tone) ? entry : max),
    first,
  )
  const escalated = toneRank(worst.clip.tone) > toneRank(first.clip.tone)
  const minutes = formatMinutes(windowMs)
  const trendText = escalated
    ? `위험도 상승(${first.clip.tone}→${worst.clip.tone})`
    : "위험도 유지"
  const text = `${minutes}분간 ${sorted.length}회 탐지, ${first.clip.time}~${last.clip.time} 지속, ${trendText}`

  return {
    count: sorted.length,
    firstObservedAtMs: first.observedAtMs,
    lastObservedAtMs: last.observedAtMs,
    worstTone: worst.clip.tone,
    escalated,
    text,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cop/evidenceWindowSummary.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/cop/evidenceWindowSummary.ts src/cop/evidenceWindowSummary.test.ts
git commit -m "feat(cop): add adaptive time-window evidence summary logic"
```

---

### Task 2: `evidenceWindowBuffer.ts` hook

**Files:**
- Create: `src/cop/evidenceWindowBuffer.ts`

**Interfaces:**
- Consumes: `type WindowEntry`, `MAX_WINDOW_MS` from `./evidenceWindowSummary`; `type EvidenceClip` from `./copTimelineData`.
- Produces (relied on by Tasks 4, 6): `useEvidenceWindowBuffer(evidenceClips: readonly EvidenceClip[]): ReadonlyMap<string, readonly WindowEntry[]>`.

No unit test for this task — this repo's Vitest runs in a Node environment with no jsdom/testing-library (confirmed: `useRealtimeAlerts.ts` and `useCorrelationAlerts.ts`, the two hooks this mirrors, have no direct unit tests either — DOM/React-dependent code in this project is covered by Playwright e2e only). Coverage comes from Task 7's e2e tests.

- [ ] **Step 1: Write the implementation**

Create `src/cop/evidenceWindowBuffer.ts`:

```ts
import { useRef } from "react"
import type { EvidenceClip } from "./copTimelineData"
import { MAX_WINDOW_MS, type WindowEntry } from "./evidenceWindowSummary"

export const useEvidenceWindowBuffer = (
  evidenceClips: readonly EvidenceClip[],
): ReadonlyMap<string, readonly WindowEntry[]> => {
  const bufferRef = useRef<Map<string, WindowEntry[]>>(new Map())
  const seenClipIdsRef = useRef<Set<string>>(new Set())

  const now = Date.now()

  for (const clip of evidenceClips) {
    if (clip.source !== "vision" || seenClipIdsRef.current.has(clip.id)) {
      continue
    }
    seenClipIdsRef.current.add(clip.id)
    const existing = bufferRef.current.get(clip.camera) ?? []
    bufferRef.current.set(clip.camera, [...existing, { clip, observedAtMs: now }])
  }

  const pruned = new Map<string, WindowEntry[]>()
  for (const [cameraId, entries] of bufferRef.current) {
    const kept = entries.filter((entry) => now - entry.observedAtMs <= MAX_WINDOW_MS)
    if (kept.length > 0) {
      pruned.set(cameraId, kept)
    }
  }
  bufferRef.current = pruned

  return bufferRef.current
}
```

Note: this hook intentionally does the ingest/prune work directly in the render body (not inside a `useEffect`) — reading `evidenceClips` and mutating the ref is safe here because the result is derived synchronously and returned the same render, matching the read-then-return pattern already used for plain derived values elsewhere in this codebase (e.g. `CopDashboard.tsx`'s `useMemo` blocks). Unlike `useCorrelationAlerts`, this hook never calls `setState`, so there's no risk of the render-phase mutation triggering a re-render loop.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 3: Run the full existing test suite**

Run: `npm run test`
Expected: PASS (all existing tests unaffected — this task only adds a new file nothing else imports yet)

- [ ] **Step 4: Commit**

```bash
git add src/cop/evidenceWindowBuffer.ts
git commit -m "feat(cop): add per-camera evidence window buffer hook"
```

---

### Task 3: `codexAgentClient.ts` — add `recentActivitySummary` field

**Files:**
- Modify: `src/cop/codexAgentClient.ts`

**Interfaces:**
- Produces (relied on by Tasks 4, 5): `CodexAgentContext` gains `readonly recentActivitySummary?: string`.

- [ ] **Step 1: Confirm the current content**

Run: `grep -n "CodexAgentContext\|증거 패킷" src/cop/codexAgentClient.ts`

Confirm it shows:
```ts
export type CodexAgentContext = {
  readonly incident: Incident
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly responseOutcome: string
}
```
and
```ts
          summary: `${context.incident.zone} ${context.incident.meta} 증거 패킷 — ${context.incident.title}`,
```

- [ ] **Step 2: Add the field and fold it into `evidence.summary`**

Modify `src/cop/codexAgentClient.ts` — change `CodexAgentContext` to:

```ts
export type CodexAgentContext = {
  readonly incident: Incident
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly responseOutcome: string
  readonly recentActivitySummary?: string
}
```

And change the `summary` line inside `requestCodexAgent`'s request body to:

```ts
          summary: `${context.incident.zone} ${context.incident.meta} 증거 패킷 — ${context.incident.title}${
            context.recentActivitySummary !== undefined ? ` · ${context.recentActivitySummary}` : ""
          }`,
```

- [ ] **Step 3: Typecheck, lint, run the full existing test suite**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS (no existing test asserts the exact literal `evidence.summary` string, based on the current test suite's route mocks only asserting response-side behavior — but re-run to be sure)

- [ ] **Step 4: Commit**

```bash
git add src/cop/codexAgentClient.ts
git commit -m "feat(cop): add optional recentActivitySummary to Codex evidence.summary"
```

---

### Task 4: `useCorrelationAlerts.ts` — pass window summary for ambiguous-band Codex calls

**Files:**
- Modify: `src/cop/useCorrelationAlerts.ts`

**Interfaces:**
- Consumes: `type WindowEntry`, `windowMsForTone`, `summarizeWindow` from `./evidenceWindowSummary`.
- Produces: `useCorrelationAlerts` gains a new 4th parameter: `windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>` (relied on by Task 6's `CopDashboard.tsx` call site).

- [ ] **Step 1: Confirm current content**

Run: `cat -n src/cop/useCorrelationAlerts.ts`

Confirm the file matches what's shown in this plan's Architecture section (the version with `buildCodexContext`, `resolveAmbiguous`, and `useCorrelationAlerts(evidenceClips, cameras, onCorrelationEvidence)` taking exactly 3 parameters). If it has diverged, STOP and report the actual content instead of guessing.

- [ ] **Step 2: Add the parameter and thread it through**

Modify `src/cop/useCorrelationAlerts.ts`. Add this import:

```ts
import { type WindowEntry, summarizeWindow, windowMsForTone } from "./evidenceWindowSummary"
```

Change `buildCodexContext` to accept and use a window summary:

```ts
const buildCodexContext = (
  candidate: CorrelationCandidate,
  recentActivitySummary: string | undefined,
): CodexAgentContext => {
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
    {
      id: `cite-corr-a-${candidate.clipA.id}`,
      label: candidate.clipA.camera,
      time: candidate.clipA.time,
    },
    {
      id: `cite-corr-b-${candidate.clipB.id}`,
      label: candidate.clipB.camera,
      time: candidate.clipB.time,
    },
  ]
  return {
    incident,
    citations,
    missingContext: [],
    responseOutcome: "상관관계 자동 판단",
    ...(recentActivitySummary !== undefined ? { recentActivitySummary } : {}),
  }
}
```

Add a helper right after `labelFor`:

```ts
const summaryForCamera = (
  windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>,
  cameraId: string,
  nowMs: number,
): string | undefined => {
  const entries = windowBuffer.get(cameraId)
  if (entries === undefined || entries.length === 0) {
    return undefined
  }
  const latestTone = entries[entries.length - 1]?.clip.tone ?? "normal"
  const windowMs = windowMsForTone(latestTone)
  return summarizeWindow(entries, nowMs, windowMs)?.text
}
```

Change the `useCorrelationAlerts` function signature and its internal `windowBuffer` tracking:

```ts
export const useCorrelationAlerts = (
  evidenceClips: readonly EvidenceClip[],
  cameras: readonly DynamicCameraRecord[],
  onCorrelationEvidence: (clip: EvidenceClip) => void,
  windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>,
): UseCorrelationAlertsResult => {
  const [alerts, setAlerts] = useState<readonly RealtimeAlert[]>([])
  const bufferRef = useRef<readonly CorrelationEntry[]>([])
  const seenPairsRef = useRef<Set<string>>(new Set())
  const onCorrelationEvidenceRef = useRef(onCorrelationEvidence)
  onCorrelationEvidenceRef.current = onCorrelationEvidence
  const camerasRef = useRef(cameras)
  camerasRef.current = cameras
  const windowBufferRef = useRef(windowBuffer)
  windowBufferRef.current = windowBuffer

  const resolveAmbiguous = async (
    candidate: CorrelationCandidate,
    alertId: string,
  ): Promise<void> => {
    let summary: string | undefined
    try {
      const recentActivitySummary = summaryForCamera(
        windowBufferRef.current,
        candidate.clipB.camera,
        Date.now(),
      )
      const decision = await requestCodexAgent(buildCodexContext(candidate, recentActivitySummary))
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

(The rest of the function — the `useEffect` body, `dismissAlert`, `updateAlertSettings`, and the final `return` — is unchanged from the current file.)

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: FAIL at this point — `CopDashboard.tsx`'s call site still passes only 3 arguments. This is expected; Task 6 updates that call site. Confirm the error is exactly a missing-4th-argument error on the `useCorrelationAlerts(...)` call in `CopDashboard.tsx`, and nowhere else.

- [ ] **Step 4: Commit**

```bash
git add src/cop/useCorrelationAlerts.ts
git commit -m "feat(cop): thread recent-activity summary into ambiguous-band Codex calls"
```

(Committing with a known, precisely-scoped typecheck failure in a not-yet-updated call site is intentional here — Task 6 fixes it in the same sequence. If your environment's commit hooks block on typecheck failures, note this in your report; otherwise proceed.)

---

### Task 5: `RightRail.tsx` + `RightRailCodex.tsx` — thread the summary into the automatic request

**Files:**
- Modify: `src/cop/RightRail.tsx`
- Modify: `src/cop/RightRailCodex.tsx`

**Interfaces:**
- Consumes: nothing new from earlier tasks besides the `CodexAgentContext.recentActivitySummary` field (Task 3).
- Produces (relied on by Task 6): `RightRail` gains a new prop `readonly recentActivitySummary: string | undefined`; `CodexSummary` (in `RightRailCodex.tsx`) gains the same prop.

- [ ] **Step 1: Add the prop to `RightRail.tsx`**

Modify `src/cop/RightRail.tsx`. Add to `RightRailProps`:

```ts
type RightRailProps = {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly incidents: readonly Incident[]
  readonly citations: readonly Citation[]
  readonly codexMetrics: readonly CodexMetric[]
  readonly missingContext: readonly MissingContext[]
  readonly responseGates: readonly ResponseGate[]
  readonly reportRows: readonly DailyReportRow[]
  readonly reportPeriod: string
  readonly cameraLabel: string
  readonly selectedCitationId: string
  readonly recentActivitySummary: string | undefined
  readonly onSelectCitation: (citationId: string) => void
  readonly onSelectIncident: (incidentId: string) => void
  readonly onVisionEvidence: (clip: EvidenceClip) => void
}
```

Add `recentActivitySummary` to the destructured parameters and pass it to `CodexSummary`:

```ts
export function RightRail({
  selectedClip,
  selectedIncident,
  incidents,
  citations,
  codexMetrics,
  missingContext,
  responseGates,
  reportRows,
  reportPeriod,
  cameraLabel,
  selectedCitationId,
  recentActivitySummary,
  onSelectCitation,
  onSelectIncident,
  onVisionEvidence,
}: RightRailProps): ReactElement {
  const scrollToGate = (): void => {
    document.getElementById("cop-gate")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <aside className="cop-right" aria-label="운용자 명령 패널">
      <ActiveIncidents
        incidents={incidents}
        selectedIncidentId={selectedIncident.id}
        cameraLabel={cameraLabel}
        onSelectIncident={onSelectIncident}
      />
      <VisionPipelinePanel cameraLabel={cameraLabel} onVisionEvidence={onVisionEvidence} />
      <CodexSummary
        selectedClip={selectedClip}
        selectedIncident={selectedIncident}
        metrics={codexMetrics}
        citations={citations}
        missingContext={missingContext}
        recentActivitySummary={recentActivitySummary}
      />
      <CitationsPanel
        citations={citations}
        selectedCitationId={selectedCitationId}
        cameraLabel={cameraLabel}
        onGoToGate={scrollToGate}
        onSelectCitation={onSelectCitation}
      />
      <MissingContextPanel items={missingContext} />
      <ResponseGatePanel selectedIncident={selectedIncident} gates={responseGates} />
      <DailyReportPanel
        selectedClip={selectedClip}
        selectedIncident={selectedIncident}
        cameraLabel={cameraLabel}
        reportRows={reportRows}
        reportPeriod={reportPeriod}
      />
    </aside>
  )
}
```

- [ ] **Step 2: Add the prop to `RightRailCodex.tsx` and use it in the request**

Modify `src/cop/RightRailCodex.tsx`. Add to `CodexSummaryProps`:

```ts
type CodexSummaryProps = {
  readonly selectedClip: EvidenceClip | undefined
  readonly selectedIncident: Incident
  readonly metrics: readonly CodexMetric[]
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly recentActivitySummary: string | undefined
}
```

Update the destructured parameters, `requestDecision`'s body, and its dependency array:

```ts
export function CodexSummary({
  selectedClip,
  selectedIncident,
  metrics,
  citations,
  missingContext,
  recentActivitySummary,
}: CodexSummaryProps): ReactElement {
  const [state, setState] = useState<CodexPanelState>({ kind: "idle" })
  const selectionScope = `${selectedIncident.id}:${selectedClip?.id ?? "no-clip"}`
  const requestVersion = useRef(0)

  const requestDecision = useCallback(async (): Promise<void> => {
    const currentRequest = requestVersion.current + 1
    requestVersion.current = currentRequest
    setState({ kind: "loading" })
    try {
      const requestCitations =
        citations.length > 0 ? citations.slice(0, 2) : [SYSTEM_POSTURE_CITATION]
      const response = await requestCodexAgent({
        incident: selectedIncident,
        citations: requestCitations,
        missingContext,
        responseOutcome: `사람 확인 게이트 대기 / ${selectedClip?.label ?? "선택 클립 없음"}`,
        ...(recentActivitySummary !== undefined ? { recentActivitySummary } : {}),
      })
      if (requestVersion.current !== currentRequest) {
        return
      }
      setState({ kind: "success", response })
    } catch (error) {
      if (requestVersion.current !== currentRequest) {
        return
      }
      if (error instanceof CodexAgentClientError) {
        setState({ kind: "failure", message: error.message })
        return
      }
      throw error
    }
  }, [selectedClip?.label, selectedIncident, citations, missingContext, recentActivitySummary])

  useEffect(() => {
    if (selectionScope.length > 0) {
      void requestDecision()
    }
  }, [requestDecision, selectionScope])
```

(The rest of the file — the JSX return, `CodexRow`, `Sparkline` — is unchanged.)

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: FAIL — `CopDashboard.tsx`'s `<RightRail ... />` call site doesn't pass `recentActivitySummary` yet. Confirm the error is exactly a missing-prop error on that JSX element, and nowhere else (this is expected; Task 6 fixes it).

- [ ] **Step 4: Commit**

```bash
git add src/cop/RightRail.tsx src/cop/RightRailCodex.tsx
git commit -m "feat(cop): thread recent-activity summary into the automatic Codex request"
```

---

### Task 6: Wire `useEvidenceWindowBuffer` into `CopDashboard.tsx`

**Files:**
- Modify: `src/cop/CopDashboard.tsx`

**Interfaces:**
- Consumes: `useEvidenceWindowBuffer` from `./evidenceWindowBuffer`; `windowMsForTone`, `summarizeWindow` from `./evidenceWindowSummary`; the Task 4 4-parameter `useCorrelationAlerts` signature; the Task 5 `recentActivitySummary` prop on `RightRail`.

This task fixes both typecheck failures intentionally left by Tasks 4 and 5.

- [ ] **Step 1: Confirm current content**

Run: `cat -n src/cop/CopDashboard.tsx`

Confirm the file matches the version shown in this plan's Architecture section (the version with `useCorrelationAlerts(evidenceClips, cameras, addVisionEvidence)` called with exactly 3 arguments, and `<RightRail ... />` rendered without a `recentActivitySummary` prop). If it has diverged, STOP and report the actual content instead of guessing.

- [ ] **Step 2: Add the buffer hook, compute the selected-camera summary, and thread both**

Modify `src/cop/CopDashboard.tsx`. Add these imports:

```ts
import { useEvidenceWindowBuffer } from "./evidenceWindowBuffer"
import { summarizeWindow, windowMsForTone } from "./evidenceWindowSummary"
```

Right after the `const evidenceClips = visionEvidence` line, add:

```ts
  const windowBuffer = useEvidenceWindowBuffer(evidenceClips)
```

Change the `useCorrelationAlerts` call to pass the new 4th argument:

```ts
  const {
    alerts: correlationAlerts,
    dismissAlert: dismissCorrelationAlert,
    updateAlertSettings: updateCorrelationAlertSettings,
  } = useCorrelationAlerts(evidenceClips, cameras, addVisionEvidence, windowBuffer)
```

Add a computed summary for the selected incident's camera, right after the `selectedIncident` line (`selectedIncident.zone` is the camera id — this is the same field `buildIncidents` sets from `camera` in `operationalTelemetry.ts`):

```ts
  const recentActivitySummary = useMemo(() => {
    if (selectedIncident === undefined) {
      return undefined
    }
    const entries = windowBuffer.get(selectedIncident.zone)
    if (entries === undefined || entries.length === 0) {
      return undefined
    }
    const latestTone = entries[entries.length - 1]?.clip.tone ?? "normal"
    return summarizeWindow(entries, Date.now(), windowMsForTone(latestTone))?.text
  }, [selectedIncident, windowBuffer])
```

Pass it to `RightRail`:

```tsx
        {selectedIncident !== undefined && (
          <RightRail
            selectedClip={selectedClip}
            selectedIncident={selectedIncident}
            incidents={incidents}
            citations={citations}
            codexMetrics={codexMetrics}
            missingContext={missingContext}
            responseGates={responseGates}
            reportRows={reportRows}
            reportPeriod={reportPeriod}
            cameraLabel={liveCameraLabel}
            selectedCitationId={selectedCitationId}
            recentActivitySummary={recentActivitySummary}
            onSelectCitation={setSelectedCitationId}
            onSelectIncident={selectIncident}
            onVisionEvidence={addVisionEvidence}
          />
        )}
```

- [ ] **Step 3: Typecheck, lint, and run the full test suite**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS (this resolves the two intentional failures left by Tasks 4 and 5; all 93+ existing vitest tests plus Task 1's new tests pass)

- [ ] **Step 4: Commit**

```bash
git add src/cop/CopDashboard.tsx
git commit -m "feat(cop): wire the evidence window buffer into the dashboard and Codex requests"
```

---

### Task 7: e2e tests

**Files:**
- Modify: `tests/e2e/cop.spec.ts`

- [ ] **Step 1: Add a test for the automatic per-incident request**

Add this test inside the existing `test.describe("D4D COP 표면과 상호작용", () => { ... })` block, after the existing DETR-loop test (search for `"실시간 DETR 추론 루프가 탐지 프레임을 에이전트 판단 API로 전달한다"` to find the insertion point):

```ts
  test("Codex 자동 요청에 최근 활동 시간 윈도우 종합 문구가 포함된다", async ({ page }) => {
    const carlaCamera = {
      id: "CARLA-WINDOW-01",
      label: "E2E 시간윈도우 테스트",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        })
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
        { label: "person", score: 0.9, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "window-test-sequence",
          cameraId: "CARLA-WINDOW-01",
          detections: [{ id: "det-window-001", label: "person", confidence: 0.9 }],
          tracks: [{ id: "trk-window-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    let postedSummary = ""
    await page.route("**/api/codex-agent", async (route) => {
      const payload = route.request().postDataJSON()
      postedSummary = payload?.evidence?.summary ?? ""
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          codexMode: "local-codex-adapter",
          decision: {
            title: "테스트 판단",
            summary: "테스트 응답",
            recommendedAction: "사람 확인 유지",
            checkpoint: "test-checkpoint",
          },
          citations: ["CARLA-WINDOW-01"],
          adapterNotice: "테스트 응답",
        }),
      })
    })

    await page.goto("/")

    await expect
      .poll(() => page.locator(".cop-track-block").count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1)

    await expect.poll(() => postedSummary).toContain("분간")
    await expect.poll(() => postedSummary).toContain("회 탐지")
  })
```

- [ ] **Step 2: Run the new test standalone**

Run: `npx playwright test tests/e2e/cop.spec.ts -g "Codex 자동 요청에 최근 활동"`
Expected: PASS

If it times out or the assertion fails, check: (a) the mocked camera's `latestFrameDataUrl` is a real data URL (not null — `useCarlaCameraDetection` bails on null), (b) that selecting the resulting incident actually happens automatically (the app selects the first incident by default via `CopDashboard.tsx`'s `firstIncidentId` effect, so no manual click should be needed), (c) that the window buffer has at least one entry by the time the Codex POST fires — since the buffer hook only starts accumulating once `evidenceClips` contains a vision clip, and the automatic Codex request re-fires whenever `selectionScope` changes, a single detection should be enough (the same clip that creates the incident also seeds the buffer in the same render pass).

- [ ] **Step 3: Run the full e2e suite**

Run: `npx playwright test tests/e2e/cop.spec.ts`
Expected: all pass (13 total — 12 existing + this new one)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/cop.spec.ts
git commit -m "test(cop): cover the Codex time-window activity summary in the automatic request"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete QA suite**

Run: `npm run qa:final`
Expected: typecheck, lint (ignore the pre-existing unrelated `tools/fable-harness/workflow.js` parse errors, out of scope), vitest (all existing tests + Task 1's 9 new tests), and production build all pass.

- [ ] **Step 2: Run the e2e suite once more standalone**

Run: `npx playwright test tests/e2e/cop.spec.ts`
Expected: 13/13 pass

- [ ] **Step 3: Confirm no unrelated files were touched**

Run: `git status --porcelain`
Expected: clean (no unstaged changes) — if any unrelated CARLA-WebRTC WIP files show as modified, that means something outside this plan's scope was touched; investigate before finishing.

- [ ] **Step 4: Final commit (if Step 1–3 turned up any fixes)**

```bash
git add -A
git commit -m "fix: resolve issues found during final verification"
```

(Skip if no changes were needed. Do not use `git add -A` if it would pick up unrelated uncommitted files — check `git status` first and add specific paths instead if anything unexpected appears.)

---

## Self-Review Notes

- **Spec coverage:** §1 adaptive window (alert/watch/other → 2/5/10 min) → Task 1's `windowMsForTone`. §2 summary content (count/duration/trend) → Task 1's `summarizeWindow`. §3 dedicated per-camera buffer independent of `MAX_VISION_EVIDENCE` → Task 2. §4 architecture (all 5 files) → Tasks 3–6. §5 known constraints (demo-scale thresholds, simple trend heuristic) → captured in spec, no code changes needed. §6 tests → Task 1 unit tests + Task 7 e2e. §7 verification → Task 8.
- **Placeholder scan:** every step has complete, runnable code; no TBD/TODO; re-checked before saving.
- **Type consistency:** `WindowEntry`/`WindowSummary`/`MAX_WINDOW_MS`/`windowMsForTone`/`summarizeWindow` (Task 1) are imported with identical names and signatures in Tasks 2, 4, and 6. `useCorrelationAlerts`'s new 4th parameter (`windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>`, Task 4) matches exactly what `useEvidenceWindowBuffer` (Task 2) returns and what `CopDashboard.tsx` (Task 6) passes. `CodexAgentContext.recentActivitySummary` (Task 3) is consumed identically in `useCorrelationAlerts.ts`'s `buildCodexContext` (Task 4) and `RightRailCodex.tsx`'s `requestCodexAgent` call (Task 5), both using the same `...(x !== undefined ? { recentActivitySummary: x } : {})` conditional-spread pattern required by this repo's `exactOptionalPropertyTypes: true` (the same pattern already used for `EvidenceClip.attributes` in the B/D-phase code this plan builds on).
- **Deliberate intermediate failures:** Tasks 4 and 5 each leave one precisely-scoped, expected typecheck failure (a call site not yet updated) that Task 6 resolves — this is intentional bite-sizing (each task's own file is internally consistent and independently reviewable) rather than a plan defect; flagged explicitly in each task's steps so an implementer doesn't mistake it for a bug to chase down.
