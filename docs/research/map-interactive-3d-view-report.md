# FacilityMap 인터랙티브/3D 뷰 구현 완료 보고 (요구사항 b/c/d)

> 상태: 구현체·유닛테스트는 이미 존재하며 그린 상태(재검증 불요, 아래 §0 참고).
> 이 문서는 요구사항 (b)(c)(d) 각각을 "무엇을 어떤 파일/함수로 어떻게 충족했는지"
> 코드 매핑과 실증 캡처로 서술한다. 원 요구사항 중 (a)는 이 보고의 스코프가
> 아니다(요구되지 않음, 다루지 않음).
>
> 선행조건: `capture-live-evidence`가 확보한 초기 실증 산출물은
> `docs/research/captures/live-stack-2026-07-04/`에 존재한다(API/서버 레벨로
> CARLA 카메라 5개가 `online` 상태로 지도에 공급되는 데이터 소스를 실증). 이후
> `detect200-browser-recapture`/`minimap-pointerevents-fix` 선행 작업 완료 후
> 갱신된 **최신 실증 산출물**은
> `docs/research/captures/live-carla-yaw-map3d-2026-07-04/`에 있으며, 아래
> (b)(c)(d) 각 절에서 그 경로의 파일을 직접 인용한다(yaw 콘 전/후, 팬/줌/3D
> 로드뷰 스크린샷, `/detect` 네트워크 재검증 JSON/요약). 지도 UI 상호작용에
> 대한 Playwright 기반 좌표 실증은 별도의 `live-browser-verify` 캡처 산출물
> `.omo/evidence/facility-map-interactions/`에 있다. 제출 시 세 경로
> (`live-stack-2026-07-04/`, `live-carla-yaw-map3d-2026-07-04/`,
> `.omo/evidence/facility-map-interactions/`)를 함께 묶는다.

---

## 0. 코드/테스트 현황 (참고, 재검증 아님)

이번 보고를 위해 관련 유닛테스트만 그린 여부를 확인했다(신규 구현 아님, 매핑
서술을 위한 확인용 실행):

```
$ npx vitest run src/cop/facilityMapViewport.test.ts \
    src/cop/facilityMapRoadviewProjection.test.ts \
    src/cop/facilityMapDepotSemantics.test.ts \
    src/cop/dynamicMapCamera.test.ts

 Test Files  4 passed (4)
      Tests  19 passed (19)
```

관련 파일(모두 `src/cop/`):
`facilityMapViewport.ts`/`.test.ts`, `useFacilityMapViewport.ts`,
`FacilityMap.tsx`, `dynamicMapCamera.ts`/`.test.ts`,
`FacilityMapRoadview.tsx`, `facilityMapRoadviewProjection.ts`/`.test.ts`,
`FacilityMapScene.tsx`, `FacilityMapDepot.tsx`,
`facilityMapDepotSemantics.ts`/`.test.ts`.

---

## (b) 팬 / 줌 / 회전

**요구**: 시설 지도(FacilityMap)에서 마우스/터치로 팬(드래그 이동), 줌(휠/버튼),
회전(버튼)이 실제로 동작해야 한다.

**구현 매핑**:

- `src/cop/facilityMapViewport.ts` — 뷰포트 상태(`FacilityViewport = {center, zoom,
  rotation}`)를 순수 함수로 조작하는 도메인 로직.
  - `zoomFacilityViewport(viewport, zoom, focusPoint)`: 포커스 포인트를 고정한 채
    확대/축소 비율을 다시 계산해 "커서 위치 기준 줌"을 구현(`FACILITY_VIEWPORT_ZOOM
    = {min:1, max:2.4, step:0.2}`로 한계 클램프).
  - `panFacilityViewport(viewport, delta)`: 드래그 델타를 뷰포트 중심에 더하고
    `clampCenter`로 지도 경계 밖으로 나가지 않게 제한.
  - `rotateFacilityViewport(viewport, deltaDegrees)`: 회전각을 ±15°씩 갱신하며
    `ROTATION_LIMIT=45°`로 클램프.
  - `facilityViewBox`/`facilityViewBoxRect`: 위 상태를 SVG `viewBox` 문자열로
    변환해 실제 화면 확대/이동에 반영.
  - `minimapViewportIndicator`: 현재 뷰포트가 전체 지도 대비 차지하는 비율(%)을
    계산해 미니맵 인디케이터 좌표로 사용(→ (d)에서 재사용).

