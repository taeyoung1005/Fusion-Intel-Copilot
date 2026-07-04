# D4D 현장 피칭 운용 런북 (3분 결정적 시퀀스)

> 상태: 이 런북은 2026-07-04 세션 기준 "현재 알려진 산출물"로 실행 가능하게 작성됨.
> `demo-scenario-script`(결정적 시나리오 정의), `backend-activity-stream`(로그 패널
> 연출), `military-ui-polish`(경보 에스컬레이션 연출), 드론 ISR 핸드오프 UI가
> 이후 세션에서 확정되면 **② 3분 각본**의 해당 타임스탬프 셀만 갱신하면 되도록
> 구조를 잡았다. 표시 화면/컴포넌트는 현재 `src/cop/` 트리를 기준으로 명시했고,
> 아직 코드가 없는 항목은 `[TBD-확정대기]`로 표기했다.

---

## 0. 전제 조건

- 심사 정합 결론(comp-fit-gap-analysis)에 따라 이번 피칭은 "기존 COP 셸 위에
  이번 해커톤에서 새로 구현한 실시간성/증거체계/드론 연계"를 명확히 분리해
  설명해야 채점 기준(신규 구현분 증빙)을 충족한다. → §4 구분표 참고.
- 시연은 로컬 Mac(`npm run dev`, Vite)에서 대시보드를 띄우고, 실제 CCTV 소스는
  원격 GPU 서버(`taeyoung4060ti@100.117.133.18`, `gpu-server` 스킬)에서 도는
  CARLA 시뮬레이터가 공급한다. 카메라 소스 우선순위는 실제영상 > CARLA 시뮬 >
  데모영상이며, 현 시연 환경에서는 CARLA가 유일한 라이브 소스다(폰 라이브는
  제거됨).

---

## 1. 사전 기동 체크리스트 (피칭 시작 최소 T-20분 전)

체크리스트는 반드시 순서대로, 각 단계 완료를 육안 확인 후 다음으로 넘어간다.

### 1-1. GPU 서버 / CARLA 기동 (T-20분)

- [ ] `gpu-server` 스킬로 `taeyoung4060ti@100.117.133.18` 접속
- [ ] CARLA 컨테이너 기동 확인/재기동:
  ```bash
  docker ps | grep d4d-carla || \
  docker run -d --name d4d-carla --rm --gpus all --net=host --shm-size=8g \
    -e NVIDIA_VISIBLE_DEVICES=all -e NVIDIA_DRIVER_CAPABILITIES=all \
    carlasim/carla:0.9.16 bash CarlaUE4.sh -RenderOffScreen -nosound
  ```
- [ ] 서버 부팅 로그에 `Waiting for the client to connect` 확인 (약 20~40초 소요)

### 1-2. CARLA 브리지 구동 (T-15분)

> **2026-07-04 실증 확인**: 브리지는 GPU 서버(CARLA와 같은 호스트)에서 실행되므로
> `config.military-perimeter.json`의 `d4d_origin`을 `127.0.0.1:5173`으로 두면
> **반드시 실패한다** — 그 주소는 GPU 서버 자신의 로컬호스트를 가리켜 노트북의
> Vite를 찾지 못해 `Connection refused`로 모든 프레임 업로드가 조용히 실패한다.
> 실제로 이 세션에서 GPU 서버의 브리지가 이 문제로 계속 실패 중인 것을 로그로
> 확인했다(`bridge.new.log`에 `<urlopen error [Errno 111] Connection refused>` 반복).
> 조치: (1) 노트북에서 `npm run dev -- --host 0.0.0.0`으로 Vite를 기동해 LAN/Tailscale
> 인터페이스에 바인딩, (2) `d4d_origin`을 노트북의 Tailscale IP(`tailscale ip -4`로 확인,
> 이번 세션엔 `100.113.177.10`)로 교체, (3) 브리지 재기동. 이후 `httpStatus:200`으로
> 프레임 업로드가 정상 완료됨을 확인(증거: `docs/research/captures/live-stack-2026-07-04/bridge-live.log`).
> 피칭 당일에는 이 IP가 매번 바뀔 수 있으므로 **T-15분 체크리스트에 Tailscale IP
> 확인·config 반영을 필수 항목으로 추가한다.**

