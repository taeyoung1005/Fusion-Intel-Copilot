# 위협도별 단계적 대응 행동(Tiered Response Actions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** D4D COP 대시보드의 "사람 확인 게이트" 패널에서 위협도(정상/불확실/주의/경보/확정)별로 실제로 다른 대응 행동(순찰 강화/번개조 출동/5분대기조+발칸 사격 준비, 낮은 단계는 Codex 자동 처리)이 나오고, 그 조치가 추천 문구·사건 패널·일일 보고서에 반영되도록 만든다.

**Architecture:** `Incident.tone`을 5단계 `AlertTone`으로 복원해 실제 심각도가 손실 없이 전달되게 고치고, 새 카탈로그 모듈(`responseActionCatalog.ts`)로 톤→행동 매핑을 정의한 뒤, `CopDashboard`에 세션 스코프 상태(`Map<incidentId, TakenResponseAction>`)를 두어 "어떤 사건에 어떤 조치를 언제 취했는지"를 기록하고 이를 추천 문구/사건 배지/보고서 행에 그대로 흘려보낸다.

**Tech Stack:** React 19 + TypeScript(strict, `exactOptionalPropertyTypes`), Vitest, Playwright.

## Global Constraints

- `npm run typecheck && npm run lint && npx vitest run` 은 모든 태스크 완료 후(그리고 가능하면 각 태스크 후) 통과해야 한다.
- `tests/e2e/cop.spec.ts`, `src/cop/reportPdfClient.test.ts`, `server/reportTypst*.test.ts` 는 **동시에 다른 프로세스가 작업 중인 파일일 수 있다** — `reportPdfClient.test.ts`/`server/reportTypst*.test.ts`는 이 플랜의 범위 밖이므로 원칙적으로 건드리지 않는다. 단, `Incident.tone` 타입 변경으로 그 파일들의 픽스처가 컴파일 에러를 내면(예: `tone: "WATCH"` 리터럴), **그 타입 캐스팅 리터럴 한 줄만** 소문자로 고치고 그 외 로직은 건드리지 않는다(Task 1의 Step 마지막에 확인 절차 있음).
- 기존 컴포넌트/패턴을 따른다: 세션 스코프 상태는 `CopDashboard.tsx`에 `useState`로 두고(예: 이미 있는 `liveDetectionFrames`), prop으로 내려보낸다. 서버 영속화는 하지 않는다.
- 새 문자열 리터럴/라벨은 스펙 문서(`docs/superpowers/specs/2026-07-05-tiered-response-actions-design.md`)의 표현을 그대로 쓴다.

---

## File Map

| 파일 | 변경 |
|---|---|
| `src/cop/copAnalysisData.ts` | `Incident.tone` 타입을 `AlertTone`으로 확장 |
| `src/cop/operationalTelemetry.ts` | `toneRank`/`buildIncidents`/`STANDBY_INCIDENT`/`gate-assess` 조건 수정 |
| `src/cop/RightRailIncidents.tsx` | tone 표시/배지 매핑 수정, `responseActionsByIncident` prop 추가 |
| `src/cop/codexAgentClient.ts` | `checkpointForIncident`/`statusForIncident` switch에 3개 케이스 추가 |
| `src/cop/useCorrelationAlerts.ts` | `buildConfirmedClip`→`confirmed`, `buildJudgingClip`→`uncertain`, `buildCodexContext`의 fixture `Incident.tone` 소문자화 |
| `src/cop/responseActionCatalog.ts` (신규) | `ResponseAction`/`TakenResponseAction` 타입, `RESPONSE_ACTION_BY_TONE` 카탈로그, `formatTakenAtClock`, `responseActionReportRow` |
| `src/cop/responseActionCatalog.test.ts` (신규) | 카탈로그/헬퍼 단위 테스트 |
| `src/cop/recommendedAction.ts` | `takenResponseAction?` 4번째 인자 추가, 조치 있으면 문구 전환 |
| `src/cop/RightRailResponseReport.tsx` | `ResponseGatePanel`을 카탈로그 기반으로 재작성, `DailyReportPanel`에 조치 행 추가 |
| `src/cop/RightRail.tsx` | `responseActionsByIncident`/`onRecordResponseAction` prop 추가 및 하위 전달 |
| `src/cop/CopDashboard.tsx` | `responseActionsByIncident` state + `recordResponseAction` 콜백 추가, `RightRail`에 전달 |
| `src/cop/operationalTelemetry.test.ts` | 기존 WATCH/NORMAL 픽스처를 소문자로, `buildIncidents` 심각도 보존 검증으로 갱신 |
| `src/cop/reportArtifact.test.ts`, `src/cop/RightRailCodex.test.ts` | `Incident` 픽스처 `tone: "WATCH"` → `"watch"` |
| `tests/e2e/cop.spec.ts` | 게이트 섹션 어서션 갱신 + 신규 대응 행동 시나리오 테스트 추가 |

---

### Task 1: Incident 심각도 모델 복원 (`AlertTone` 5단계 보존)

