# 위협도별 단계적 대응 행동(Tiered Response Actions)

## Context

D4D COP 대시보드의 우측 "사람 확인 게이트" 패널(`RightRailResponseReport.tsx`의 `ResponseGatePanel`)에는 "검토 및 확인"/"에스컬레이션" 버튼이 있다. 눌러보면 컴포넌트 내부 로컬 state(`confirmed`, `decision`)만 바뀌고 화면에 문구 하나가 잠깐 뜰 뿐, 그 결과가 어디에도 반영되지 않는다 — 사건을 바꾸거나 새로고침하면 그대로 사라지고, 위쪽의 "관장 조치(Recommended Next Action)" 추천 문구나 ACTIVE INCIDENTS 패널, 일일 보고서에도 전혀 영향을 주지 않는다. 사용자가 이 문제를 정확히 지적했다: "판단 과정이나 판단 결과에 따른 행동 추천, 직접 행동하는 단계가 없다."

사용자가 원하는 것은 일반적인 "에스컬레이션" 버튼이 아니라, 실제 시설 경비 대응처럼 **위협도에 따라 다른 구체적 대응 행동**이 나오는 것이다: 순찰 강화, 번개조(QRF) 출동, 5분대기조 출동 + 발칸 사격 준비. 그리고 낮은 위협도(정상/불확실)에서는 사람이 버튼을 누를 필요 없이 Codex가 자동으로 처리한 것으로 표시되어야 한다.

이 스펙은 그 대응 행동 체계를 다룬다. CARLA 시뮬레이션에 실제 명령을 보내는 것(드론을 실제로 움직이는 등)은 범위 밖이다 — 이번엔 대시보드 표시까지만 구현한다.

## 1. 선행 수정: Incident 심각도 모델 복원

`src/cop/copAnalysisData.ts`의 `Incident.tone`은 현재 `"WATCH" | "NORMAL"` 두 값으로만 타입이 좁혀져 있다. 반면 `src/cop/operationalTelemetry.ts`의 `buildIncidents`는 각 카메라의 evidence clip들에서 실제 `AlertTone`(`normal|watch|alert|confirmed|uncertain`, `copMapBaseData.ts`)을 받아 `toneRank`로 최고 심각도를 계산해놓고도, 마지막에 `worst >= 2 ? "WATCH" : "NORMAL"`로 두 단계로 뭉개버린다. 즉 지금 구조에서는 `alert`/`confirmed`/`uncertain` 심각도가 있어도 사건은 항상 `WATCH`나 `NORMAL`로만 보인다 — 이 문제를 고치지 않으면 번개조/5분대기조 단계가 애초에 트리거될 수 없다.

**변경 사항:**
- `Incident.tone`의 타입을 `AlertTone`으로 확장한다(소문자 5단계로 통일; 기존 `"WATCH"`/`"NORMAL"` 대문자 리터럴은 제거).
- `buildIncidents`의 `toneRank`/정렬/최종 tone 계산을 고쳐서 실제 최고 심각도(`normal < uncertain < watch < alert < confirmed` 순서로 랭크 재정의)를 그대로 `Incident.tone`에 담는다. `STANDBY_INCIDENT.tone`도 `"normal"`로 소문자화한다.
- 아래 3곳을 5단계에 맞게 수정한다(타입을 좁히면 TypeScript가 누락된 case를 컴파일 에러로 잡아준다):
  - `src/cop/RightRailIncidents.tsx`: 배지 CSS 클래스와 표시 텍스트(`{incident.tone}` → 대문자 표시용 매핑 함수 추가)
  - `src/cop/codexAgentClient.ts`: `checkpointForIncident`, `statusForIncident`의 switch문에 `alert`/`confirmed`/`uncertain` 케이스 추가
  - `src/cop/operationalTelemetry.ts`: `gate-assess` PASS 조건(`incident.tone === "NORMAL"` → `"normal"`)

## 2. 대응 행동 카탈로그

새 모듈 `src/cop/responseActionCatalog.ts`:

```ts
export type ResponseActionKind = "auto" | "manual"
export type ResponseAction = {
  readonly id: string
  readonly kind: ResponseActionKind
  readonly label: string       // 버튼 라벨 또는 자동 조치 표시 문구
  readonly confirmedText: string // 조치 취한 뒤 보여줄 문구 (추천 문구/보고서에 재사용)
}

export const RESPONSE_ACTION_BY_TONE: Record<AlertTone, ResponseAction>
```

각 톤별 매핑(라벨은 최종 한글 문구, 필요시 다듬어도 됨):

| tone | kind | 라벨 | 설명 |
|---|---|---|---|
| `normal` | auto | "정상 감시 유지" | 평시, 조치 없음 |
| `uncertain` | auto | "Codex 자동 조치: 인접 카메라 우선 감시 전환" | 사람 확인 전 Codex가 자동으로 "처리한 것"으로 표시만 함 |
| `watch` | manual | "순찰 강화 지시" | 인접 구역 도보 순찰조 강화 요청 |
| `alert` | manual | "번개조 출동 지시" | 신속대응팀(QRF) 현장 급파 |
| `confirmed` | manual | "5분대기조 출동 + 발칸 사격 준비" | 최고 대응 태세 — 대기조 전원 출동 + 근접방어화기 사격 준비 전환 |

