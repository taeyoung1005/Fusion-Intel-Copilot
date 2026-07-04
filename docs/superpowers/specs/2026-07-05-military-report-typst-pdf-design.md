# 군용 일일 상황보고 PDF — Typst 서버 렌더링

## Context

현재 `src/cop/reportArtifact.ts`의 `buildReportPdfFile`은 외부 라이브러리 없이 PDF 원시 문법(오브젝트/xref)을 직접 문자열로 조립한다. 이 방식은 기본 내장 폰트(`/BaseFont /Helvetica`, PDF base-14)만 쓰는데 이 폰트는 한글을 지원하지 않는다 — 그래서 지금 `buildPdfContentStream`은 애초에 한글을 넣지 않고 영어 메타데이터 9줄(제목, Report ID, 생성 시각 등)만 PDF에 담는다. 화면에 보이는 "일일 보고 미리보기" 카드는 한글 라벨과 사건 내용을 정상적으로 보여주지만, 실제로 내보낸 PDF에는 그 내용이 반영되지 못한다.

사용자는 이 PDF가 백화점 시설관리용 결재 양식이 아니라 **군용 일일 상황보고** 스타일(결재란 표 + 격자형 표 레이아웃)로 만들어지길 원한다 — 이 프로젝트가 이미 군사 경계시설(탄약고, 철조망, 차단선 등) 시뮬레이션이므로 자연스러운 방향이다.

렌더링 엔진은 **Typst**로 정했다: 유니코드/한글을 네이티브로 지원하고, 마크업으로 표·결재란을 짜기 좋다. 실행 위치는 **서버(vite 플러그인)에서 `typst` CLI를 child_process로 호출**하는 방식으로 정했다 — 기존 `server/viteCodexAgentPlugin.ts`와 같은 패턴이며, WASM 번들링(+한글 폰트 자산 포함)이 필요 없어 구현이 가장 단순하다.

**사전 요구사항**: 로컬에 `typst` CLI 설치가 필요하다 (`brew install typst`). 이 저장소를 확인한 시점(2026-07-05) 기준 개발 머신에 아직 설치되어 있지 않다.

## 1. 보고서 구조 (군용 일일 상황보고 스타일)

문서 최상단에 결재란: **작성 / 상황실장 / 경계대대장 / 지휘관** 4단 표, 각 칸에 서명·날짜 슬래시(`/`) 칸을 둔다 (참고 이미지의 "담당/부서장/임원/사장" 표와 같은 형태, 라벨만 군용으로 교체).

문서 상단 메타: 분류기호(REPORT ID), 시행일자(date), 제목("경계구역 일일 상황보고").

본문은 이미 `buildCommanderReportArtifact`(순수 함수, 변경 없음)가 만드는 `CommanderReportArtifact` 데이터를 그대로 표로 배치한다:

1. **경계 근무 현황** — `perCameraFindings`: 카메라 / 탐지건수 / 최고신뢰도 / 최종탐지시각 / 탐지유형
2. **탐지 및 조치 내역** — `timeline`: 시각 / 카메라 / 유형(tone) / 내용 / 신뢰도
3. **증거 인용** — `citations`: 인용ID / 라벨 / 시각
4. **사람 확인 게이트 결과** — `responseActions`: 게이트명 / 상태(PASS/PENDING)
5. **특이사항 및 관장 조치** — `summary` + `unresolved`(누락 맥락) 목록
6. 하단: `generatedAtIso`, `exportReceiptId`

## 2. 아키텍처

### `server/reportTypstTemplate.ts` (신규, 순수 함수)

`(artifact: CommanderReportArtifact) => string` — artifact를 위 구조의 `.typ` 문자열로 변환한다. 순수 함수라 유닛 테스트 가능. 한글은 macOS 시스템 폰트를 지정한다: `#set text(font: "Apple SD Gothic Neo")` — 별도 폰트 파일 번들링이 필요 없다(대신 macOS 전제, 알려진 제약에 기술).

### `server/reportTypstPlugin.ts` (신규, vite 플러그인)

`viteCodexAgentPlugin.ts`와 같은 패턴.

