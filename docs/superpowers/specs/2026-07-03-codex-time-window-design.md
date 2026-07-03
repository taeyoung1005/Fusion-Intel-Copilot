# Codex 시간 윈도우 판단 정책 (로드맵 E단계)

## Context

D4D 로드맵은 A(UI 재구성) → B(DETR 속성 추출) → D(크로스 카메라 재식별) → E(Codex 시간 윈도우) 순서로 모두 완료 직전이다. E단계는 원래 사용자의 한 문장짜리 언급("Codex 에이전트의 시간 윈도우 정책")에서 나왔고, 이번 브레인스토밍으로 다음과 같이 확정했다: **Codex가 판단할 때 "그 순간의 증거 1건"이 아니라 "최근 몇 분간 이 카메라에서 있었던 흐름"을 종합해서 보게 한다.**

현재 `src/cop/codexAgentClient.ts`의 `requestCodexAgent`가 받는 `CodexAgentContext`는 `incident`(그 카메라의 **가장 최근 증거 클립 1개**로 만든 스냅샷, `operationalTelemetry.ts`의 `buildIncidents`가 `clips[0]`만 사용) 하나뿐이라, "지난 5분간 3번 탐지됐고 위험도가 올라가고 있다" 같은 흐름 정보가 전혀 반영되지 않는다.

이 정책은 두 곳에 적용한다: (1) `src/cop/RightRailCodex.tsx`의 기존 자동 요청(사건 선택 시 `useEffect`가 자동으로 Codex를 부르는 경로, 수동 버튼은 D단계에서 이미 제거됨), (2) D단계의 `useCorrelationAlerts.ts`가 애매 구간(55~79점)에서 직접 `requestCodexAgent`를 호출하는 경로.

## 1. 적응형 시간 윈도우

D단계에서 카메라 간 거리에 따라 시간 윈도우를 다르게 계산했던 것과 같은 원칙으로, **현재 위험도(tone)에 따라 윈도우 길이를 다르게** 한다 — 긴급할수록 최신 정보에 집중, 한가할수록 더 넓은 흐름을 본다.

| tone | 윈도우 |
|---|---|
| alert | 2분 |
| watch | 5분 |
| normal | 10분 |

## 2. 종합 내용

윈도우 안의 증거를 다음 세 가지로 요약한다:
- **탐지 횟수**: 윈도우 안 클립 개수
- **지속 시간**: 첫 클립 시각 ~ 마지막 클립 시각
- **위험도 추이**: 첫 클립의 tone과 윈도우 안 최고 tone(worst)이 다르면 "상승", 같으면 "유지"

문구 예: `"5분간 7회 탐지, 09:12~09:17 지속, 위험도 유지"` 또는 `"2분간 3회 탐지, 09:20~09:21 지속, 위험도 상승(normal→alert)"`.

## 3. 데이터 출처

화면용 증거 배열(`visionEvidence`, `CopDashboard.tsx`)은 전체 카메라 통틀어 `MAX_VISION_EVIDENCE = 6`으로 제한돼 있어 카메라별 10분치 히스토리를 감당할 수 없다(D단계에서 이미 확인한 동일한 제약). D단계와 같은 방식으로 **카메라별 내부 버퍼**를 별도로 유지한다 — `attributes` 유무와 무관하게 vision 소스의 모든 클립을 저장(사람뿐 아니라 차량 등도 흐름에 포함).

## 4. 아키텍처

### `src/cop/evidenceWindowSummary.ts` (신규, 순수 함수)

- `type ToneName = "normal" | "watch" | "alert" | "confirmed" | "uncertain"`(기존 `AlertTone` 재사용)
- `windowMsForTone(tone: AlertTone): number` — alert=120_000, watch=300_000, 그 외(normal 포함 나머지 전부)=600_000
- `type WindowEntry = { readonly clip: EvidenceClip; readonly observedAtMs: number }`
- `type WindowSummary = { readonly count: number; readonly firstObservedAtMs: number; readonly lastObservedAtMs: number; readonly worstTone: AlertTone; readonly escalated: boolean; readonly text: string }`
- `summarizeWindow(entries: readonly WindowEntry[], nowMs: number, windowMs: number): WindowSummary | undefined` — `entries`를 `nowMs - windowMs` 이후로 필터링, 1건도 없으면 `undefined`. 있으면 개수/시간범위/최고tone/상승여부를 계산하고 한국어 문구(`text`)를 생성.