- [ ] `gpu-server` 스킬로 GPU 서버 CARLA 컨테이너(`d4d-carla`) 기동/생존 확인
      (`docker ps | grep d4d-carla`)
- [ ] 노트북에서 `tailscale ip -4`로 현재 Tailscale IP 확인
- [ ] `sim/carla-bridge/config.military-perimeter.json`의 `d4d_origin`을 위에서 확인한
      노트북 Tailscale IP:5173으로 교체 (GPU 서버 쪽 브리지 실행 디렉터리의 config도
      동일하게 갱신 — 두 파일이 분리돼 있으므로 반드시 GPU 서버 쪽도 직접 수정할 것)
- [ ] 노트북에서 `npm run dev -- --host 0.0.0.0`으로 Vite를 외부에 노출 (기본 `npm run dev`는
      localhost에만 바인딩되어 GPU 서버에서 접근 불가)
- [ ] 브리지 실행(GPU 서버에서):
  ```bash
  ~/carla-client-venv/bin/python sim/carla-bridge/bridge.py \
    sim/carla-bridge/config.military-perimeter.json
  ```
- [ ] 브리지 로그에서 `frame-upload:end` 이벤트의 `httpStatus`가 `200`인지 확인
      (`Connection refused`가 보이면 위 `d4d_origin` 불일치 문제)
- [ ] WebRTC 시그널링 서버(`webrtc_server.py`, `carlaWebrtcSignaling.ts`)가
      떠 있는지 콘솔 로그에서 `signaling ready` / 연결 카운트 확인 — **2026-07-04
      세션에서는 WebRTC 경로는 별도로 기동/검증하지 않았고, MJPEG(HTTP 프레임 업로드)
      단일 경로만 실증 확인함**
- [ ] scene.py 기반 시나리오 액터(보행자/차량 접근, 드론 트리거)가 스폰됐는지
      CARLA 서버 로그에서 확인

### 1-3. 로컬 대시보드 기동 (T-10분)

- [ ] `npm run dev -- --host 0.0.0.0` 로 Vite 개발 서버 기동(외부 바인딩, §1-2 참고)
- [ ] `curl http://localhost:5173/api/carla-cameras`로 5개 카메라(`CARLA-N-01/E-02/S-03/W-04`
      + `CARLA-DRONE-ISR`)가 모두 `"status":"online"`이고 `lastFrameAt`이 갱신되는지
      확인 — **2026-07-04 세션에 API 레벨로 실증 확인 완료**(증거:
      `docs/research/captures/live-stack-2026-07-04/carla-cameras-registry-snapshot.json`)
- [ ] 브라우저에서 대시보드 접속 → 상단 `CommandBar`의 시스템 상태 필(`Activity`
      아이콘, `HEADER.systemStatus`)이 정상 표기되는지 확인 `[미확정-이번 세션 시각
      캡처 미완료, 아래 §4-확장 참고]`
- [ ] `CarlaCctvWall`에 카메라 타일이 채워지고 `cameraConnectionStatus`가
      `connected`(WebRTC) 또는 최소 `degraded`(MJPEG 폴백)인지 확인. `CarlaCctvWall`은
      레지스트리의 모든 카메라를 제네릭하게 타일 렌더링하므로 `CARLA-DRONE-ISR`도
      코드상 자동으로 포함됨(별도 "드론 전용 뷰" 컴포넌트는 없음, `src/cop/CarlaCctvWall.tsx`
      확인) — 다만 브라우저 시각 확인은 이번 세션에 완료하지 못함
- [ ] `RightRailEvidence` / `RightRailCodex` / `RightRailIncidents` 패널이
      빈 상태가 아닌지(초기 데이터 로드 완료) 확인

### 1-4. 피드 품질 최종 확인 (T-5분)