**Files:**
- Modify: `src/cop/copAnalysisData.ts:3-11` (`Incident` type)
- Modify: `src/cop/operationalTelemetry.ts:33-51,53-88,136-152`
- Modify: `src/cop/RightRailIncidents.tsx:68-102`
- Modify: `src/cop/codexAgentClient.ts:71-89`
- Modify: `src/cop/operationalTelemetry.test.ts:37-58,193-230`
- Modify: `src/cop/reportArtifact.test.ts:9-16`
- Modify: `src/cop/RightRailCodex.test.ts:11-19`
- Test: `src/cop/operationalTelemetry.test.ts`

**Interfaces:**
- Produces: `Incident.tone: AlertTone` (was `"WATCH" | "NORMAL"`). `AlertTone = "normal" | "watch" | "alert" | "confirmed" | "uncertain"` (from `./copMapBaseData`, already exported via `./copData` barrel).
- Produces: `buildIncidents(cameras, evidence)` now returns each incident's `tone` as the **true worst** `AlertTone` across that camera's evidence clips (severity order: `normal(0) < uncertain(1) < watch(2) < alert(3) < confirmed(4)`), not collapsed to two values.

- [ ] **Step 1: Write the failing test for severity preservation**

Replace the existing `it("derives a real incident per camera and sorts WATCH first", ...)` block in `src/cop/operationalTelemetry.test.ts` (currently lines 45-56) with:

```ts
  it("derives a real incident per camera and preserves its true severity", () => {
    const cams = [camera("PHONE-001", 4, "2026-06-30T00:00:04Z")]
    const evid: EvidenceClip[] = [
      evidence({ camera: "PHONE-001", source: "vision", tone: "alert", confidencePct: 91 }),
      evidence({ camera: "PHONE-002", source: "mobile", tone: "uncertain", confidencePct: 60 }),
    ]
    const incidents = buildIncidents(cams, evid)
    expect(incidents).toHaveLength(2)
    expect(incidents[0]?.id).toBe("inc-PHONE-001")
    expect(incidents[0]?.tone).toBe("alert")
    expect(incidents[0]?.confidence).toBe(91)
    expect(incidents[1]?.id).toBe("inc-PHONE-002")
    expect(incidents[1]?.tone).toBe("uncertain")
  })

  it("sorts incidents by descending severity, not just watch-vs-normal", () => {
    const cams = [
      camera("CAM-A", 1, "2026-06-30T00:00:01Z"),
      camera("CAM-B", 1, "2026-06-30T00:00:01Z"),
      camera("CAM-C", 1, "2026-06-30T00:00:01Z"),
    ]
    const evid: EvidenceClip[] = [
      evidence({ camera: "CAM-A", source: "vision", tone: "watch", confidencePct: 70 }),
      evidence({ camera: "CAM-B", source: "vision", tone: "confirmed", confidencePct: 70 }),
      evidence({ camera: "CAM-C", source: "vision", tone: "normal", confidencePct: 70 }),
    ]
    const incidents = buildIncidents(cams, evid)
    expect(incidents.map((incident) => incident.id)).toEqual(["inc-CAM-B", "inc-CAM-A", "inc-CAM-C"])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cop/operationalTelemetry.test.ts -t "preserves its true severity"`