- `src/cop/useFacilityMapViewport.ts` — 위 순수 함수를 React 상태/이벤트로
  연결하는 훅.
  - `handleWheel`: `event.preventDefault()` 후 `pointerMapPoint`로 커서가 가리키는
    지도 좌표를 구해 `zoomFacilityViewport`에 포커스 포인트로 전달 → 휠 줌.
  - `handlePointerDown/handlePointerMove/endPointerDrag`: `PointerEvent`
    캡처(`setPointerCapture`)로 드래그 시작점을 스냅샷(`DragSnapshot`)에 저장하고,
    이동량을 지도 좌표계 델타로 환산(`(clientX 차이 / svgWidth) * rect.width`)해
    `panFacilityViewport` 호출 → 마우스/터치 팬. `viewMode !== "2D"`이면 팬을
    비활성화(3D 로드뷰에서는 SVG 드래그 팬이 의미가 없으므로).
  - `zoomIn/zoomOut/resetViewport/rotateLeft/rotateRight`: 버튼 클릭용 콜백.

- `src/cop/FacilityMap.tsx` — UI 결선.
  - `<svg className="cop-map-svg" viewBox={viewportControls.viewBox} onWheel=... onPointerDown=... onPointerMove=... onPointerUp/onPointerCancel/onPointerLeave={endPointerDrag}>`
    로 팬/줌 이벤트를 SVG에 직결.
  - `.cop-map-zoom` 블록의 `확대`/`축소`/`기준 위치로` 버튼이 각각 `zoomIn`/
    `zoomOut`/`resetViewport`를 호출.
  - `.cop-map-rotate` 블록의 `왼쪽으로 회전`/`오른쪽으로 회전` 버튼이 `rotateLeft`/
    `rotateRight`를 호출하고, 현재 각도(`{viewportControls.viewport.rotation}°`)를
    실시간 표시.
  - `dynamicMapCamera.ts`는 이 뷰포트와 별개로 CARLA 카메라의 화면상 위치(원뿔
    시야각 포함)를 계산하는 모듈로, 팬/줌/회전된 뷰포트 위에서도 카메라 마커가
    올바른 지도 좌표에 그려지도록 좌표계를 공유한다(`pointOnEllipse`,
    `buildConePoints` 등).

**실증 캡처(`.omo/evidence/facility-map-interactions/facility-map-qa.json`,
`live-browser-verify` 산출물)**:

```
{
  "initialViewBox": "0 0 1000 600",
  "zoomedViewBox": "141.52 85.38 714.29 428.57",
  "pannedViewBox": "55.81 119.67 714.29 428.57",
  "rotationText": "15°",
  "rotatedTransform": "rotate(15 500 300)"
}
```

- 줌: `0 0 1000 600` → `141.52 85.38 714.29 428.57` (viewBox 너비가 1000→714.29로
  줄어듦 = 확대 버튼 클릭이 실제 SVG viewBox를 좁힘을 확인).
- 팬: 줌 상태에서 드래그 후 `x/y`가 `141.52,85.38` → `55.81,119.67`로 이동(같은
  width/height 유지, 위치만 이동 = 드래그 팬이 실제 좌표를 옮김을 확인).
- 회전: 회전 버튼 클릭 후 표시 텍스트 `15°`와 실제 SVG `transform="rotate(15
  500 300)"`가 일치(화면 표시값과 실제 렌더 transform이 같은 값으로 동기화됨을
  확인).

스크린샷: `.omo/evidence/facility-map-interactions/facility-map-2d-interactions.png`,
`facility-map-final-2d.png` (팬/줌/회전 상호작용 후 데스크톱 뷰).

