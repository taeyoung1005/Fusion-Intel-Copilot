# 크로스 카메라 인물 재식별/상관관계 판단 (로드맵 D단계)

## Context

D4D 로드맵은 A(UI 재구성, 완료) → B(DETR 속성 추출, 완료) → D(크로스 카메라 재식별) → E(Codex 시간 윈도우) 순서로 진행 중이다. B단계에서 각 CARLA 카메라가 사람을 탐지할 때마다 `PersonAttributes`(모자/소매/가방/상의색상/체구)를 뽑아 `EvidenceClip.attributes`에 붙이고 있다. D단계는 이 속성들을 이용해 "서로 다른 카메라에서 포착된 사람이 같은 사람일 가능성"을 판단해서 관제 요원에게 알려주는 기능이다.

지도 구조를 확인한 결과, CARLA 카메라들은 이미 전부 탄약고(AMMO DEPOT) 하나를 둘러싸는 타원형 배치(`src/cop/dynamicMapCamera.ts`, `radiusX: 388, radiusY: 238`)에 있다 — 즉 "민감구역 주변 카메라만 골라서 비교"할 필요 없이, **연결된 CARLA 카메라 전체 간 비교**로 충분하다. 여러 민감구역이 생기는 시나리오는 지금 지도 구조에 없으므로 다루지 않는다.

## 1. 매칭 로직

### 유사도 점수 (0~100점)

| 속성 | 가중치 | 비교 방식 |
|---|---|---|
| 상의 색상 (topColor) | 30 | 정확 일치 |
| 소지품 (bagCarried) | 20 | 정확 일치 |
| 소매 길이 (sleeveLength) | 20 | 정확 일치 |
| 모자 (hat) | 20 | 정확 일치 |
| 체구 (build) | 10 | 정확 일치 |

체구는 카메라 거리에 따라 바운딩박스 크기가 달라져 신뢰도가 낮은 신호이므로(B단계 스펙에 명시) 가장 낮은 가중치를 준다. 일치하는 속성들의 가중치를 그대로 합산한다.

### 판정 구간

- **55점 미만**: 신호 약함, 후보에서 제외(알림 없음)
- **55~79점 (애매 구간)**: 후보로 채택 — 규칙 기반 점수로 즉시 알림을 띄우되 Codex 자동 판단을 함께 요청한다(아래 4절 참조)
- **80점 이상 (확신 구간)**: 규칙 기반 점수만으로 알림, Codex 호출 없음(비용 절감)

### 매칭 대상 범위

- **서로 다른 카메라에서 나온 클립끼리만** 비교한다. 같은 카메라의 연속 프레임은 재식별이 아니라 단순 추적이므로 제외.
- 두 클립 모두 `attributes`가 있어야 한다(사람이 아닌 탐지는 후보에서 제외).

### 시간 윈도우 (카메라 간 거리 기반 자동 계산)

지도에 이미 있는 축척 기준(`copMapBaseData.ts`의 `DISTANCE_BANDS`: `band-50` = `PERIMETER.rx(322) * 0.86` ≈ 277px = 50m)을 재사용해 픽셀→미터 환산 비율을 얻는다(1px ≈ 0.1806m). 두 카메라의 지도 좌표(`node: Point`) 간 유클리드 거리를 미터로 환산한 뒤, 도보 속도 1.2m/s로 나누어 이동 시간을 구하고 **최소 20초, 최대 240초(4분)**로 클램프한다. 이 값이 두 클립의 관찰 시각 차이보다 커야 비교 후보가 된다.

## 2. 비교용 버퍼

화면에 보이는 증거 클립 배열(`visionEvidence`, `CopDashboard.tsx`)은 `MAX_VISION_EVIDENCE = 6`으로 제한되어 있어 4분짜리 시간 윈도우를 감당하기엔 너무 작다. 상관관계 매칭은 **별도의 내부 버퍼**(`useCorrelationAlerts` 훅 안의 `ref`)를 사용한다 — `attributes`가 있는 클립을 처음 관찰한 순간(`Date.now()`로 스탬프)마다 버퍼에 추가하고, 관찰 시각이 `MAX_TRAVEL_WINDOW_MS`(240초)보다 오래된 항목은 주기적으로 정리한다. 화면용 6개 제한과는 완전히 분리되어 있어 기존 UI 동작에 영향 없음.