- [ ] WebRTC 트랙이 실제로 프레임을 그리고 있는지(정지화면 아님) 10초 육안 관찰
- [ ] 오디오/사운드는 사용하지 않으므로 스킵, 대신 프레임 지연(<1초) 체감 확인
- [ ] 백업으로 MJPEG 엔드포인트(`/api/carla-cameras/:id/frame`)도 별도 탭에서
      1회 열어 응답 확인 (폴백 리허설 겸 사전 워밍업)
- [ ] `evidenceWindowBuffer` 기반 증거 클립 재생(`ClipPlayer`)이 최근 버퍼로
      정상 재생되는지 1회 테스트

---

## 2. 3분 각본 — 초 단위 타임라인

발표자 1인 기준, "말"과 "클릭"을 분리 표기. 화면 좌표 대신 컴포넌트/패널명으로
지시해 어떤 빌드에서도 위치를 찾을 수 있게 했다.

| 시간(초) | 스테이지 | 클릭/조작 | 발화 요지 | 강조 화면(wow 포인트) |
|---|---|---|---|---|
| 0:00–0:15 | 오프닝 · 정상 상태 | 대시보드 첫 화면 그대로 유지, 커서로 `CommandBar` 상태 필 가리킴 | "지금 보시는 건 실시간 CARLA 시뮬레이션 CCTV를 라이브로 물고 있는 지휘통제(COP) 대시보드입니다." | `CommandBar`(시스템 상태), `CarlaCctvWall`(다중 타일 정상 스트리밍) |
| 0:15–0:35 | 정상 순찰 컷 | `CarlaCctvWall`에서 카메라 타일 1개 확대(포커스) | "현재 시설 경계는 이상 없음 상태입니다. 각 카메라는 WebRTC로 실시간 영상을 받고 있고, 지연은 1초 이하입니다." | WebRTC 저지연 스트리밍(이번 세션 신규) |
| 0:35–0:55 | 접근 탐지 트리거 | scene.py 시나리오가 자동으로 미상 인물/차량 액터 스폰 → `RealtimeAlertStack`에 신규 알림 팝업 관찰, 클릭해 상세 확장 | "지금 경계 외곽에 미상 개체가 접근합니다. 시스템이 자동으로 탐지 이벤트를 띄웁니다." | `RealtimeAlertStack`, `FacilityMap`에 마커 표시 |
| 0:55–1:15 | 비전 분석 근거 | `RightRailEvidence` 패널로 이동, DETR 탐지 박스/속성(`attributeClassifier`) 클릭해 하이라이트 | "AI 비전 파이프라인이 객체를 분류하고 속성(복장, 이동방향)을 추출합니다. 이 결과가 뒤에서 만드는 보고서의 근거가 됩니다." | DETR 탐지 + 속성 분류(기존 기술, 실데이터 연동은 신규) |
| 1:15–1:35 | 드론 핸드오프 `[일부확정: 카메라 등록 확인, 시각 확인 TBD]` | `CarlaCctvWall`에서 `CARLA-DRONE-ISR` 타일 클릭(전용 드론 뷰/토글 컴포넌트는 아직 없음 — `FacilityMapOverlays.tsx`에만 드론 관련 오버레이 로직 존재) | "지상 카메라 사각지대에 진입하는 순간, 드론이 자동으로 인수해 공중에서 추적을 이어갑니다." | 드론 ISR 뷰. 2026-07-04 확인: 브리지가 `CARLA-DRONE-ISR` 카메라를 실제로 레지스트리에 `online`으로 올리고 프레임이 지속 갱신되는 것을 API로 실증(증거: `docs/research/captures/live-stack-2026-07-04/carla-cameras-registry-snapshot.json`의 스냅샷 시점 `frameCount:133`, `lastFrameAt` 최신; `bridge-live.log`에도 해당 카메라의 `frame-upload:end`/`httpStatus:200` 이벤트 20건 확인), 대시보드 화면 렌더는 이번 세션에 브라우저 자동화 도구의 다중-Chrome-계정 선택 문제로 시각 캡처 미완료 |
| 1:35–2:00 | 비전 분석 스트리밍 근거 로그 `[일부확정: 백엔드 배선 완료, 시각 확인 TBD]` | `ActivityStreamPanel`(`src/cop/ActivityStreamPanel.tsx`, `RightRail.tsx`에 이미 배선됨)로 이동, 로그 라인이 실시간으로 쌓이는 것을 가리킴 | "이건 연출이 아니라 백엔드가 실제로 처리한 로그입니다. 탐지→분류→상관분석까지 각 스테이지가 실시간으로 찍힙니다." | 백엔드 활동 로그 스트림. 2026-07-04 확인: `/api/activity-stream` SSE 엔드포인트가 CARLA 프레임 업로드 이벤트를 실시간으로 흘려보내는 것을 curl로 실증(증거: `docs/research/captures/live-stack-2026-07-04/activity-stream-sample.log`); `ActivityStreamPanel`이 이 스트림을 화면에 렌더하는지는 브라우저 캡처 미완료로 미확인 |
| 2:00–2:20 | 경보 에스컬레이션 `[TBD-확정대기]` | `military-ui-polish` 연출(위협도 상승 시 색상/사이렌 아이콘 강조, 현재 `CommandBar`의 `Siren` 아이콘·`RealtimeAlertStack` 색상 단계가 기반) 트리거 확인 | "상관분석 결과 위협도가 상승하면 UI 전체가 경보 단계로 전환됩니다. 지휘관이 놓칠 수 없게 시각적으로 escalate됩니다." | 경보 에스컬레이션 연출(기존 셸 + 이번 세션 폴리시). **2026-07-04 세션에서 시각 확인 시도 못함** — 브라우저 자동화 도구가 3개의 연결된 Chrome 인스턴스 중 하나를 선택하라고 요구했으나, 이 서브에이전트는 사용자에게 직접 질의할 수 있는 도구가 없어 임의로 브라우저를 선택하지 않고 중단함(도구 안전 규칙상 임의 선택 금지). 다음 세션에서 사용자가 브라우저를 지정하면 이어서 진행 가능 |
| 2:20–2:40 | 수하 절차 | `RightRailResponseReport` 또는 대응 게이트(`buildResponseGates`) 패널 열어 절차 단계 클릭 | "이제 현장 대응 절차(수하·경고·차단)가 체크리스트로 자동 제시됩니다. 대응팀은 이 화면만 보면 됩니다." | 대응 게이트 워크플로(기존 COP 배선) |
| 2:40–3:00 | 보고서 · OSINT citation | `RightRailResponseReport`에서 일일 보고서(`buildDailyReportRows`) 스크롤 → `buildCitations`로 생성된 근거 출처(OSINT/증거클립) 링크 클릭 | "마지막으로, 이 모든 이벤트가 출처가 명시된 보고서로 자동 생성됩니다. 각 항목은 실제 증거 클립과 OSINT 근거로 citation이 달립니다." | OSINT 그래프·citation(이번 세션 신규), 결정적 시나리오 마무리 |

