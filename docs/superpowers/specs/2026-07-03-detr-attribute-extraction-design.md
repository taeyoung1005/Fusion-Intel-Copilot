# DETR 탐지 인물의 외형 속성 추출 (로드맵 B단계)

## Context

D4D 로드맵은 A(UI 재구성, 완료) → B(DETR 속성 추출) → D(크로스 카메라 재식별) → E(Codex 시간 윈도우) 순서로 진행 중이다. 지금 DETR은 사람을 탐지만 할 뿐(바운딩박스+라벨) 외형 정보를 전혀 뽑지 않는다. 사용자는 모자/옷차림/소매 길이 등 사람이 읽을 수 있는 속성을 원했고, 이 속성이 나중 D단계에서 "여러 CCTV에서 같은 사람이 반복 포착됐는가"를 판단하는 입력값이 되어야 한다고 명시했다. 또한 이 속성이 단순히 화면에만 보이는 게 아니라 **Codex 에이전트가 실제로 받는 판단 입력값**에 포함되어야 한다고 명확히 했다.

조사 결과 `evidence.summary`(Codex가 받는 필드)는 지금 고정 문구(`"${zone} ${meta} 증거 패킷"`, `src/cop/codexAgentClient.ts:103`)이고, `evidence.title`만 증거 클립의 `label` 필드를 타고 흐른다(`buildIncidents`의 `title: latest?.label` → `Incident.title` → `context.incident.title`). 이 경로를 활용하는 것이 새 배선을 최소화하는 방법이다.

## 1. 뽑을 속성

| 속성 | 값 | 추출 방식 |
|---|---|---|
| 모자 착용 | 착용 / 미착용 | CLIP zero-shot |
| 소매 길이 | 반팔 / 긴팔 | CLIP zero-shot |
| 소지품 | 가방/배낭 소지 / 없음 | CLIP zero-shot |
| 상의 색상 | 색 이름(빨강/파랑/검정/흰색/회색/초록/노랑/기타) | 픽셀 평균 색상(HSV) → 최근접 색 이름 매핑 |
| 체구 | 소/중/대 | 바운딩박스 높이 ÷ 프레임 높이 비율 (거리 추정과 유사한 방식) |

CLIP은 3개의 독립적인 이진 질문에만 쓰고, 색상/체구는 모델 호출 없이 크롭된 픽셀에서 직접 계산한다 — 이미 무거운 DETR + WebRTC + Codex 요청이 동시에 도는 상황에서 모델 호출 수를 최소화하기 위함.

## 2. 실행 시점과 빈도

카메라별 증거 클립이 실제로 생성되는 시점(기존 `EVIDENCE_EVERY_FRAMES` 스로틀, 카메라당 약 3.6초 간격)에 속성 추출도 같이 실행한다. 실시간 알림 팝업의 8초 재알림 게이트와는 별개 — 그 게이트는 다른 레이어(`CopDashboard`)에 있어서 탐지 훅이 직접 참조하려면 배선이 복잡해지고, 이미 있는 증거 클립 스로틀에 얹는 편이 훨씬 단순하다. 결과적으로 팝업이 뜨지 않는 "같은 사건 지속 중"의 증거 클립에도 매번 속성이 새로 계산되어 붙는다(각 클립은 독립된 프레임이므로 이는 정상 동작 — 프레임마다 사람 위치/자세가 다를 수 있어 매번 재계산하는 게 맞다).

## 3. CLIP 모델 로딩과 실패 처리

`src/cop/detrVisionDetector.ts`의 `runDetrPipeline` 패턴(모델 id 상수, `pipeline()` 호출, transformers.js 자체 캐싱에 의존)을 그대로 따라 새 모듈에 `Xenova/clip-vit-base-patch32`(`zero-shot-image-classification` 태스크)를 로드한다. `useCarlaCameraDetection.ts`(구 코드, 현재 미사용이지만 패턴 참고)에 있던 `carlaDetrDisabled`/메모리 부족 감지 패턴을 그대로 재사용 — CLIP 모델이 `bad_alloc` 등으로 실패하면 속성 추출만 조용히 비활성화하고 DETR 탐지 자체는 계속 동작한다(전체 파이프라인이 죽지 않음).