## 3. 아키텍처

### `src/cop/personCorrelation.ts` (신규, 순수 함수)

- `type CorrelationBand = "ambiguous" | "confirmed"` (55점 미만은 후보 자체가 안 생기므로 밴드에 없음)
- `type CorrelationCandidate = { readonly clipA: EvidenceClip; readonly clipB: EvidenceClip; readonly score: number; readonly band: CorrelationBand }`
- `computeSimilarityScore(a: PersonAttributes, b: PersonAttributes): number`
- `travelTimeWindowMs(nodeA: Point, nodeB: Point): number`
- `findCorrelationCandidates(entries: readonly { clip: EvidenceClip; cameraId: string; observedAtMs: number; node: Point }[], nowMs: number): readonly CorrelationCandidate[]` — 서로 다른 카메라, 시간 윈도우 내, 점수 55 이상인 쌍을 전부 반환(호출자가 이미 알림 보낸 쌍은 걸러냄).

DETR/CLIP 모델 호출이 전혀 없는 순수 로직이라 `attributeClassifier.ts`의 `rgbToNamedColor` 등과 같은 방식으로 유닛 테스트한다.

### `src/cop/useCorrelationAlerts.ts` (신규 훅)

입력: `evidenceClips: readonly EvidenceClip[]`, `cameras: readonly DynamicCameraRecord[]`(카메라 위치 조회용), `onCorrelationEvidence: (clip: EvidenceClip) => void`(확정된 상관관계를 기존 증거 파이프라인에 실어 보내는 콜백 — `CopDashboard.tsx`의 `addVisionEvidence`를 그대로 전달).

동작:
1. `evidenceClips`에서 `attributes`가 있는 새 클립을 감지하면 내부 버퍼(2절)에 `Date.now()`와 함께 추가.
2. `findCorrelationCandidates`로 매 렌더 후보를 계산, 이미 처리한 클립 쌍(`seenPairsRef`, 키: 정렬된 `clipA.id:clipB.id`)은 건너뜀.
3. **확신 구간(80+)**: 즉시 합성 `EvidenceClip`을 만들어 `onCorrelationEvidence`로 전달. `source: "correlation"`, `camera`는 두 카메라 중 나중에 관찰된 쪽, `label`: `` `${laterCameraLabel} · ⚠️ ${earlierCameraId}에서 ${경과분}분 전 동일 인물 가능성 ${score}%` ``, `attributes`: 나중 클립의 속성 그대로.
4. **애매 구간(55~79)**: 먼저 훅의 로컬 알림 상태(React state, `EvidenceClip`이 아님)로 "⚠️ 판단 중..." 알림을 즉시 노출. 동시에 `requestCodexAgent`(`./codexAgentClient`)를 직접 호출 — 합성 `Incident` 객체를 만들어서 전달(`id`, `tone: "WATCH"`, `zone: "AMMO DEPOT CLUSTER"`(1절에서 확인했듯 모든 CARLA 카메라가 이 구역 하나를 둘러싸므로 고정값으로 충분 — `DynamicCameraRecord`엔 구역 필드가 따로 없음), `title`: `` `${cameraA} → ${cameraB} 동일 인물 가능성 검토` ``, `meta`: `` `유사도 ${score}%` ``, `time`, `confidence: score`), `citations`는 두 카메라 ID로 구성, `missingContext: []`, `responseOutcome: "상관관계 자동 판단"`. 응답이 오면(성공/실패 무관하게) **그 시점에 딱 한 번** 합성 `EvidenceClip`을 만들어 `onCorrelationEvidence`로 전달 — 성공 시 label에 Codex 판단 요약을 포함(`` `Codex 판단: ${decision.summary}` ``), 실패 시 규칙 기반 점수만 담은 문구로 폴백. 로컬 알림 상태도 이 최종 문구로 갱신.
5. 이렇게 만들어진 상관관계 클립은 기존 `buildIncidents`(`operationalTelemetry.ts`, 카메라별 최신 클립 → `Incident.title`)를 그대로 타고 `codexAgentClient.ts`의 `evidence.summary`(이미 B단계에서 `incident.title`을 포함하도록 확장됨)에 들어간다 — **새 Codex 배선 없이 기존 파이프라인 재사용**.