**타이밍 여유 규칙**: 각 구간은 ±3초 버퍼를 갖는다. CARLA 시나리오 트리거가
지연되면(§3 폴백) 0:35 구간에서 최대 10초까지 대기 후 수동 트리거 커맨드로
전환한다.

---

## 3. 실패 시 폴백 절차

| 실패 상황 | 감지 신호 | 즉시 조치 | 발화 커버 멘트 |
|---|---|---|---|
| WebRTC 피드 미연결 | `cameraConnectionStatus`가 `connecting`/`error`로 10초 이상 정체 | `carlaCameraClient`/`useCarlaWebrtcVideo`를 MJPEG 경로(`useCarlaCameraDetection`)로 자동/수동 폴백. 브라우저 새로고침 1회 시도 후에도 안 되면 사전 워밍업해 둔 MJPEG 탭으로 화면 공유 전환 | "네트워크 지연으로 저지연 스트리밍 대신 스냅샷 기반 영상으로 전환합니다. 판정 로직은 동일하게 동작합니다." |
| CARLA GPU 서버 접속 불가/컨테이너 크래시 | `gpu-server` SSH 타임아웃 또는 `docker ps`에 `d4d-carla` 없음 | (a) 재기동 1회 시도(최대 30초) → 실패 시 (b) 로컬에 사전 녹화된 데모 영상 소스로 `CarlaCctvWall`을 데모 모드로 전환(카메라 소스 우선순위 3순위) | "지금은 사전 녹화된 시나리오 영상으로 동일한 탐지·보고 흐름을 보여드리겠습니다. 실시간 파이프라인 자체는 방금 전까지 라이브로 확인하신 그대로입니다." |
| scene.py 자동 트리거 불발(접근 탐지 이벤트 안 뜸) | 0:45 시점까지 `RealtimeAlertStack`에 신규 이벤트 없음 | 브리지 콘솔에서 수동 트리거 커맨드 실행 또는 `demo:reset` 스크립트로 시나리오 재시작 후 해당 타임슬롯을 15초 늦춰 이어감 | "잠시 시나리오를 재정렬하겠습니다" 없이 자연스럽게 다음 문장으로 전환(침묵 최소화) |
| 드론 ISR / 백엔드 로그 패널 / 경보 폴리시 미탑재(빌드 시점) | 해당 컴포넌트가 아직 머지되지 않음 | 해당 구간을 스킵하고 §2의 인접 구간(비전 분석 근거 ↔ 수하 절차)을 매끄럽게 연결하는 대체 멘트 사용: "AI가 판단한 결과가 바로 대응 절차로 이어집니다" | 위 대체 멘트로 시간 공백 없이 진행 |
| 전체 대시보드 응답 없음(브라우저/Vite 크래시) | 화면 멈춤, 콘솔 에러 다수 | 사전 촬영한 3분 시나리오 스크린 레코딩(백업 mp4)을 즉시 재생 | "라이브 대신 방금 전 세션 녹화본으로 동일한 흐름을 보여드리겠습니다" |