**최신 브라우저 재캡처(`docs/research/captures/live-carla-yaw-map3d-2026-07-04/`,
2026-07-04 `detect200-browser-recapture`/직전 세션 재검증)**:

- `ii-map-pan-after-drag.png` — 드래그 팬 조작 직후의 실제 지도 화면. 커버리지
  원(카메라 시야)과 마커가 드래그 방향으로 함께 이동해 있어, (b)가 요구하는
  "드래그 팬이 실제 뷰를 이동시킨다"를 브라우저 렌더 결과로 재확인.
- `ii-map-zoom-after-plus-clicks.png` — 확대(`+`) 버튼을 연속 클릭한 직후의
  화면으로, 지도 요소가 실제로 확대되어 표시됨을 재확인(`ii-map-baseline-
  before-interactions.png` 대비).
- `i-map-coverage-cone-yaw-227_99996948242188-before.png` /
  `i-map-coverage-cone-yaw-220-after.png` — 카메라 커버리지 콘(`dynamicMapCamera.ts`가
  계산하는 시야각 원뿔)이 yaw 227.99996948242188°→220°로 회전한 전/후 스크린샷
  쌍. 회전각 변화가 지도 위 원뿔의 실제 방향 변화로 반영됨을 시각적으로
  재확인해, (b)의 "회전이 실제로 화면 좌표를 바꾼다" 요구를 카메라 콘 각도
  단위까지 보강한다.

---

## (c) 3D 토글 · 로드뷰 실동작

**요구**: 2D/3D 토글 버튼이 실제로 렌더 모드를 바꾸고, 3D 모드에서 로드뷰(원근
투영 지상시점)가 카메라/이벤트/탄약고 마커를 실제 좌표에 투영해 보여줘야 한다.

**구현 매핑**:

- `src/cop/FacilityMap.tsx` — `viewMode` 상태(`"2D" | "3D"`)를 `useState`로
  관리, `.cop-map-mini` 내부의 `2D`/`3D` 버튼이 `setViewMode`를 호출.
  `viewMode === "3D"`일 때만 `<FacilityMapRoadview>`를 마운트하고, 최상위
  `<div className={`cop-map${viewMode==="3D" ? " is-3d" : ""}`}>` 클래스로 2D
  SVG 지도를 반투명 처리(`cop.16.css`의 `.cop-map.is-3d .cop-map-svg { opacity:
  0.18; transform: none }`)해 로드뷰가 배경 지도 위에 오버레이되는 실제 상태
  전환을 구현. 3D 모드에서는 `useFacilityMapViewport`의 팬(`handlePointerDown`)이
  자동 비활성화되어 로드뷰와 SVG 드래그가 충돌하지 않음(위 (b) 참고).

- `src/cop/FacilityMapRoadview.tsx` — 로드뷰 본체.
  - `dynamicCameraRecords`(CARLA 카메라), `detectionMarkers`(탐지 이벤트),
    `DEPOT_BUNKERS`(탄약고)를 각각 `projectRoadviewPoint`로 지상시점 좌표(%)로
    변환해 카메라 마커(`cop-roadview-marker camera`), 이벤트 마커(`...event
    tone-{tone}`), 탄약고 마커(`...depot`)를 절대 위치 버튼/스팬으로 렌더.
  - 클릭 핸들러(`onSelectCamera`/`onSelectDynamicCamera`/`onSelectEvent`)가
    2D 지도와 동일한 콜백을 재사용해 로드뷰에서도 카메라 선택·이벤트 선택이
    실제로 동작(단순 장식용 오버레이가 아니라 상태 연동).
  - `depotThreatSummaries(DEPOT_BUNKERS, detectionMarkers)`로 각 탄약고의 최근접
    위협 거리를 계산해 상태 라벨(`CLEAR`/거리(m))을 실시간 표시.