### `src/cop/RealtimeAlertStack.tsx` (수정)

- `RealtimeAlert`에 `kind: "detection" | "correlation"` 필드 추가(기존 것은 전부 `"detection"`).
- `RealtimeAlertCard`가 `kind === "correlation"`이면 다른 색(앰버) 테두리/아이콘으로 렌더링.
- `CopDashboard.tsx`에서 `useCorrelationAlerts`의 결과를 기존 `useRealtimeAlerts`의 결과와 합쳐서 `RealtimeAlertStack`에 전달(같은 자동 닫힘 설정 공유).

### `src/cop/RightRailCodex.tsx` (수정, 별도 정리)

이번 작업과 별개로, 우측 패널의 수동 "서버 Codex 판단 요청" 버튼을 제거한다. 이 버튼은 사용자가 처음 이 기능을 설계한 적 없는 부가 UI였고, `useEffect`가 이미 선택된 사건/클립이 바뀔 때마다 자동으로 `requestDecision()`을 호출하고 있어 버튼은 실패 시 재시도 용도로만 쓰였다. 사용자 요청에 따라 버튼을 완전히 제거한다 — 자동 요청 로직(`useEffect`, `requestDecision`)은 그대로 유지.

## 4. 알려진 제약

- 이 프로젝트는 실제 얼굴인식/재식별 모델을 쓰지 않는다 — B단계에서 이미 뽑은 이산적 속성(색상/모자/소매/가방/체구)만으로 휴리스틱 유사도를 계산하는 데모 수준 판단이다.
- 체구 신호는 카메라 거리에 따라 달라지므로 가중치를 가장 낮게 뒀지만, 여전히 부정확할 수 있다.
- 도보 이동 시간 추정은 지도 축척을 재사용한 근사치이며 실제 지형/장애물을 고려하지 않는다.
- 애매 구간의 Codex 자동 호출은 매칭 후보가 나올 때마다 실행되므로, 활성 카메라가 많고 애매한 매칭이 자주 발생하면 Codex 요청 빈도가 늘어날 수 있다 — 데모 규모에서는 허용 가능한 수준으로 판단.

## 5. 테스트 계획

- `src/cop/personCorrelation.test.ts`: `computeSimilarityScore`(속성별 가중치 조합 — 완전 일치/부분 일치/완전 불일치), `travelTimeWindowMs`(거리별 계산 및 최소/최대 클램프), `findCorrelationCandidates`(다른 카메라만, 시간 윈도우 내, 밴드 분류, 이미 처리한 쌍 제외).
- `useCorrelationAlerts`/Codex 자동 호출은 DOM/네트워크 의존이라 유닛 테스트 없이 e2e로 커버.
- e2e(`tests/e2e/cop.spec.ts`): 두 CARLA 카메라에서 유사 속성이 시간 윈도우 내에 포착되는 상황을 목킹해 확신 구간 상관관계 알림이 뜨는지, 애매 구간에서 Codex 자동 호출 후 알림 문구가 갱신되는지, EVENT TIMELINE에 합성 클립이 표시되는지 확인. 기존에 "서버 Codex 판단 요청" 버튼을 참조하던 테스트는 버튼 제거에 맞춰 수정.

## 6. 검증 방법

1. `npm run typecheck && npm run lint && npm run test` 통과 확인.
2. 수동/자동 e2e: 확신 구간(80+)과 애매 구간(55~79) 양쪽 시나리오가 모두 알림·타임라인·Codex summary에 정확히 반영되는지 확인.
3. 우측 패널에서 수동 버튼이 제거되고 자동 요청만 남았는지, 기존 실패 시 폴백(에러 메시지 표시)이 여전히 동작하는지 확인.