**공통 원칙**: 어떤 폴백이든 "정상 상태처럼 이어 말하기"를 우선한다. 기술적
문제를 언급하는 시간은 한 문장(≤3초)을 넘기지 않는다.

---

## 4. 해커톤 신규 구현분 vs 기존 기술 구분표

심사 정합(comp-fit-gap-analysis) 요구에 따라 "이번 세션에 새로 만든 것"과
"기존에 있던 COP/DETR/Codex 배선"을 명확히 분리한다.

| 항목 | 분류 | 근거(파일/커밋) | 비고 |
|---|---|---|---|
| WebRTC 시그널링/스트리밍 완결 | **신규** | `server/carlaWebrtcSignaling.ts`, `server/carlaWebrtcSignaling.test.ts`, `sim/carla-bridge/webrtc_core.py`, `sim/carla-bridge/webrtc_server.py`, `sim/carla-bridge/test_webrtc_core.py`, `src/cop/useCarlaWebrtcVideo.ts` | 이전엔 MJPEG 프레임 폴링만 존재; 저지연 실시간 시그널링 계층을 이번 세션에 신규 구축 |
| 백엔드 활동 로그 스트림(비전 분석 스테이지 노출) | **신규** `[백엔드 확정, 시각확인 TBD]` | `server/activityStream.ts`, `src/cop/ActivityStreamPanel.tsx`, `src/cop/useActivityStream.ts`, `src/activityEvents.ts` (모두 `RightRail.tsx`에 배선 완료) | 2026-07-04: `/api/activity-stream` SSE로 CARLA 프레임 이벤트가 실시간으로 나오는 것을 curl로 실증(`docs/research/captures/live-stack-2026-07-04/activity-stream-sample.log`). 브라우저에서 `ActivityStreamPanel`이 이를 화면에 렌더하는지는 이번 세션 브라우저 자동화 도구의 다중-Chrome 선택 문제로 미확인 — 다음 세션에서 캡처 필요 |
| 드론 ISR 핸드오프 | **신규** `[카메라 등록 확정, 전용 UI/시각확인 TBD]` | `sim/carla-bridge/config.military-perimeter.json`의 `CARLA-DRONE-ISR` 카메라·액터, `server/carlaCameraRegistry.ts`, `src/cop/FacilityMapOverlays.tsx`(드론 오버레이 로직) | 2026-07-04: 브리지가 `CARLA-DRONE-ISR`을 레지스트리에 `online`으로 등록하고 프레임을 지속 갱신하는 것을 `/api/carla-cameras` 응답으로 실증(`carla-cameras-registry-snapshot.json`). `CarlaCctvWall`은 카메라를 제네릭 타일로 렌더하므로 코드상 드론 타일도 포함되지만, "지상→드론 핸드오프" 전용 연출/토글 컴포넌트는 아직 없고 브라우저 시각 확인도 미완료 |
| 맵 연출(지형/날씨/오버레이 고도화) | **신규** | `src/cop/FacilityMapTerrain.tsx`, `FacilityMapWeather.tsx`, `FacilityMapDefs.tsx`, `FacilityMapOverlays.tsx`, `FacilityMapScene.tsx`, `useWeather.ts`, `osmFeatures.ts`+`osmSnapshot.json` | Palantir/ArcGIS COP 컨셉 재현 셸 위에 지형·기상·OSM 실데이터 연출을 신규 추가 |
| 지표 타일(운영 메트릭) | **신규** | `src/cop/operationalMetricTiles`(export 경로), `operationalTelemetry.ts`의 `buildCodexMetrics` | 실시간 운용 지표를 COP 셸에 신규 통합 |
| OSINT 그래프·citation | **신규** | `operationalTelemetry.ts`의 `buildCitations`, `RightRailResponseReport.tsx`, `RightRailEvidence.tsx` | 증거 클립·외부 근거를 보고서 항목에 citation으로 연결하는 로직 신규 |
| 결정적 시나리오(demo-scenario-script) | **신규** | `sim/carla-bridge/scene.py`, `scene_config.py`, `config.military-perimeter.json` | 접근탐지→핸드오프→경보→수하 흐름을 스크립트로 결정론화 |
| 경보 에스컬레이션 연출(military-ui-polish) | **신규** `[부분 확정대기]` | `src/styles/cop.12.css`, `cop.13.css`(진행 중 변경), `RealtimeAlertStack.tsx` | 색상/단계 폴리시 최종본은 별도 작업 완료 후 반영 |
| COP 대시보드 셸(레이아웃/좌우 레일/커맨드바) | **기존** | `src/cop/CopDashboard.tsx`, `CommandBar.tsx`, `LeftRail.tsx`, `RightRail.tsx` | Palantir/ArcGIS 컨셉 재현 UI로 이미 이전 세션에 교체 완료(체크포인트 UI/harness 폐기) |
| DETR 비전 탐지 | **기존** | `src/cop/detrVisionDetector.ts`, `detrVisionDetector.test.ts`, `attributeClassifier.ts` | 모델/파이프라인 자체는 기존 배선, 이번 세션엔 CARLA 실데이터 연동 강화만 추가 |
| Codex 에이전트 연동(자동 요청/시간창 요약) | **기존** | `src/cop/codexAgentClient.ts`, `server/viteCodexAgentPlugin.ts`, 최근 커밋(`0faf5c1`, `5c76382`, `10a1bb3`, `127279d`, `464d5dc`) | Codex 자동 호출·시간창 활동 요약 배선은 최근 세션 누적 기능으로 기존 자산 취급(이번 3분 피칭 스코프 밖) |
| CARLA CCTV 브리지 기본 골격(카메라 등록/프레임 서빙) | **기존** | `sim/carla-bridge/bridge.py`, `bridge_core.py`, `src/cop/CarlaCctvWall.tsx`, `carlaCameraClient.ts` | MJPEG 프레임 서빙 골격은 기존; 이번 세션은 그 위에 WebRTC 계층을 신규로 얹음 |
| 대응 게이트 워크플로(수하 절차) | **기존** | `operationalTelemetry.ts`의 `buildResponseGates` | 기존 로직, 이번 피칭에서는 재사용만 |

