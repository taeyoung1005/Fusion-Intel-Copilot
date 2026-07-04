# SnapDeck PPT Brief - Fusion Intel Copilot

기준일: 2026-07-05

## Deck Direction

발표 제목:
Fusion Intel Copilot - 실시간 경계 상황 인식 COP

한 줄 요약:
CARLA 시뮬레이션 CCTV, DETR 객체 탐지, 실시간 알림, 증거 타임라인, Codex 기반 상황 판단 보조를 하나의 지휘통제 대시보드로 묶은 AI 상황 인식 copilot입니다.

핵심 메시지:
이 프로젝트는 "영상을 보는 화면"이 아니라, 다중 센서 이벤트를 증거화하고 사람이 검토할 수 있는 대응 절차와 보고서로 연결하는 운영형 COP입니다.

발표 톤:
어두운 지휘통제실, 고밀도 운영 화면, 증거 중심, 인간 검토 우선. 마케팅 느낌보다 실제 운용 툴처럼 보여야 합니다.

사용할 신규 생성 이미지:

- `docs/snapdeck-assets/snapdeck-hero-cop-command-center.png`
- `docs/snapdeck-assets/snapdeck-architecture-data-flow.png`
- `docs/snapdeck-assets/snapdeck-scenario-timeline.png`
- `docs/snapdeck-assets/snapdeck-ai-evidence-packet.png`

같이 쓰기 좋은 기존 화면 캡처:

- `docs/research/captures/d4d-fusion-implemented-desktop-v9.png`
- `docs/research/captures/d4d-implemented-cop-desktop.png`
- `docs/research/captures/facility-map-3d-mode-2026-07-05/facility-map-3d-desktop.png`
- `docs/research/captures/live-stack-2026-07-04/detr-overlay-desktop-1440.png`
- `docs/research/captures/live-stack-2026-07-04/realtime-alert-modal-center.png`

---

## Slide 1 - Title

제목:
Fusion Intel Copilot

부제:
실시간 CCTV, AI 탐지, 증거 기반 대응을 하나로 묶은 경계 상황 인식 COP

핵심 문장:
다중 카메라에서 들어오는 신호를 탐지, 상관분석, 대응 게이트, 보고서까지 연결합니다.

시각 자료:
`docs/snapdeck-assets/snapdeck-hero-cop-command-center.png`

발표 노트:
처음부터 대시보드형 시스템임을 강조합니다. 이 프로젝트는 군사 작전 자동화가 아니라 합성 CCTV와 시뮬레이션 이벤트를 활용한 인간 검토형 상황 인식 데모입니다.

---

## Slide 2 - Problem

제목:
경계 감시의 병목은 "탐지 이후"에 생깁니다

본문:

- 여러 CCTV와 센서 이벤트가 동시에 들어오면 운영자는 어떤 신호가 중요한지 빠르게 판단하기 어렵습니다.
- 단일 탐지 결과만으로는 사건의 시간, 위치, 근거, 누락 정보를 설명하기 부족합니다.
- 대응 판단에는 사람이 검토할 수 있는 증거 패킷, 출처, 절차 게이트가 필요합니다.

발표 노트:
단순 객체 탐지보다 "운영자가 행동할 수 있는 구조"가 핵심 문제라고 설명합니다.

---

## Slide 3 - Solution

제목:
Fusion Intel Copilot은 탐지 신호를 운영 가능한 증거 흐름으로 바꿉니다

본문:

- CARLA 기반 합성 CCTV 피드를 대시보드로 수집합니다.
- DETR 객체 탐지와 속성 분류로 이벤트 후보를 만듭니다.
- 실시간 알림, 시설 지도, 이벤트 타임라인으로 맥락을 제공합니다.
- Codex agent와 보고서 패널이 판단 보조, 권고 조치, citation을 생성합니다.
- 최종 대응은 Response Gate를 통해 사람 검토를 거칩니다.

시각 자료:
`docs/snapdeck-assets/snapdeck-architecture-data-flow.png`

---

## Slide 4 - What We Implemented

제목:
현재 구현된 주요 기능

본문:

- React/Vite 기반 COP 대시보드: `CopDashboard`, `CommandBar`, `LeftRail`, `RightRail`
- 시설 지도: 2D/3D 지도, CCTV 노드, 커버리지 콘, 이벤트 마커, 기상/지형 레이어
- CCTV 월: CARLA 카메라 레지스트리 기반 다중 카메라 타일
- DETR 탐지: 서버 `/detect` 계약과 클라이언트 정규화, fallback 탐지 흐름
- 실시간 알림: 중복 탐지 병합, auto-close, 상관관계 알림
- 증거 타임라인: evidence clip, selected incident, citation 연결
- Codex 판단 보조: `/api/codex-agent` 요청, 캐시, timeout, 응답 스키마 검증
- 활동 스트림: `/api/activity-stream` SSE 기반 backend event log
- 보고서/운영 지표: daily report rows, connected nodes, confidence, coverage uptime

시각 자료:
기존 화면 캡처 `docs/research/captures/d4d-fusion-implemented-desktop-v9.png`

---

## Slide 5 - System Flow

제목:
데이터 흐름

본문:

1. CARLA 시뮬레이션 카메라가 CCTV 프레임을 생성합니다.
2. 카메라 브리지가 `/api/carla-cameras/:id/frame`로 최신 프레임을 제공합니다.
3. DETR inference service가 프레임에서 객체와 bounding box를 추출합니다.
4. 대시보드가 탐지 결과를 evidence clip과 realtime alert로 변환합니다.
5. telemetry layer가 사건, 마커, 타임라인, citation, response gate를 계산합니다.
6. Codex agent가 선택된 사건의 요약, 권고 조치, 확인 지점을 생성합니다.

시각 자료:
`docs/snapdeck-assets/snapdeck-architecture-data-flow.png`

발표 노트:
"영상 → 탐지 → 증거 → 판단 보조 → 보고"의 파이프라인으로 설명하면 됩니다.

---

## Slide 6 - Live Demo Scenario

제목:
3분 데모 시나리오

본문:

- 0:00 정상 감시: 다중 CCTV와 시설 지도가 정상 상태를 표시합니다.
- 0:35 접근 탐지: 미상 객체가 등장하고 realtime alert가 열립니다.
- 0:55 증거 확인: DETR box, confidence, camera id가 evidence clip으로 남습니다.
- 1:35 활동 스트림: backend가 처리한 단계별 이벤트가 SSE로 쌓입니다.
- 2:20 대응 게이트: 운영자가 수하/검토/보고 절차를 확인합니다.
- 2:40 보고서: 사건 요약과 citation이 포함된 report packet을 보여줍니다.

시각 자료:
`docs/snapdeck-assets/snapdeck-scenario-timeline.png`

---

## Slide 7 - Evidence First UX

제목:
판단보다 먼저 증거를 보여주는 UI

본문:

- 오른쪽 패널은 incident, evidence, Codex 판단, relation graph, response report를 한 흐름으로 보여줍니다.
- 낮은 신뢰도와 판단 불충분 상태는 숨기지 않고 누락 맥락으로 노출합니다.
- citation은 evidence clip과 camera/time 정보를 근거로 묶습니다.
- response gate는 자동 결정을 막고 사람 검토를 요구합니다.

시각 자료:
`docs/snapdeck-assets/snapdeck-ai-evidence-packet.png`

---

## Slide 8 - Safety Boundary

제목:
자동 대응이 아니라 인간 검토형 판단 보조

본문:

- 현재 데이터는 합성 CCTV와 CARLA 시뮬레이션 기반입니다.
- 시스템은 신원 식별, 생체 매칭, 타격 결정, 자율 무력 사용을 하지 않습니다.
- AI는 탐지와 요약을 보조하고, 대응 결정은 운영자가 Response Gate에서 확인합니다.
- 불충분한 증거는 "판단 불충분"으로 표시하고 자동 결론을 내리지 않습니다.

발표 노트:
심사위원 질문에 대비해 안전 경계를 명확히 말합니다. "AI가 결정을 내린다"가 아니라 "사람이 결정을 내릴 수 있게 근거를 정리한다"입니다.

---

## Slide 9 - Current Status

제목:
현재 검증 상태

본문:

- 구현 완료: COP UI, 지도/레이어, CCTV wall, realtime alert, evidence timeline, Codex agent client/server adapter, report/metric panels.
- API/로그 레벨 검증: 2026-07-04 기준 `/api/carla-cameras`에서 5개 CARLA 카메라 online 확인, `/api/activity-stream` SSE 샘플 확인.
- DETR 시각 검증 자료: `live-stack-2026-07-04/detr-overlay-desktop-1440.png` 등 캡처 존재.
- 주의점: Foundry/OSDK는 현재 live integration이 아니라 로컬 ontology와 향후 매핑 문서입니다.

시각 자료:
기존 화면 캡처와 검증 로그 스크린샷을 조합합니다.

---

## Slide 10 - Close

제목:
운영자가 바로 행동할 수 있는 AI 경계 감시 워크플로

본문:

- Fusion Intel Copilot은 탐지 결과를 UI 알림으로 끝내지 않고, 사건 맥락과 증거 패킷으로 정리합니다.
- CARLA 시뮬레이션을 통해 live-like CCTV 환경을 재현합니다.
- Codex agent는 사건 요약과 권고 조치를 제공하되, 최종 대응은 사람 검토 절차에 남깁니다.
- 다음 단계는 실제 데모 환경 안정화, 드론 ISR 전용 연출, Foundry-style ontology integration 고도화입니다.

마지막 문장:
"Fusion Intel Copilot은 AI를 현장 판단의 대체물이 아니라, 증거를 정리하고 대응 절차를 놓치지 않게 하는 운영 보조 계층으로 설계했습니다."

---

## One-Page Project Summary

Fusion Intel Copilot은 합성 경계 감시 상황을 위한 AI 기반 COP 대시보드입니다. CARLA 시뮬레이션에서 발생하는 다중 CCTV 프레임을 브리지로 수집하고, DETR 객체 탐지를 통해 사람/차량 등 이벤트 후보를 생성합니다. 프론트엔드는 React/Vite 기반의 고밀도 지휘통제 UI로 구성되어 있으며, 좌측에는 카메라와 지도 레이어, 중앙에는 시설 지도와 이벤트 타임라인, 우측에는 사건 증거·Codex 판단·대응 보고 패널을 배치합니다.

현재 구현의 강점은 탐지 결과를 단일 알림으로 끝내지 않고, evidence clip, citation, incident, response gate, report row까지 이어지는 운영 흐름으로 만든 점입니다. `useDashboardTelemetry`와 `operationalTelemetry` 계층은 들어온 evidence clip을 사건, 지도 마커, 타임라인, 지표, missing context, relationship graph로 변환합니다. `RealtimeAlertStack`은 탐지를 알림으로 만들고 중복 이벤트를 병합합니다. `codexAgentClient`와 서버 adapter는 선택된 사건을 Codex 판단 보조 요청으로 바꿔 요약과 권고 조치를 받습니다.

시연에서는 "정상 감시 → 접근 탐지 → 증거 확인 → 활동 스트림 → 대응 게이트 → 보고서" 흐름을 3분 안에 보여주는 것이 가장 설득력 있습니다. 단, 현재 Foundry/OSDK는 실제 연결이 아니라 로컬 온톨로지와 향후 매핑 문서로 표현된 상태이므로 발표에서는 live integration으로 말하지 않는 편이 정확합니다.

## Image Generation Prompts Used

1. Hero command center:
Dark synthetic perimeter operations command center, multiple monitors showing a dense COP map, CCTV tiles, evidence timeline, restrained amber and red alert rails, one operator silhouette, cinematic but practical, no readable text, no logos, no real insignia, no weapons, no targeting reticles.

2. Architecture data flow:
Abstract isometric system architecture for synthetic CCTV analytics: simulation cameras, streaming bridge, web dashboard, AI detection service, activity event stream, evidence packet and report output, connected by clean luminous lines, dark teal operational palette, no text.

3. Scenario timeline:
Wide storyboard of an evidence-to-decision workflow: perimeter camera, detected object bounding box, alert popup shape, facility map marker, operator response gate, final report packet, arranged left to right as a clean slide visual, no text.

4. AI evidence packet:
High-fidelity product mockup style visual of an evidence packet workspace: CCTV still thumbnails, bounding boxes, timeline strip, citation cards, confidence bars, response checklist, dark professional command UI, no readable text.
