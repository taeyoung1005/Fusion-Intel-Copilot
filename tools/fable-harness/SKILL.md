---
name: fable-harness
description: |
  페이블 파이브(Fable 5)를 최상위 CEO로 두고 Opus 4.8(팀장), Sonnet 5/Haiku 4.5
  (팀원/알바), Codex CLI의 GPT-5.5(코드 전담)로 작업을 위임하는 계층형 멀티모델
  하네스. 비용이 큰 Fable5는 설계·최종검수만 하고, 조사·코드 작성 같은 실행
  작업은 더 저렴한 모델들이 담당한다. 사용자가 "/fable-harness"를 입력하거나
  "페이블 하네스로 처리해줘", "계층형 멀티모델로 시켜줘"처럼 명시적으로
  요청할 때 사용한다.
allowed-tools:
  - Workflow
---

# Fable 5 계층형 하네스

사용자가 자연어로 설명한 작업을 `fable-harness` Workflow 스크립트로 넘겨서,
CEO(Fable 5) → 팀장(Opus 4.8) → 팀원(Sonnet 5 / Haiku 4.5 / Codex GPT-5.5)
계층 구조로 처리한다.

설계 문서: D4D 저장소의 `docs/superpowers/specs/2026-07-03-fable-hierarchical-harness-design.md`.
스크립트 원본: D4D 저장소의 `tools/fable-harness/workflow.js`
(`~/.claude/workflows/fable-harness.js`는 이 파일의 심링크).

## 사용법

사용자 메시지에서 하고 싶은 작업 설명을 그대로 추출해 아래처럼 호출한다:

```
Workflow({
  scriptPath: "/Users/parktaeyeong/.claude/workflows/fable-harness.js",
  args: { task: "<사용자가 설명한 작업 전문>" }
})
```

- 사전에 컨텍스트를 긁어모으지 않는다 — CEO(Fable 5) 단계가 Bash/Read/Grep으로
  직접 저장소를 탐색한다.
- `Workflow`는 백그라운드로 실행된다. 호출 직후 사용자에게 "페이블 하네스 실행
  중"이라고 알리고, 완료 알림이 오면 반환된 결과(`approved`, `feedback`,
  `workResults`)를 요약해서 보고한다.
- `approved: false`로 끝났다면 재작업 상한(팀장 리뷰 1회, CEO 재지시 1회)에
  도달한 채 종료된 것이다. 미해결 항목을 숨기지 말고 `workResults`와
  `escalated` 내용을 그대로 사용자에게 보고한다.