---

## 5. 실행 전 마지막 확인(요약 카드)

1. GPU 서버 CARLA 컨테이너 살아있음
2. 브리지 + WebRTC 시그널링 로그에 에러 없음
3. `npm run dev` 대시보드에서 카메라 타일 실시간 갱신
4. MJPEG 폴백 탭 미리 열어둠(백업)
5. 사전 녹화 백업 mp4 로컬에 준비됨(최종 폴백)
6. §4 구분표를 발표 노트/슬라이드에 1장으로 요약해 심사위원 질의 대비

---

## 6. 2026-07-04 실증 세션 로그(게이트 3 재검증)

이 세션에서 실제로 기동해 확인한 것과 확인하지 못한 것을 정직하게 기록한다.

**확인됨(서버/API/로그 레벨)**:
- GPU 서버(`taeyoung4060ti@100.117.133.18`) CARLA 컨테이너(`d4d-carla`)가 이미 34시간+
  가동 중이었고 정상 반응함.
- 브리지(`sim/carla-bridge/bridge.py`)를 GPU 서버에서 실행 중이던 기존 프로세스가
  `d4d_origin=127.0.0.1:5173` 설정 오류로 프레임 업로드에 계속 실패하고 있던 것을
  발견(`Connection refused` 반복) → 노트북 Tailscale IP(`100.113.177.10`)로 config를
  고치고 `npm run dev -- --host 0.0.0.0`으로 Vite를 재기동한 뒤 브리지를 재시작하니
  `httpStatus:200`으로 정상 업로드되는 것을 확인.