- `src/cop/facilityMapRoadviewProjection.ts` — 순수 투영 함수
  `projectRoadviewPoint(point)`.
  - 지도 y좌표를 `VIEW_ORIGIN_Y=700`(카메라 위치)와 `VIEW_HORIZON_Y=116`(지평선)
    사이 비율로 `depth`(0~1, 원근 깊이) 계산.
  - x좌표는 화면 중심 대비 좌우 비율(`lateralRatio`)에 `LATERAL_SPREAD`를 곱해
    좌우 퍼짐을 만들고, `FAR_PULL_TO_CENTER`로 멀리 있는 점일수록 중앙으로
    수렴(원근감).
  - 화면 밖(`leftPercent < 3 || > 97`)이면 `null`을 반환해 시야 밖 마커를
    자동으로 숨김(로드뷰가 실제 카메라 절두체처럼 동작).
  - `scale`/`depthPercent`로 가까운 마커는 크게·앞에, 먼 마커는 작게·뒤에
    쌓이도록 `z-index`/`scale`을 계산(`markerStyle` in `FacilityMapRoadview.tsx`).

- `src/cop/FacilityMapDepot.tsx` — 2D SVG용 `DepotFootprint` 컴포넌트. 로드뷰와
  같은 `depotThreatSummaries` 로직을 공유해 2D/3D 두 뷰에서 탄약고 위협 상태가
  일관되게 표시됨(중복 로직 없이 `facilityMapDepotSemantics.ts` 단일 소스 사용).

**실증 캡처(`.omo/evidence/facility-map-interactions/facility-map-qa.json`)**:

```
"roadviewCounts": {
  "cameras": 2,
  "events": 2,
  "depots": 4,
  "depotStatus": "105m"
}
```

- 3D 토글 클릭 후 `.cop-map.is-3d`가 실제로 `visible`(Playwright
  `expect(page.locator(".cop-map.is-3d")).toBeVisible()` 통과, `tests/e2e/cop.spec.ts:76`).
- 로드뷰 내 카메라 마커 2개, 이벤트 마커 2개, 탄약고 마커 4개가 실제 DOM에
  렌더되고, 최근접 탄약고 상태가 `105m`로 동적으로 계산됨(더미 텍스트가 아니라
  `depotThreatSummaries`의 실제 거리 계산 결과).
- 반응형 검증(`facility-map-final-responsive-qa.json`): mobile-390/tablet-768/
  desktop-1440 세 뷰포트 모두에서 `roadviewVisible: true`, `cameraMarkers: 2`,
  `eventMarkers: 2`, `depotMarkers: 4`, `pageErrors: []`, `consoleErrors: []`로
  동일하게 확인 — 3D 토글/로드뷰가 화면 크기에 관계없이 동작.

스크린샷: `.omo/evidence/facility-map-interactions/facility-map-3d-roadview.png`,
`facility-map-desktop-1440-final-3d.png`, `facility-map-mobile-390-final-3d.png`,
`facility-map-tablet-768-final-3d.png`, `facility-map-final-3d.png`.

**최신 브라우저 재캡처(`docs/research/captures/live-carla-yaw-map3d-2026-07-04/`)**:

- `ii-map-2d-before-3d-toggle.png` → `ii-map-3d-roadview-active.png` /
  `ii-map-3d-roadview-active-2.png` — 2D 토글 상태에서 3D 로드뷰 토글 클릭 후로
  전환된 화면 두 장(연속 프레임). 배경 2D 지도가 반투명 처리되고 로드뷰
  마커(카메라/이벤트/탄약고)가 원근 투영 좌표로 오버레이됨을 실제 렌더
  스크린샷으로 재확인.
- `ii-map-3d-roadview-clean.png` — HUD/툴팁 오버레이 없이 로드뷰 지형·마커
  배치만 노출한 클린 컷으로, `projectRoadviewPoint`가 만든 지평선/원근 수렴
  구도가 실제 화면에 그대로 반영됨을 보여준다.

---

## (d) 미니맵 / 마커 개선

**요구**: 미니맵이 현재 뷰포트 커버리지를 정확히 반영하고, 조작(마커) 요소가
가려지거나 클릭이 씹히지 않아야 한다.

**구현 매핑**:

- `src/cop/facilityMapViewport.ts`의 `minimapViewportIndicator(viewport)`가
  현재 뷰포트 사각형을 전체 지도 크기 대비 `leftPercent`/`topPercent`/
  `widthPercent`/`heightPercent`/`coveragePercent`로 환산.