Expected: FAIL — `incidents[0]?.tone` is `"WATCH"` (or a type error once Step 3's type change compiles, so run this against the *current* code first to confirm the behavioral failure, i.e. `"WATCH"` !== `"alert"`).

- [ ] **Step 3: Widen the `Incident.tone` type**

In `src/cop/copAnalysisData.ts`, change:

```ts
export type Incident = {
  readonly id: string
  readonly tone: "WATCH" | "NORMAL"
```

to:

```ts
import type { AlertTone } from "./copMapBaseData"

export type Incident = {
  readonly id: string
  readonly tone: AlertTone
```

(Add the import at the top of the file alongside any existing imports there.)

- [ ] **Step 4: Fix `buildIncidents`/`STANDBY_INCIDENT`/`toneRank` in `operationalTelemetry.ts`**

Replace lines 33-51 (`STANDBY_INCIDENT` and `toneRank`) with:

```ts
const STANDBY_INCIDENT: Incident = {
  id: "inc-standby",
  tone: "normal",
  zone: "PERIMETER",
  title: "활성 사건 없음",
  meta: "실시간 탐지·업링크 대기",
  time: "--:--:--",
  confidence: 0,
}

const TONE_SEVERITY: Record<EvidenceClip["tone"], number> = {
  normal: 0,
  uncertain: 1,
  watch: 2,
  alert: 3,
  confirmed: 4,
}

const worstTone = (clips: readonly EvidenceClip[]): EvidenceClip["tone"] =>
  clips.reduce<EvidenceClip["tone"]>(
    (worst, clip) => (TONE_SEVERITY[clip.tone] > TONE_SEVERITY[worst] ? clip.tone : worst),
    "normal",
  )
```

Then in `buildIncidents` (lines 53-88), replace the loop body and sort:

```ts
  const incidents: Incident[] = []
  for (const [camera, clips] of byCamera) {
    const tone = worstTone(clips)
    const latest = clips[0]
    const cameraRecord = cameras.find((record) => record.id === camera)
    incidents.push({
      id: `inc-${camera}`,
      tone,
      zone: camera,
      title: latest?.label ?? "라이브 업링크",
      meta: cameraRecord?.label ?? `증거 ${clips.length}건`,
      time: latest?.time ?? "--:--:--",
      confidence: Math.max(...clips.map((clip) => clip.confidencePct)),
    })
  }

  incidents.sort((left, right) => {
    const severityDiff = TONE_SEVERITY[right.tone] - TONE_SEVERITY[left.tone]
    if (severityDiff !== 0) {
      return severityDiff
    }
    return right.confidence - left.confidence
  })

  return incidents.length > 0 ? incidents : [STANDBY_INCIDENT]
```

- [ ] **Step 5: Fix `gate-assess` condition in `buildResponseGates`**

In `operationalTelemetry.ts` line 150, change:

```ts
    { id: "gate-assess", label: "상황 평가 완료", initial: pass(incident.tone === "NORMAL") },
```

to:

```ts
    { id: "gate-assess", label: "상황 평가 완료", initial: pass(incident.tone === "normal") },
```

- [ ] **Step 6: Fix `RightRailIncidents.tsx` tone display**

Replace line 74 (`const tone = incident.tone === "NORMAL" ? "normal" : "watch"`) and the raw `{incident.tone}` at line 86 with an explicit label map so the badge CSS class and displayed text both use the full 5-tone range:

```ts
const TONE_DISPLAY_LABEL: Record<Incident["tone"], string> = {
  normal: "NORMAL",
  uncertain: "UNCERTAIN",
  watch: "WATCH",
  alert: "ALERT",
  confirmed: "CONFIRMED",
}
```

(add this above `IncidentRow`, after the imports). Then in `IncidentRow`:

```ts
  const tone = incident.tone
```

and change the `{incident.tone}` text node to `{TONE_DISPLAY_LABEL[incident.tone]}`. The `className={`cop-incident tone-${tone}`}` line stays as-is (it already interpolates whatever `tone` holds, and `cop.05.css`/`cop.14.css` etc. already define `tone-alert`/`tone-confirmed`/`tone-uncertain` rules for other elements like `DepotFootprint`/`ClipPlayer`, but double check `.cop-incident.tone-alert` etc. exist — if not, they inherit no color and stay default, which is acceptable and not a regression since today only `tone-watch`/`tone-normal` existed for this element).

- [ ] **Step 7: Fix `codexAgentClient.ts` switch statements**

Replace lines 71-89:

```ts
const checkpointForIncident = (
  incident: Incident,
): { readonly id: string; readonly label: string } => {
  switch (incident.tone) {
    case "watch":
      return { id: "operator-review", label: "운용자 검토 필요" }
    case "alert":
      return { id: "operator-review", label: "운용자 검토 필요" }
    case "confirmed":
      return { id: "operator-review", label: "운용자 검토 필요" }
    case "uncertain":
      return { id: "operator-review", label: "운용자 검토 필요" }
    case "normal":
      return { id: "routine-monitoring", label: "정상 감시 유지" }
  }
}

const statusForIncident = (incident: Incident): string => {
  switch (incident.tone) {
    case "watch":
    case "alert":
    case "confirmed":
    case "uncertain":
      return "판단 보류: 사람 검토 필요"
    case "normal":
      return "정상 감시 유지"
  }
}
```

(TypeScript will refuse to compile the old 2-case switches once `Incident.tone` is `AlertTone` — this is the exhaustive replacement.)

- [ ] **Step 8: Update existing test fixtures to lowercase tone literals**

In `src/cop/operationalTelemetry.test.ts`:
- Line ~196: `tone: "WATCH",` → `tone: "watch",` (the `incident` helper in the `buildResponseGates` describe block)
- Line ~207: `incident({ id: "inc-standby", tone: "NORMAL", zone: "PERIMETER" })` → `tone: "normal"`
- Line ~227 comment: `// WATCH incident still needs review` → `// non-normal incident still needs review`
- Line ~234: the `incident` const in the `buildRecommendedAction` describe block: `tone: "WATCH",` → `tone: "watch",`

In `src/cop/reportArtifact.test.ts` line 12: `tone: "WATCH",` → `tone: "watch",`

In `src/cop/RightRailCodex.test.ts` line 14: `tone: "WATCH",` → `tone: "watch",`

- [ ] **Step 9: Run the full test/typecheck/lint sweep**

Run: `npm run typecheck 2>&1 | tail -60`
Expected: no errors. If `src/cop/reportPdfClient.test.ts` or any `server/reportTypst*.test.ts` file fails **only** because of a `tone: "WATCH"`-style literal, fix that single literal's casing there too (do not touch anything else in those files — they belong to unrelated in-progress work).

Run: `npx vitest run`
Expected: all test files pass, including the two new/updated cases in `operationalTelemetry.test.ts`.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/cop/copAnalysisData.ts src/cop/operationalTelemetry.ts src/cop/operationalTelemetry.test.ts src/cop/RightRailIncidents.tsx src/cop/codexAgentClient.ts src/cop/reportArtifact.test.ts src/cop/RightRailCodex.test.ts
git commit -m "fix(cop): preserve real incident severity instead of collapsing to watch/normal"
```

---

### Task 2: confirmed/uncertain 톤이 실제로 발생하도록 상관관계 로직 수정

**Files:**
- Modify: `src/cop/useCorrelationAlerts.ts:58-75,100-116,118-133`

**Interfaces:**
- Produces: `buildConfirmedClip(...)` now returns an `EvidenceClip` with `tone: "confirmed"`.
- Produces: `buildJudgingClip(...)` now returns an `EvidenceClip` with `tone: "uncertain"`.
- `buildAmbiguousClip` unchanged (`tone: "watch"`).

- [ ] **Step 1: Change `buildConfirmedClip`'s tone**

In `src/cop/useCorrelationAlerts.ts`, line 68, change:

```ts
    tone: "watch",
```

to:

```ts
    tone: "confirmed",
```

(inside `buildConfirmedClip`, the function starting at line 58).

- [ ] **Step 2: Change `buildJudgingClip`'s tone**

Line 109, inside `buildJudgingClip` (starts at line 100), change:

```ts
    tone: "watch",
```

to:

```ts
    tone: "uncertain",
```

- [ ] **Step 3: Fix the throwaway `Incident` fixture's tone casing**

Line 125, inside `buildCodexContext` (this `Incident` only shapes the Codex request payload, it is not the real incidents list — keep its semantic meaning as "under review" but fix the casing so it type-checks against the new `AlertTone`):

```ts
    tone: "watch",
```

- [ ] **Step 4: Run typecheck and the e2e correlation tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx playwright test tests/e2e/cop.spec.ts -g "상관관계"`
Expected: both correlation tests (confirmed-match and ambiguous-match) still pass — they assert on `.cop-realtime-alert.kind-correlation` and text content, not on the tone string, so behavior is unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/cop/useCorrelationAlerts.ts
git commit -m "fix(cop): let confirmed cross-camera matches and in-review correlations carry their real tone"
```

---

### Task 3: 대응 행동 카탈로그 모듈

**Files:**
- Create: `src/cop/responseActionCatalog.ts`
- Test: `src/cop/responseActionCatalog.test.ts`

**Interfaces:**
- Consumes: `AlertTone` (from `./copData`), `DailyReportRow` (from `./operationalTelemetry`).
- Produces:
  - `type ResponseActionKind = "auto" | "manual"`
  - `type ResponseAction = { readonly id: string; readonly kind: ResponseActionKind; readonly label: string; readonly confirmedText: string }`
  - `type TakenResponseAction = { readonly actionId: string; readonly label: string; readonly takenAtMs: number }`
  - `const RESPONSE_ACTION_BY_TONE: Record<AlertTone, ResponseAction>`
  - `formatTakenAtClock(ms: number): string` — `"HH:MM:SS"` in local time
  - `responseActionReportRow(action: TakenResponseAction | undefined): DailyReportRow`

- [ ] **Step 1: Write the failing test**

Create `src/cop/responseActionCatalog.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  RESPONSE_ACTION_BY_TONE,
  formatTakenAtClock,
  responseActionReportRow,
} from "./responseActionCatalog"