`kind: "auto"`인 톤은 버튼이 아니라 안내 텍스트로만 노출된다(3번 참고).

## 3. 상태 관리 및 지속성

`CopDashboard.tsx`에 기존 `liveDetectionFrames`와 동일한 패턴으로 상태를 추가한다:

```ts
type TakenResponseAction = { readonly actionId: string; readonly label: string; readonly tone: AlertTone; readonly takenAtMs: number }
const [responseActionsByIncident, setResponseActionsByIncident] = useState<ReadonlyMap<string, TakenResponseAction>>(() => new Map())
```

`manual` 등급 버튼을 누르면 `incidentId → TakenResponseAction`을 기록하는 콜백(`recordResponseAction`)을 호출한다. `auto` 등급(normal/uncertain)은 버튼이 없으므로 이 맵에 기록하지 않고, 매번 카탈로그에서 즉시 계산해 보여준다(자동 조치는 "취함/안 취함"을 구분할 필요가 없으므로).

세션 안에서 사건을 전환했다가 돌아와도(`Map` 유지) 기록이 남는다. 새로고침 시 초기화되는 건 다른 세션 state(`visionEvidence` 등)와 동일한 기존 동작이라 이번 스펙에서 서버 영속화는 하지 않는다.

## 4. UI 변경

`ResponseGatePanel`(`RightRailResponseReport.tsx`):
- 기존 "검토 및 확인" 버튼(게이트 PASS 확인)은 **그대로 유지** — "증거/맥락을 확인했다"는 것과 "대응 행동을 지시했다"는 것은 별개 개념이다.
- 기존 "에스컬레이션" 버튼을 제거하고, `selectedIncident.tone`에 따라:
  - `auto` 등급이면 버튼 대신 안내 텍스트 한 줄: `Codex 자동 조치: {label}`
  - `manual` 등급이면 버튼 하나: `{label}` (예: "번개조 출동 지시"). 이미 조치를 취한 사건이면 버튼 대신 `조치 완료: {label} ({HH:MM:SS})` 텍스트로 대체(중복 출동 방지, 기존 `confirmed`/`decision` 패턴과 동일한 자리에 렌더링).

## 5. 다운스트림 반영

- **`recommendedAction.ts`**: `responseActionsByIncident`를 새 인자로 받아, 해당 사건에 조치 기록이 있으면 `headline: "대응 조치 완료"`, `body: "{zone}: {label} 지시됨 ({시각})"`로 전환. 없으면 기존 로직(누락 맥락/게이트 상태 기반) 유지.
- **`RightRailIncidents.tsx`**: 각 사건 행에, 조치 기록이 있으면 작은 배지(`조치됨`)를 추가로 표시.
- **일일 보고서** (`reportArtifact.ts` / `useReportArtifactActions.ts`): `DailyReportRow`에 "대응 조치" 행 추가 — 조치가 있으면 `{label} · {시각}`, 없으면 `없음`.

## 6. 테스트 영향

`tests/e2e/cop.spec.ts`의 129~140행 근처(사람 확인 게이트 섹션)가 "에스컬레이션"/"감독자 검토로 상신" 문구를 단언하고 있어 새 버튼 문구로 갱신해야 한다. 추가로:
- `watch`/`alert`/`confirmed` 각 등급에서 올바른 버튼 라벨이 뜨는지
- `manual` 버튼 클릭 후 "조치 완료" 문구로 바뀌고 재클릭이 안 되는지(또는 버튼 자체가 사라지는지)
- `auto` 등급(normal/uncertain)에서는 버튼 없이 안내 텍스트만 뜨는지
- 조치 후 "관장 조치" 추천 문구가 바뀌는지
- 일일 보고서에 "대응 조치" 행이 포함되는지

단위 테스트: `operationalTelemetry.test.ts`에 `buildIncidents`가 5단계 tone을 그대로 보존하는지 검증하는 케이스 추가. `recommendedAction`용 신규 `.test.ts` 파일에 조치-있음/없음 분기 검증.

## 알려진 제약 / 추후 조정 여지

- `uncertain`의 "Codex 자동 조치" 문구는 지금은 고정 문구다. 실제로 어떤 카메라를 우선 감시할지 등 동적 계산은 이번 범위 밖이다(사용자가 "지금은 대시보드 표시만"으로 확정).
- CARLA 시뮬레이션에 실제 명령을 보내는 것(드론 이동 등)은 별도 스펙으로 분리한다.
- `confirmed` 등급의 "5분대기조 출동 + 발칸 사격 준비"는 두 가지 조치를 하나의 버튼/행동으로 묶었다 — 나중에 둘을 분리하고 싶다면 카탈로그의 `ResponseAction`을 배열로 바꾸면 된다(지금은 YAGNI로 단일 항목 유지).

## 검증 방법

1. `npm run typecheck && npm run lint && npx vitest run` 통과 확인.
2. `npx playwright test tests/e2e/cop.spec.ts` 전체 통과 확인(갱신된 게이트 테스트 포함).
3. 브라우저에서 실제로 watch/alert/confirmed 각 톤의 사건을 선택해 올바른 버튼이 뜨는지, 클릭 후 "조치 완료" 문구·추천 문구·ACTIVE INCIDENTS 배지·일일 보고서 행이 모두 갱신되는지 눈으로 확인.