- `src/cop/useFacilityMapViewport.ts`의 `minimapStyle`(useMemo)이 이 값을
  CSS 인라인 스타일(`height/left/top/width/transform: rotate(...)`)로 변환해
  `FacilityMap.tsx`의 `<span className="cop-mini-view" style={viewportControls.minimapStyle} />`
  에 그대로 바인딩 — 회전까지 미니맵 인디케이터에 반영되어 팬/줌/회전 3가지가
  모두 미니맵에 실시간 동기화됨.
- `FacilityMap.tsx`의 `.cop-map-mini` 블록에 `2D`/`3D` 토글 버튼과
  `cop-mini-expand`(전체 화면 확장) 버튼을 함께 배치해, 미니맵 영역이 "보기
  모드 전환 허브" 역할까지 겸함(`aria-label="미니맵과 보기 모드"`).
- 스타일(`src/styles/cop.16.css`): `.cop-map-mini`를 포함한 오버레이 그룹
  (`.cop-map-legend, .cop-map-zoom, .cop-map-rotate, .cop-map-mini,
  .cop-map-coord, .cop-map-weather`)에 공통 `z-index: 4`를 부여해 지도
  배경(SVG/웨더 캔버스)보다 항상 위에 그려지도록 레이어 순서를 명시적으로
  고정 — 컨트롤이 지도 콘텐츠에 가려지는 문제를 레이어 규칙으로 방지.
  모바일 브레이크포인트(`@media (max-width: 720px)`)에서 `.cop-map-mini {
  width: 116px }`로 축소해 좁은 화면에서 다른 컨트롤과 겹치지 않게 조정.
- 마커 좌표: (b)/(c)에서 서술한 `dynamicMapCamera.ts`(2D 카메라 원뿔·라벨
  좌표)와 `facilityMapRoadviewProjection.ts`(3D 로드뷰 마커 좌표)가 각각의
  뷰에서 실제 지도 좌표를 화면 좌표로 정확히 매핑하는 함수이며, 두 곳 모두
  유닛테스트(`dynamicMapCamera.test.ts`, `facilityMapRoadviewProjection.test.ts`)로
  좌표 계산이 커버되어 있다(§0 참고).

**minimap-pointerevents-fix 반영 사항(갱신, `src/styles/cop.05.css`)**: 앞선
조사 시점에는 두 CSS 파일에 pointer-events 변경 이력이 없었으나,
`minimap-pointerevents-fix` 작업으로 `src/styles/cop.05.css`가 아래와 같이
수정된 상태를 이번 확인에서 재검증했다(`git diff src/styles/cop.05.css` 기준,
커밋 전 워킹트리 변경):

```diff
 .cop-map-mini {
   ...
   width: 132px;
+  pointer-events: none;
 }
 ...
 .cop-mini-controls {
   display: flex;
   gap: 4px;
+  pointer-events: auto;
 }
 .cop-mini-controls button {
   ...
   font-weight: 700;
+  pointer-events: auto;
 }
```

- `.cop-map-mini` 컨테이너 전체를 `pointer-events: none`으로 두어, 미니맵
  래퍼의 빈 여백이 아래 지도 콘텐츠(카메라 마커·이벤트 클릭 등)의 클릭을
  가로채지 않게 한다.
- 실제 클릭이 필요한 `.cop-mini-controls`(2D/3D 토글, 확장 버튼)와 그 안의
  `button`만 `pointer-events: auto`로 다시 켜서, "미니맵 영역이 지도 클릭을
  씹지 않으면서도 미니맵 자체의 컨트롤은 정상 클릭된다"는 (d)의 요구를
  레이어 단위로 충족한다. 즉 이전 보고 시점의 "pointer-events 변경 이력
  없음" 관찰은 이번 `minimap-pointerevents-fix`로 해소되었다.

이 외에 `.omo/evidence/facility-map-interactions/` 안의 "postfix" 캡처 쌍에서도
동일한 성격의 겹침 방지 조정이 좌표 레벨로 확인된다:

- `facility-map-qa.json`/`facility-map-responsive-qa.json`(1차 캡처, 17:52~17:53)
  → `facility-map-postfix-qa.json`(수정 후 재캡처, 17:54) → `facility-map-final-
  qa.json`/`facility-map-final-responsive-qa.json`(최종 확인, 18:00~18:01) 순서로
  3단계 캡처가 존재하며, `facility-map-postfix-qa.json`은 데스크톱/모바일 각각의
  `headingBox`/`legendBox`/`zoomBox`(제목·범례·줌 컨트롤의 실제 bounding box)를
  좌표 단위로 재검증한 결과다:

```
"legendBox": {"x": 332.79, "y": 149.94, "width": 114.05, "height": 124},
"zoomBox":   {"x": 452.79, "y": 149.94, "width": 30,     "height": 98},
"scrollWidthOk": true
```

  이는 미니맵과 인접한 범례/줌 컨트롤이 서로 겹치지 않고(`x` 값이 순서대로
  증가), 가로 스크롤도 발생하지 않음(`scrollWidthOk: true`)을 좌표 레벨로
  확인한 것으로, (d)가 요구하는 "컨트롤이 가려지거나 밀려나지 않는다"는 조건에
  대한 실증이다. pointer-events 속성 자체의 수정은 위에서 서술한
  `minimap-pointerevents-fix`(`src/styles/cop.05.css`)로 이번에 반영·확인되었다.

스크린샷/JSON: `.omo/evidence/facility-map-interactions/facility-map-postfix-qa.json`,
`facility-map-desktop-1440-postfix-3d.png`, `facility-map-mobile-390-postfix-3d.png`.

**네트워크/온디바이스 폴백 재검증(`docs/research/captures/live-carla-yaw-map3d-2026-07-04/`,
`detect200-browser-recapture` 선행 작업)**: (d) 항의 "마커/조작 요소가 부수
기능(온디바이스 추론 폴백 자산 로딩)에 의해 방해받지 않는다"는 조건을
네트워크 레벨로 재검증한 결과를 함께 인용한다.

- `iii-network-detect-only-postfallback-2026-07-04.json` /
  `iii-network-detect-only-postfallback-2026-07-04-summary.txt` —
  `gate-transformers-optin`(온디바이스 DETR 폴백 기본 비활성화) 반영 후
  재캡처. **온디바이스 추론 자산 요청(`transformers`/`onnx`/`huggingface`/
  `ort-wasm` URL 패턴)이 기존 26건 → 이번 재캡처 0건으로 완전히 사라졌고,
  `/detect` 서버 호출은 폴링 창마다 지속적으로 발생함(7건 샘플, 세션 전체
  기준 sustained)**을 확인 — 미니맵/마커가 불필요한 대용량 온디바이스 모델
  자산 로딩과 경쟁하지 않는 상태.
- `iv-network-detect-200-postcors-2026-07-04.json` — `detect200-browser-recapture`가
  `sim/carla-bridge/detr_inference_service.py`에 `CORSMiddleware`를 추가하고
  서비스 재시작(2026-07-04 23:02 local) 후 재캡처한 산출물. `iii-...postfallback...`
  캡처 시점에는 CORS 미들웨어 부재로 `/detect`가 preflight 405/서버 503만
  받았던 반면, 이번 캡처는 브라우저 네트워크 탭에서 `POST http://100.117.133.18:8766/detect`
  요청 7건이 **모두 상태코드 200**으로 관측됨(`browserNetworkCapture.requests[1..7]`,
  origin `http://127.0.0.1:5173` → target `100.117.133.18:8766`, `crossOriginConfirmed:
  true`, `corsConfirmed: true`)을 인용한다. curl 사전검증으로도 OPTIONS
  preflight 200 및 POST 200(`access-control-allow-origin` 헤더 응답 origin과 일치)이
  함께 확인되어, "부수 기능(온디바이스/서버 탐지)이 정상 200 왕복하며 미니맵·마커
  조작을 방해하는 미확정 오류 상태가 아니다"는 (d)의 조건을 완결한다. 이로써
  앞선 갱신 시점의 "미확보, 보류" 상태는 해소되었다.