describe("RESPONSE_ACTION_BY_TONE", () => {
  it("treats normal and uncertain as automatic Codex-handled tiers", () => {
    expect(RESPONSE_ACTION_BY_TONE.normal.kind).toBe("auto")
    expect(RESPONSE_ACTION_BY_TONE.uncertain.kind).toBe("auto")
  })

  it("treats watch, alert, and confirmed as manual dispatch tiers with distinct labels", () => {
    expect(RESPONSE_ACTION_BY_TONE.watch.kind).toBe("manual")
    expect(RESPONSE_ACTION_BY_TONE.watch.label).toBe("순찰 강화 지시")
    expect(RESPONSE_ACTION_BY_TONE.alert.kind).toBe("manual")
    expect(RESPONSE_ACTION_BY_TONE.alert.label).toBe("번개조 출동 지시")
    expect(RESPONSE_ACTION_BY_TONE.confirmed.kind).toBe("manual")
    expect(RESPONSE_ACTION_BY_TONE.confirmed.label).toBe("5분대기조 출동 + 발칸 사격 준비")
  })
})

describe("responseActionReportRow", () => {
  it("reports 없음 when no action has been taken", () => {
    const row = responseActionReportRow(undefined)
    expect(row).toEqual({ id: "response-action", label: "대응 조치", value: "없음" })
  })

  it("reports the taken action's label and formatted time", () => {
    const takenAtMs = new Date("2026-07-05T00:00:00").setHours(14, 3, 5, 0)
    const row = responseActionReportRow({
      actionId: "qrf-dispatch",
      label: "번개조 출동 지시",
      takenAtMs,
    })
    expect(row.value).toBe(`번개조 출동 지시 · ${formatTakenAtClock(takenAtMs)}`)
    expect(row.value).toContain("14:03:05")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cop/responseActionCatalog.test.ts`
Expected: FAIL with "Cannot find module './responseActionCatalog'".

- [ ] **Step 3: Write the implementation**

Create `src/cop/responseActionCatalog.ts`:

```ts
import type { AlertTone } from "./copData"
import type { DailyReportRow } from "./operationalTelemetry"

export type ResponseActionKind = "auto" | "manual"

export type ResponseAction = {
  readonly id: string
  readonly kind: ResponseActionKind
  readonly label: string
  readonly confirmedText: string
}

export type TakenResponseAction = {
  readonly actionId: string
  readonly label: string
  readonly takenAtMs: number
}

// Normal/uncertain tiers are handled by Codex automatically (dashboard
// display only, no simulated actuation); watch/alert/confirmed require an
// operator to click a dispatch button, escalating in severity.
export const RESPONSE_ACTION_BY_TONE: Record<AlertTone, ResponseAction> = {
  normal: {
    id: "routine-monitoring",
    kind: "auto",
    label: "정상 감시 유지",
    confirmedText: "정상 감시 유지",
  },
  uncertain: {
    id: "auto-priority-watch",
    kind: "auto",
    label: "Codex 자동 조치: 인접 카메라 우선 감시 전환",
    confirmedText: "Codex 자동 조치: 인접 카메라 우선 감시 전환",
  },
  watch: {
    id: "patrol-reinforce",
    kind: "manual",
    label: "순찰 강화 지시",
    confirmedText: "순찰 강화 지시됨",
  },
  alert: {
    id: "qrf-dispatch",
    kind: "manual",
    label: "번개조 출동 지시",
    confirmedText: "번개조 출동 지시됨",
  },
  confirmed: {
    id: "standby-vulcan-ready",
    kind: "manual",
    label: "5분대기조 출동 + 발칸 사격 준비",
    confirmedText: "5분대기조 출동 + 발칸 사격 준비 지시됨",
  },
}

export const formatTakenAtClock = (ms: number): string => {
  const date = new Date(ms)
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const responseActionReportRow = (
  action: TakenResponseAction | undefined,
): DailyReportRow => ({
  id: "response-action",
  label: "대응 조치",
  value: action === undefined ? "없음" : `${action.label} · ${formatTakenAtClock(action.takenAtMs)}`,
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cop/responseActionCatalog.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cop/responseActionCatalog.ts src/cop/responseActionCatalog.test.ts
git commit -m "feat(cop): add tiered response-action catalog for the human confirmation gate"
```

---

### Task 4: `recommendedAction.ts`가 조치 완료 상태를 반영하도록 확장

**Files:**
- Modify: `src/cop/recommendedAction.ts`
- Test: `src/cop/operationalTelemetry.test.ts` (the `buildRecommendedAction` describe block)

**Interfaces:**
- Consumes: `TakenResponseAction`, `formatTakenAtClock` (from `./responseActionCatalog`).
- Produces: `buildRecommendedAction(selectedIncident, missingContext, responseGates, takenResponseAction?)` — new optional 4th parameter. When provided, short-circuits to a "조치 완료" result before the existing missing-context/gate checks.

- [ ] **Step 1: Write the failing test**

Add to the `describe("buildRecommendedAction", ...)` block in `src/cop/operationalTelemetry.test.ts` (after the existing 3 `it` blocks, before the closing `})`):

```ts
  it("returns action-taken copy when a response action has been recorded, before checking gates", () => {
    const action = buildRecommendedAction(
      incident,
      [{ id: "miss-PHONE-001", camera: "PHONE-001", reason: "No frame", since: "연결 직후" }],
      [],
      { actionId: "qrf-dispatch", label: "번개조 출동 지시", takenAtMs: 0 },
    )

    expect(action.headline).toBe("대응 조치 완료")
    expect(action.body).toContain("PHONE-001")
    expect(action.body).toContain("번개조 출동 지시")
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cop/operationalTelemetry.test.ts -t "action-taken copy"`
Expected: FAIL — TypeScript error (too many arguments) or, once the signature is widened without the branch, wrong `headline`.

- [ ] **Step 3: Implement the new branch**

Replace the full contents of `src/cop/recommendedAction.ts` with:

```ts
import type { Incident, MissingContext, ResponseGate } from "./copData"
import { type TakenResponseAction, formatTakenAtClock } from "./responseActionCatalog"

export type RecommendedAction = {
  readonly ko: string
  readonly en: string
  readonly headline: string
  readonly body: string
  readonly cta: string
}

export const buildRecommendedAction = (
  selectedIncident: Incident,
  missingContext: readonly MissingContext[],
  responseGates: readonly ResponseGate[],
  takenResponseAction?: TakenResponseAction,
): RecommendedAction => {
  if (takenResponseAction !== undefined) {
    return {
      ko: "관장 조치",
      en: "Recommended Next Action",
      headline: "대응 조치 완료",
      body: `${selectedIncident.zone}: ${takenResponseAction.label} (${formatTakenAtClock(takenResponseAction.takenAtMs)})`,
      cta: "사람 확인 게이트로 이동",
    }
  }

  if (missingContext.length > 0) {
    return {
      ko: "관장 조치",
      en: "Recommended Next Action",
      headline: "누락 데이터 보완 필요",
      body: `${selectedIncident.zone}: 누락 맥락 ${missingContext.length}건 보완 후 보고서 생성 가능`,
      cta: "누락 맥락 확인",
    }
  }

  if (responseGates.length > 0 && responseGates.every((gate) => gate.initial === "PASS")) {
    return {
      ko: "관장 조치",
      en: "Recommended Next Action",
      headline: "보고서 생성 가능",
      body: `${selectedIncident.zone}: 모든 사람 확인 게이트 통과 · 일일 보고서 생성 준비 완료`,
      cta: "보고서 생성 게이트로 이동",
    }
  }

  return {
    ko: "관장 조치",
    en: "Recommended Next Action",
    headline: "사람 확인 게이트 검토 필요",
    body: `${selectedIncident.zone}: 대기 중인 확인 게이트 완료 후 보고서 생성 가능`,
    cta: "사람 확인 게이트로 이동",
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cop/operationalTelemetry.test.ts`
Expected: all `buildRecommendedAction` tests (4 now) pass; the 3 pre-existing ones are unaffected since the 4th parameter is optional.

- [ ] **Step 5: Commit**

```bash
git add src/cop/recommendedAction.ts src/cop/operationalTelemetry.test.ts
git commit -m "feat(cop): reflect a taken response action in the recommended-action copy"
```

---

### Task 5: `CopDashboard.tsx`에 조치 기록 상태 추가

**Files:**
- Modify: `src/cop/CopDashboard.tsx`

**Interfaces:**
- Consumes: `ResponseAction`, `TakenResponseAction` (from `./responseActionCatalog`).
- Produces: new state `responseActionsByIncident: ReadonlyMap<string, TakenResponseAction>` and callback `recordResponseAction(incidentId: string, action: ResponseAction): void`, both passed to `<RightRail>` as new props `responseActionsByIncident` and `onRecordResponseAction`.

- [ ] **Step 1: Add the import**

In `src/cop/CopDashboard.tsx`, add (alphabetically among the existing `./...` imports, near `./realtimeAlerts`/`./recommendedAction`-style entries):

```ts
import type { ResponseAction, TakenResponseAction } from "./responseActionCatalog"
```

- [ ] **Step 2: Add the state, next to `liveDetectionFrames`**

```ts
  const [responseActionsByIncident, setResponseActionsByIncident] = useState<
    ReadonlyMap<string, TakenResponseAction>
  >(() => new Map())
```

- [ ] **Step 3: Add the callback, next to `updateLiveDetectionFrame`**

```ts
  const recordResponseAction = useCallback((incidentId: string, action: ResponseAction): void => {
    setResponseActionsByIncident((previous) => {
      const next = new Map(previous)
      next.set(incidentId, { actionId: action.id, label: action.label, takenAtMs: Date.now() })
      return next
    })
  }, [])
```

- [ ] **Step 4: Pass the new props to `<RightRail>`**

In the `<RightRail ... />` JSX (inside the `{selectedIncident !== undefined && (...)}` block), add two props:

```tsx
            responseActionsByIncident={responseActionsByIncident}
            onRecordResponseAction={recordResponseAction}
```

(Add them near the other callback props like `onSelectCitation`/`onSelectIncident`.)

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: FAILS at this point — `RightRail` doesn't accept these props yet. This is expected; Task 6 fixes it. (If your workflow requires green-after-every-task, you may instead do Task 5 and Task 6 as one combined commit — see note at the end of Task 6.)

- [ ] **Step 6: Commit only after Task 6's RightRail changes land (see Task 6 Step 6)**

Do not commit yet — leave this uncommitted and continue directly into Task 6, then commit both together (Task 6's Step 6 covers the combined commit).

---

### Task 6: `RightRail.tsx` / `ActiveIncidents` / `ResponseGatePanel` / `DailyReportPanel` 배선

**Files:**
- Modify: `src/cop/RightRail.tsx`
- Modify: `src/cop/RightRailIncidents.tsx`
- Modify: `src/cop/RightRailResponseReport.tsx`

**Interfaces:**
- Consumes: `responseActionsByIncident: ReadonlyMap<string, TakenResponseAction>`, `onRecordResponseAction: (incidentId: string, action: ResponseAction) => void` (from Task 5's `CopDashboard.tsx`).
- Produces: `ActiveIncidents` shows a "조치됨" badge per incident that has an entry in the map; `ResponseGatePanel` shows the tone-appropriate auto-text or manual dispatch button and records clicks; `DailyReportPanel` appends the "대응 조치" row.

- [ ] **Step 1: `RightRail.tsx` — accept and wire the new props**

Add to the imports:

```ts
import type { ResponseAction, TakenResponseAction } from "./responseActionCatalog"
```

Add to `RightRailProps`:

```ts
  readonly responseActionsByIncident: ReadonlyMap<string, TakenResponseAction>
  readonly onRecordResponseAction: (incidentId: string, action: ResponseAction) => void
```

Destructure them in the function signature. Then find the existing block (lines 85-88):

```ts
  const recommendedAction = useMemo(
    () => buildRecommendedAction(selectedIncident, missingContext, responseGates),
    [selectedIncident, missingContext, responseGates],
  )
```

and REPLACE it entirely with:

```ts
  const takenResponseAction = responseActionsByIncident.get(selectedIncident.id)
  const recommendedAction = useMemo(
    () => buildRecommendedAction(selectedIncident, missingContext, responseGates, takenResponseAction),
    [selectedIncident, missingContext, responseGates, takenResponseAction],
  )
  const recordResponseAction = useCallback(
    (action: ResponseAction): void => onRecordResponseAction(selectedIncident.id, action),
    [onRecordResponseAction, selectedIncident.id],
  )
```

Then update the JSX:
- `<ActiveIncidents ... />` (in the `overview` tab group): add `responseActionsByIncident={responseActionsByIncident}`.
- `<ResponseGatePanel selectedIncident={selectedIncident} gates={responseGates} />`: add `takenResponseAction={takenResponseAction}` and `onRecordResponseAction={recordResponseAction}`.
- `<DailyReportPanel ... />`: add `takenResponseAction={takenResponseAction}`.

- [ ] **Step 2: `RightRailIncidents.tsx` — badge taken actions**

Add to imports: `import type { TakenResponseAction } from "./responseActionCatalog"`.

Add to `ActiveIncidentsProps`: `readonly responseActionsByIncident: ReadonlyMap<string, TakenResponseAction>`.

Destructure `responseActionsByIncident` in `ActiveIncidents`, pass it to each `<IncidentRow>`:

```tsx
          <IncidentRow
            key={incident.id}
            incident={incident}
            cameraLabel={cameraLabel}
            selected={incident.id === selectedIncidentId}
            takenAction={responseActionsByIncident.get(incident.id)}
            onSelect={() => onSelectIncident(incident.id)}
          />
```

Add to `IncidentRowProps`: `readonly takenAction: TakenResponseAction | undefined`. Destructure it in `IncidentRow`, and add the badge right after the `<header>` block's tone `<span>`, e.g. inside `<header>` after the existing `<time>{incident.time}</time>`:

```tsx
        {takenAction !== undefined && <span className="cop-incident-action-badge">조치됨</span>}
```

Add the matching CSS rule in `src/styles/cop.10.css` (same file as the other gate/incident status colors), right after `.cop-gate-status.pending`:

```css
.cop-incident-action-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(89, 215, 255, 0.16);
  color: var(--c-cyan);
  font-size: 9px;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 3: `RightRailResponseReport.tsx` — rewrite `ResponseGatePanel`**

Replace the imports at the top of the file to add:

```ts
import { RESPONSE_ACTION_BY_TONE, type ResponseAction, type TakenResponseAction } from "./responseActionCatalog"
```

Replace the entire `ResponseGatePanel` function with:

```ts
export function ResponseGatePanel({
  selectedIncident,
  gates,
  takenResponseAction,
  onRecordResponseAction,
}: {
  readonly selectedIncident: Incident
  readonly gates: readonly ResponseGate[]
  readonly takenResponseAction: TakenResponseAction | undefined
  readonly onRecordResponseAction: (action: ResponseAction) => void
}): ReactElement {
  // The operator confirms the incident as a whole; each step already shows PASS
  // when the real evidence satisfies it, PENDING until confirmed otherwise.
  const [confirmed, setConfirmed] = useState(false)
  const incidentScope = selectedIncident.id

  useEffect(() => {
    if (incidentScope.length > 0) {
      setConfirmed(false)
    }
  }, [incidentScope])

  const statusOf = (gate: ResponseGate): "PASS" | "PENDING" =>
    confirmed || gate.initial === "PASS" ? "PASS" : "PENDING"

  const confirmAll = (): void => {
    setConfirmed(true)
  }

  const catalogAction = RESPONSE_ACTION_BY_TONE[selectedIncident.tone]
  const showDispatchButton = catalogAction.kind === "manual" && takenResponseAction === undefined

  return (
    <section id="cop-gate" className="cop-panel cop-gate" aria-labelledby="cop-gate-title">
      <div className="cop-panel-head">
        <h2 id="cop-gate-title">
          사람 확인 게이트 <small>(RESPONSE GATE STATUS)</small>
        </h2>
      </div>
      <ul className="cop-gate-list">
        {gates.map((gate) => {
          const status = statusOf(gate)
          return (
            <li key={gate.id} className={`cop-gate-row status-${status.toLowerCase()}`}>
              <CheckCircle2 size={14} aria-hidden="true" />
              <span className="cop-gate-label">{gate.label}</span>
              <span className={`cop-gate-status ${status.toLowerCase()}`}>{status}</span>
            </li>
          )
        })}
      </ul>
      <div className="cop-gate-actions">
        <button type="button" className="cop-button ok" onClick={confirmAll}>
          검토 및 확인
        </button>
        {showDispatchButton && (
          <button
            type="button"
            className="cop-button danger"
            onClick={() => onRecordResponseAction(catalogAction)}
          >
            {catalogAction.label}
          </button>
        )}
      </div>
      {confirmed && (
        <p className="cop-gate-decision" aria-live="polite">
          검토 및 확인 완료: {selectedIncident.zone} 모든 게이트 PASS 기록
        </p>
      )}
      {catalogAction.kind === "auto" && (
        <p className="cop-gate-decision" aria-live="polite">
          {catalogAction.label}
        </p>
      )}
      {takenResponseAction !== undefined && (
        <p className="cop-gate-decision" aria-live="polite">
          조치 완료: {takenResponseAction.label}
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: `RightRailResponseReport.tsx` — add the report row to `DailyReportPanel`**

Add to the imports: `import { responseActionReportRow } from "./responseActionCatalog"` and add `type TakenResponseAction` to the existing `./responseActionCatalog` import if you merge the two import lines.

Add `takenResponseAction: TakenResponseAction | undefined` to `DailyReportPanel`'s prop type and destructuring.

Inside `DailyReportPanel`, right after the `useReportArtifactActions` call, add:

```ts
  const rows = useMemo(
    () => [...reportRows, responseActionReportRow(takenResponseAction)],
    [reportRows, takenResponseAction],
  )
```

(Add `useMemo` to the existing `react` import if not already imported in this file.) Then change the `{reportRows.map((row) => (...))}` block inside `<dl className="cop-report-meta">` to `{rows.map((row) => (...))}`.

- [ ] **Step 5: Run typecheck, lint, unit tests**

Run: `npm run typecheck`
Expected: no errors (this closes out Task 5's expected failure too).

Run: `npm run lint`
Expected: no errors (fix import ordering with `npx biome check --write <file>` if flagged).

Run: `npx vitest run`
Expected: all pass.

- [ ] **Step 6: Commit (Task 5 + Task 6 together)**

```bash
git add src/cop/CopDashboard.tsx src/cop/RightRail.tsx src/cop/RightRailIncidents.tsx src/cop/RightRailResponseReport.tsx src/styles/cop.10.css
git commit -m "feat(cop): wire tiered response-action dispatch through the dashboard"
```

---

### Task 7: e2e 테스트 갱신 및 신규 시나리오

**Files:**
- Modify: `tests/e2e/cop.spec.ts:128-140` (existing gate assertions in "컨셉의 모든 표면과 기능을 노출한다")
- Modify: `tests/e2e/cop.spec.ts:660-749` (add manual-dispatch assertions to the existing realtime-alert test, which already produces a `watch`-tone incident)

**Interfaces:**
- None (test-only; exercises the UI wired in Tasks 1-6).

- [ ] **Step 1: Fix the now-invalid escalation assertions in the baseline test**

In `tests/e2e/cop.spec.ts`, find (around line 128-136):

```ts
      // --- Right rail: response gate -------------------------------------------
      await expect(page.locator(".cop-gate-status.pass")).toHaveCount(2)
      await expect(page.locator(".cop-gate-status.pending")).toHaveCount(2)
      await page.getByRole("button", { name: "검토 및 확인" }).click()
      await expect(page.locator(".cop-gate-status.pass")).toHaveCount(4)
      await expect(page.locator(".cop-gate-status.pending")).toHaveCount(0)
      await expect(page.getByText(/검토 및 확인 완료/)).toBeVisible()
      await page.getByRole("button", { name: "에스컬레이션" }).click()
      await expect(page.getByText(/감독자 검토로 상신/)).toBeVisible()
```

Replace the last two lines (the escalation click/assert) with an assertion that the standby (`normal`-tone) incident shows the auto-tier text instead of a manual button:

```ts
      // A normal-tone standby incident is Codex-auto-handled, not a manual dispatch.
      await expect(page.locator(".cop-gate").getByText("정상 감시 유지")).toBeVisible()
      await expect(page.getByRole("button", { name: /출동 지시|사격 준비/ })).toHaveCount(0)
```

- [ ] **Step 2: Add a manual-dispatch scenario to the existing realtime-alert test**

In the test `"CARLA 탐지 시 실시간 알림 팝업이 뜨고, EVENT TIMELINE 호버/클릭이 동작한다"` (starts at line 660), its mocked `**/api/vision-pipeline` response already sets `situationAnalysisAgent: { riskLevel: "watch", ... }`, which `riskToTone` maps to `"watch"` — so the resulting incident is `watch`-tone, exactly the tier that should show the "순찰 강화 지시" button. After the existing block that opens and closes the clip player (around line 742-748, right after `await expect(page.locator(".cop-clip-player .cop-detection-box")).toBeVisible()` and the close-button click), add:

```ts
    // The watch-tier incident gets a manual dispatch button; clicking it
    // records the action and reflects it in the recommended-action copy.
    await page.getByRole("tab", { name: "판단·대응" }).click()
    const dispatchButton = page.getByRole("button", { name: "순찰 강화 지시" })
    await expect(dispatchButton).toBeVisible()
    await dispatchButton.click()
    await expect(page.getByText(/조치 완료: 순찰 강화 지시/)).toBeVisible()
    await expect(page.getByRole("button", { name: "순찰 강화 지시" })).toHaveCount(0)
    await expect(page.getByText(/대응 조치 완료/)).toBeVisible()
```

- [ ] **Step 3: Run the full e2e suite**

Run: `npx playwright test tests/e2e/cop.spec.ts`
Expected: all tests pass (12 existing + assertions folded into 2 of them, so still 12 test cases).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/cop.spec.ts
git commit -m "test(cop): cover tiered response-action dispatch and the fixed baseline gate copy"
```

---

## Plan Self-Review Notes

- **Spec coverage:** §1 → Task 1. §1-1 → Task 2. §2 → Task 3. §3 → Task 5. §4 → Task 6 (ResponseGatePanel). §5 → Task 6 (ActiveIncidents badge, DailyReportPanel row) + Task 4 (recommendedAction). §6 → Task 7.
- **Known deviation from the spec doc:** `TakenResponseAction` dropped the `tone` field the design doc sketched — nothing downstream (badge, report row, gate decision text, recommended-action body) needs to know the tone under which the action was taken, only the label and time. Kept minimal per YAGNI.
- **Out of scope, confirmed with user:** sending real commands to the CARLA bridge (e.g. moving the ISR drone) — the `uncertain`-tier auto action is dashboard-text-only.