## 4. 데이터 모델 변경

```ts
type PersonAttributes = {
  readonly hat: "wearing_hat" | "no_hat"
  readonly sleeveLength: "short_sleeve" | "long_sleeve"
  readonly bagCarried: "carrying_bag" | "no_bag"
  readonly topColor: string  // "red" | "blue" | "black" | "white" | "gray" | "green" | "yellow" | "unknown"
  readonly build: "small" | "medium" | "large"
  readonly attributeConfidence: number  // CLIP 3개 질문 평균 신뢰도(색상/체구는 휴리스틱이라 별도 신뢰도 없음)
}
```

- `VisionDetection`(`server/visionPipeline.ts`)에 `attributes?: PersonAttributes` 필드 추가 — DETR로 탐지된 각 사람 객체에 선택적으로 붙는다(사람이 아닌 객체는 없음).
- `EvidenceClip`(`src/cop/copTimelineData.ts`)에도 같은 `attributes?: PersonAttributes` 필드 추가.
- 사람이 읽는 문장으로 합쳐서 `EvidenceClip.label`에 반영: 예 `"person 탐지 · 빨간 상의 · 배낭 소지 · 모자 없음"`(기존 `${topObject.label} 탐지` 문구 뒤에 이어붙임).

## 5. Codex까지 가는 경로

- 위 확장된 `label`이 `buildIncidents`를 통해 그대로 `incident.title`이 됨(기존 배선 재사용, 변경 없음).
- `src/cop/codexAgentClient.ts`의 `evidence.summary` 생성부(현재 `"${zone} ${meta} 증거 패킷"` 고정 문구)를 `` `${zone} ${meta} 증거 패킷 — ${context.incident.title}` ``로 바꿔서, 속성이 반영된 텍스트가 Codex가 받는 `summary` 필드에도 실제로 들어가게 한다.
- UI(EVENT TIMELINE 툴팁, 실시간 알림 팝업, ClipPlayer)는 전부 같은 `EvidenceClip.label`/`detail`을 표시하므로 별도 UI 작업 없이 자연스럽게 같은 텍스트가 보인다.

## 알려진 제약

- CLIP 판정 정확도는 실제 프로덕션 수준이 아니라 데모/컨셉 수준이다 — 이는 "가짜 데이터 없음" 원칙과는 다른 문제로, 실제 모델이 실제 픽셀을 보고 낸 진짜 추론 결과이지만 정확도 자체는 낮을 수 있다(예: 저해상도 크롭에서 소매 길이 오판).
- 상의 색상 이름 매핑은 8개 정도의 기본 색상으로 단순화한다 — 세밀한 색상 구분(예: 남색 vs 검정)은 하지 않는다.
- 체구 추정(소/중/대)은 카메라 거리에 따라 바운딩박스 크기가 달라지므로 절대적인 신체 크기가 아니라 "그 프레임에서 상대적으로 크게/작게 보였다" 정도의 신호다 — D단계에서 이 한계를 감안해서 가중치를 낮게 줘야 한다(D단계 설계에서 다룸).

## 검증 방법

1. `npm run typecheck && npm run lint && npm run test` 통과 확인.
2. 수동 E2E: CARLA 카메라에 사람이 탐지되면 EVENT TIMELINE 툴팁/실시간 알림 팝업/ClipPlayer에 속성 텍스트(색상/모자/소매/가방)가 실제로 표시되는지 확인.
3. 서버 Codex 판단 요청 시 네트워크 탭 또는 로컬 어댑터 응답에서 `evidence.summary`에 속성 텍스트가 실제로 포함되는지 확인.
4. CLIP 모델 로딩 실패를 인위적으로 유발(예: 테스트 훅으로 에러 주입)했을 때 DETR 탐지 자체(사람 박스, 증거 클립 생성)는 계속 정상 동작하는지 확인.