- `POST /api/report-pdf` — body: `CommanderReportArtifact` (클라이언트가 이미 `buildCommanderReportArtifact`로 만든 것을 그대로 전송)
- `buildReportTypstSource(artifact)`로 `.typ` 문자열 생성
- `child_process.execFile("typst", ["compile", "-", "-"], ...)`로 stdin에 `.typ` 소스를 넣고 stdout으로 PDF bytes를 받는다 (임시 파일 없이 스트림 처리)
- `typst` 미설치(ENOENT) → 502 + `"typst CLI가 설치되어 있지 않습니다. 'brew install typst' 후 다시 시도하세요."`
- 컴파일 에러(잘못된 `.typ` 문법) → 502 + stderr 원문 (디버깅 가능하게)

### 클라이언트 변경

- `useReportArtifactActions.ts`의 `createPdfPreview`가 비동기 함수로 바뀐다: `fetch("/api/report-pdf", { method: "POST", body: JSON.stringify(artifact) })` → `arrayBuffer()` → `Blob(type: "application/pdf")` → `URL.createObjectURL`.
- `ReportActionState`에 로딩/에러 상태 추가 필요: 기존 `"idle" | "exported" | "pdf"`에 `"pdf-loading"`(요청 중 스피너 텍스트) / `"pdf-error"`(에러 메시지) 추가.
- `exportReport`(JSON 내보내기)는 변경 없음 — 클라이언트에서 즉시 처리.
- 기존 `reportArtifact.ts`의 `buildReportPdfFile` / `buildPdfContentStream` / `escapePdfText`(원시 PDF 조립 코드, 약 90줄)는 전부 삭제한다.

## 3. 에러 처리

- 네트워크 실패, `typst` 미설치, 컴파일 에러 세 가지 모두 한국어 에러 메시지로 노출한다 (`cop-report-receipt` 영역 재사용 또는 별도 에러 문구).
- "PDF 미리보기 생성" 클릭 → 로딩 상태 표시 → 완료 시 iframe 미리보기로 전환. 실패 시 에러 메시지를 남기고 재시도 가능해야 한다.

## 4. 알려진 제약

- 이 기능은 서버 플러그인이 있어야 동작하므로 **`npm run dev` / `vite preview`에서만 동작**한다. `npm run build`로 나온 완전 정적 배포본에는 서버가 없어 `/api/report-pdf` 자체가 존재하지 않는다 — 로컬 데모 용도로 계속 쓴다는 전제로 진행한다(정적 배포가 필요해지면 WASM 방식(`@myriaddreamin/typst.ts`)으로 재검토).
- `typst` CLI가 로컬에 설치되어 있어야 한다(`brew install typst`) — 이 저장소를 다루는 모든 개발자 PC에 동일하게 필요.
- 폰트는 macOS 시스템 폰트(Apple SD Gothic Neo)를 하드코딩 지정한다 — 다른 OS에서 실행 시 폰트 대체가 필요하다.

## 5. 테스트 계획

- `server/reportTypstTemplate.test.ts`: 순수 함수 유닛 테스트. artifact 픽스처를 넣고 생성된 `.typ` 문자열에 필요한 필드(카메라명, 신뢰도, 게이트 상태, 결재란 라벨)가 포함되는지 확인한다. 실제 `typst` 컴파일까지는 돌리지 않는다(CLI 의존이라 CI 환경 이슈 소지 — 문자열 생성만 유닛 테스트).
- `server/reportTypstPlugin.test.ts`: 기존 `codexAgent.test.ts` 패턴처럼 플러그인 핸들러를 직접 호출해 정상/에러 케이스(잘못된 JSON, `typst` 없음 mock)를 검증한다.
- e2e(`tests/e2e/cop.spec.ts`): PDF 미리보기 버튼 클릭 후 iframe이 나타나는지 확인한다. `typst` 미설치 환경에서는 스킵되거나 에러 메시지 경로를 확인하도록 조건부 처리한다.

## 6. 검증 방법

1. `brew install typst` 후 `npm run dev`로 실행, 대시보드에서 "PDF 미리보기" 클릭 → 결재란 표 + 본문 표가 포함된 PDF가 iframe에 뜨는지 확인.
2. `npm run typecheck && npm run lint && npm run test` 통과.
3. `typst`가 없는 상태에서 버튼 클릭 시 에러 메시지가 사용자에게 명확히 뜨는지 확인.