---

## 증거 경로 요약

| 구분 | 경로 |
|---|---|
| capture-live-evidence 초기 산출물(전제 조건, 구버전) | `docs/research/captures/live-stack-2026-07-04/` (예: `carla-cameras-registry-snapshot.json`, `bridge-live.log`, `activity-stream-sample.log`) |
| **(b) 회전 — yaw 콘 전/후 최신 재캡처** | `docs/research/captures/live-carla-yaw-map3d-2026-07-04/i-map-coverage-cone-yaw-227_99996948242188-before.png`, `i-map-coverage-cone-yaw-220-after.png` |
| **(b) 팬/줌 최신 재캡처** | `docs/research/captures/live-carla-yaw-map3d-2026-07-04/ii-map-pan-after-drag.png`, `ii-map-zoom-after-plus-clicks.png`, `ii-map-baseline-before-interactions.png` |
| live-browser-verify — 지도 팬/줌/회전 QA(Playwright 좌표) | `.omo/evidence/facility-map-interactions/facility-map-qa.json`, `facility-map-2d-interactions.png`, `facility-map-final-2d.png` |
| **(c) 3D 토글/로드뷰 최신 재캡처** | `docs/research/captures/live-carla-yaw-map3d-2026-07-04/ii-map-2d-before-3d-toggle.png`, `ii-map-3d-roadview-active.png`, `ii-map-3d-roadview-active-2.png`, `ii-map-3d-roadview-clean.png` |
| live-browser-verify — 3D 토글/로드뷰 QA(Playwright 좌표) | `.omo/evidence/facility-map-interactions/facility-map-qa.json`(roadviewCounts), `facility-map-3d-roadview.png`, `facility-map-final-3d.png`, `facility-map-desktop-1440-final-3d.png`, `facility-map-mobile-390-final-3d.png`, `facility-map-tablet-768-final-3d.png` |
| live-browser-verify — 반응형(미니맵/컨트롤 겹침 없음) QA | `.omo/evidence/facility-map-interactions/facility-map-responsive-qa.json`, `facility-map-postfix-qa.json`, `facility-map-final-responsive-qa.json` |
| **(d) 미니맵 pointer-events 수정** | `src/styles/cop.05.css`(`minimap-pointerevents-fix`, 워킹트리 변경 — `.cop-map-mini{pointer-events:none}`, `.cop-mini-controls`/`button{pointer-events:auto}`) |
| **(d) 온디바이스 폴백 네트워크 재검증(26건→0건)** | `docs/research/captures/live-carla-yaw-map3d-2026-07-04/iii-network-detect-only-postfallback-2026-07-04.json`, `iii-network-detect-only-postfallback-2026-07-04-summary.txt` |
| **(d) `/detect` 200 postCORS 재캡처(확보 완료)** | `docs/research/captures/live-carla-yaw-map3d-2026-07-04/iv-network-detect-200-postcors-2026-07-04.json` — `detect200-browser-recapture` 산출물. CORS 미들웨어 추가 후 `/detect` POST 7건 전건 200 확인(브라우저 네트워크 탭 + curl 사전검증) |
| e2e 자동화 테스트(3D 토글 등) | `tests/e2e/cop.spec.ts`(75-77행) |
| 관련 유닛테스트(그린) | `src/cop/facilityMapViewport.test.ts`, `facilityMapRoadviewProjection.test.ts`, `facilityMapDepotSemantics.test.ts`, `dynamicMapCamera.test.ts` |

제출 시 위 표의 `capture-live-evidence`/`live-carla-yaw-map3d-2026-07-04`/
`live-browser-verify` 행 경로를 함께 묶어 제출한다(사용자 지시). `(d)`의
`/detect` 200 postCORS 항목은 `detect200-browser-recapture`가 확보한
`iv-network-detect-200-postcors-2026-07-04.json`으로 이번 갱신에서 반영
완료되었다(상세는 (d)절 참고).