- `/api/carla-cameras` 응답으로 5개 카메라(`CARLA-N-01/E-02/S-03/W-04/DRONE-ISR`) 모두
  `status:"online"`, `frameCount` 지속 증가 확인.
- `/api/activity-stream` SSE 엔드포인트가 CARLA 프레임 업로드 단계별 이벤트를
  실시간으로 스트리밍하는 것을 curl로 확인.

**확인하지 못함(브라우저 시각 레벨)**:
- claude-in-chrome 브라우저 자동화 도구가 "3개의 연결된 Chrome 브라우저 중 하나를
  선택하라"는 확인을 요구했고, 이 작업을 수행한 서브에이전트는 사용자에게 직접
  질의하는 도구(AskUserQuestion)를 갖고 있지 않아 도구가 명시한 안전 규칙("임의로
  브라우저를 선택하지 말 것")에 따라 진행을 중단함.
- 따라서 (a) 드론 ISR 공중 피드의 CCTV 월/COP 맵 렌더 여부, (b) 탐지→활동 스트림
  로그→경보 에스컬레이션 pulse→Codex 'Fusion Intel Copilot' 응답까지 이어지는 UI
  체인의 순차 동작 여부는 **이번 세션에 시각적으로 검증하지 못했다**. 코드 배선
  (`ActivityStreamPanel`이 `RightRail.tsx`에 마운트됨, `CarlaCctvWall`이 레지스트리
  카메라를 제네릭 렌더함)은 존재가 확인됐으나, 실제 브라우저에서 그리는지, 애니메이션이
  발동하는지, Codex 응답이 오는지는 미확인.

**다음 세션 재개 방법**: 사용자가 대화창에서 사용할 Chrome 브라우저(3개 중 하나,
deviceId는 `c5692ae7-...`, `2b35bc20-...`, `52d10c24-...`)를 지정하면 바로
`select_browser`로 연결해 §2 시나리오 브라우저 캡처를 이어서 진행할 수 있다.

**증거 파일**(모두 `docs/research/captures/live-stack-2026-07-04/`):
- `bridge-live.log` — 수정 후 브리지 재기동 로그, `frame-upload:end`에 `httpStatus:200`
  확인 가능
- `vite-dev-server.log` — `--host 0.0.0.0`으로 기동된 로컬 Vite 콘솔 로그
- `carla-cameras-registry-snapshot.json` — `/api/carla-cameras` 응답 스냅샷(5개
  카메라 online 상태, base64 최신 프레임 포함)
- `activity-stream-sample.log` — `/api/activity-stream` SSE 3초 샘플(CARLA 프레임
  업로드 단계 이벤트 확인)