DETR/CLIP 모델 호출이 없는 순수 로직이라 `personCorrelation.test.ts`와 같은 방식으로 유닛 테스트한다.

### `src/cop/evidenceWindowBuffer.ts` (신규 훅)

- `useEvidenceWindowBuffer(evidenceClips: readonly EvidenceClip[]): Map<string, readonly WindowEntry[]>` — `evidenceClips`에서 새로 관찰된 클립을 `Date.now()`와 함께 카메라별 버퍼(내부 `ref`)에 추가하고, 10분(가장 큰 윈도우)보다 오래된 항목은 정리한다. 매 렌더 시 카메라별 `readonly WindowEntry[]` 맵을 반환.

### `codexAgentClient.ts` 수정

- `CodexAgentContext`에 `readonly recentActivitySummary?: string` 필드 추가.
- `requestCodexAgent`의 `evidence.summary` 생성부(현재 `${zone} ${meta} 증거 패킷 — ${incident.title}`)에, `recentActivitySummary`가 있으면 `` ` · ${recentActivitySummary}` ``를 이어붙인다.

### `CopDashboard.tsx` 수정

- `useEvidenceWindowBuffer(evidenceClips)`를 호출해 카메라별 버퍼 맵을 얻는다.
- `RightRailCodex`에 이 맵(또는 선택된 카메라의 버퍼만 뽑아 전달)을 prop으로 넘긴다.
- `useCorrelationAlerts`에도 같은 맵을 인자로 추가 전달한다.

### `RightRailCodex.tsx` 수정

- `Incident.tone`은 "WATCH"/"NORMAL" 두 값뿐이라 윈도우 크기를 정하기엔 너무 성글다 — 대신 선택된 사건의 카메라(`selectedIncident.zone`, 카메라 ID로 쓰이고 있음) 버퍼에서 **가장 최근 클립의 실제 `AlertTone`**(`entries.at(-1)?.clip.tone`)을 윈도우 크기 결정에 쓴다. 버퍼가 비어 있으면 종합 문구 자체를 생략(요약할 대상이 없음).
- `windowMsForTone(그 최근 tone)` → `summarizeWindow(...)` → 결과 있으면 `recentActivitySummary`로 `requestCodexAgent` 호출에 포함.

### `useCorrelationAlerts.ts` 수정

- 애매 구간(55~79점) Codex 호출 시, 매칭된 두 클립 중 **나중 클립의 카메라** 버퍼로 `summarizeWindow`를 계산해 `recentActivitySummary`로 포함(확신 구간 80+는 Codex를 호출하지 않으므로 대상 아님).

## 5. 알려진 제약

- 윈도우 임계값(2/5/10분)과 tone 매핑은 데모 규모에 맞춘 값이며, 실제 운용 환경에서는 조정이 필요할 수 있다.
- `summarizeWindow`는 순수 텍스트 요약이지 실제 통계적 이상탐지가 아니다 — "위험도 상승"은 단순히 첫 클립과 최고 클립의 tone 비교일 뿐, 정교한 추세 분석은 아니다.

## 6. 테스트 계획

- `src/cop/evidenceWindowSummary.test.ts`: `windowMsForTone`(3가지 tone), `summarizeWindow`(빈 배열, 단일 클립, 여러 클립 상승/유지 케이스, 윈도우 밖 클립 필터링).
- `useEvidenceWindowBuffer`는 DOM 의존이라 유닛 테스트 없이 e2e로 커버.
- e2e(`tests/e2e/cop.spec.ts`): 한 카메라에 여러 프레임(위험도가 다른)을 순차 목킹해 RightRailCodex의 자동 요청 본문에 종합 문구가 포함되는지 확인. D단계 애매 구간 시나리오에도 종합 문구가 포함되는지 확인(기존 D단계 e2e 테스트 확장 또는 신규 어서션 추가).

## 7. 검증 방법

1. `npm run typecheck && npm run lint && npm run test` 통과 확인.
2. e2e: RightRailCodex 자동 요청과 D단계 애매 구간 Codex 호출 양쪽에서 Codex가 받는 실제 요청 본문(`evidence.summary`)에 시간 윈도우 종합 문구가 실제로 포함되는지 확인.
