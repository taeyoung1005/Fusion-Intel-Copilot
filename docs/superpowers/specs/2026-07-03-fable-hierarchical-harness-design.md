# Fable 5 계층형 하네스 (fable-harness) 설계

## 배경 / 목적

Fable 5는 판단력이 뛰어나지만 호출 비용이 크다. 반대로 Opus 4.8 / Sonnet 5 / Haiku 4.5, 그리고 Codex CLI를 통한 GPT-5.5는 상대적으로 저렴하다. `fable-harness`는 "설계·최종판단은 Fable 5가, 조사와 코드 작성 같은 실행 작업은 더 싼 모델들이 담당"하는 계층형(CEO → 팀장 → 팀원) 멀티모델 오케스트레이션을 Claude Code의 Workflow 도구로 구현한다.

### 참고한 외부 사례

- **Anthropic 자체 멀티에이전트 리서치 시스템** (Opus=리드, Sonnet=워커, 독립 컨텍스트로 병렬 위임 — 단일 Opus 대비 90.2% 성능 향상): orchestrator-worker 분리, 워커 컨텍스트 격리, 위임 시 목표/출력형식/경계를 명확히 해야 서브에이전트 난발을 막는다는 교훈을 채택.
- **LangGraph Supervisor 패턴**: 슈퍼바이저는 라우팅/분해만, 실행은 워커. 다단 계층(슈퍼바이저의 슈퍼바이저) 구조를 CEO→팀장 2단 위임에 참고.
- **CrewAI hierarchical process**: 매니저만 delegation 권한을 가지며, 매니저 품질이 전체 성패를 좌우한다는 실패 사례 보고 → 팀장(Opus)/CEO(Fable5) 모두 reasoning effort를 xhigh로 강하게 설정한 이유.
- **FrugalGPT/RouteLLM 모델 캐스케이드**와의 차이: 캐스케이드는 "싼 모델 먼저, 실패시 비싼 모델로 escalate"하는 반대 방향 패턴이다. 이 하네스는 그 반대(판단은 항상 상위, 실행은 항상 하위)이므로 캐스케이드가 아니라 orchestrator-worker 구조를 채택.
- **Mixture-of-Agents**: 여러 하위 결과를 상위 모델이 취합(aggregate)하는 방식을 팀장 리뷰/CEO 최종검수 단계에 참고.

## 아키텍처

```
CEO (Fable 5, xhigh)
  └─ 팀장 (Opus 4.8, xhigh)              — 세분화 · 라우팅 · 1차 리뷰 · 에스컬레이션 판단
       ├─ 팀원 (Sonnet 5, medium)         — 일반 조사 / 코드 작업 시 Codex 래퍼 역할
       │     └─ (코드 작업 한정) codex exec 셸 호출 → GPT-5.5, reasoning=xhigh
       └─ 알바 (Haiku 4.5, low)           — 단순 반복 조사 · 파일 검색 · 요약
```

**라우팅 규칙(고정)**: 코드 작성이 필요한 work item은 예외 없이 Sonnet(팀원)이 `codex exec`를 호출해 GPT-5.5에게 작성시키고 결과를 검증만 한다 — Sonnet도 Haiku도 코드를 직접 작성하지 않는다. 순수 조사/요약/파일탐색은 Haiku가, 판단이 섞인 조사·통합은 Sonnet이 맡는다.

## 실행 흐름 (Workflow: 5 phase, pipeline 기반)

1. **CEO 설계** (`agent(model: claude-fable-5, effort: xhigh)`)
   사용자의 자연어 요청(`args.task`)을 받아 하위 목표로 분해. 출력 스키마:
   `{ subtasks: [{ id, goal, complexity: 'simple'|'complex', notes }] }`

2. **팀장 세분화** (`agent(model: claude-opus-4-8, effort: xhigh)`)
   CEO의 subtask들을 실행 가능한 work item으로 재분해하고 담당 티어를 배정. 출력 스키마:
   `{ workItems: [{ id, subtaskId, owner: 'sonnet'|'haiku', isCodeTask: boolean, instruction, outputFormat }] }`

3. **팀원 실행** (`pipeline(workItems, ...)`, phase별 병렬)
   - `owner: 'haiku'` → Haiku agent 직접 실행
   - `owner: 'sonnet'`, `isCodeTask: false` → Sonnet agent 직접 실행
   - `isCodeTask: true` → Sonnet agent가 Bash 툴로 아래 명령을 실행하고 결과(stdout/`--output-last-message` 파일/`git diff`)를 해석해 요약:
     ```
     codex exec -m gpt-5.5 -c model_reasoning_effort=xhigh \
       --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check \
       --output-last-message <tmpfile> "<work item instruction>"
     ```
     Sonnet은 codex 결과를 직접 재작성하지 않고 검증·요약만 한다.

4. **팀장 1차 리뷰** (`agent(model: claude-opus-4-8, effort: xhigh)`)
   모든 work item 결과를 모아 검토. 출력 스키마:
   `{ approved: boolean, reworkItemIds: [id], escalate: [{ itemId, reason }] }`
   - `reworkItemIds`에 있는 항목은 **최대 1회**만 3단계(팀원 실행)로 재순환.
   - `escalate` 항목은 재순환하지 않고 그대로 CEO 최종검수 컨텍스트에 포함.

5. **CEO 최종검수** (`agent(model: claude-fable-5, effort: xhigh)`)
   원 요청 대비 전체 결과와 escalate 항목을 검토. 출력 스키마:
   `{ approved: boolean, feedback: string }`
   - `approved: false`면 팀장에게 **최대 1회** 재지시(2단계로 복귀) 후 그 결과를 그대로 종료.
   - 재작업 상한 도달 시 미해결 항목을 숨기지 않고 최종 보고에 명시(`log()`로 노출, silent truncation 금지).

## Codex 연동 세부

- 워크플로우 스크립트 본문은 Node/Bash에 직접 접근할 수 없으므로, `codex exec` 호출은 Bash 툴을 가진 Sonnet 서브에이전트를 통해서만 이루어진다.
- `~/.codex/config.toml`에 이미 `approval_policy=never`, `sandbox_mode=danger-full-access`가 있지만, 워크플로우 실행 환경에 의존하지 않도록 `--dangerously-bypass-approvals-and-sandbox`와 `-c model_reasoning_effort=xhigh`를 명령에 명시적으로 박아 넣는다.
- codex 실행 실패(에러/타임아웃)는 Sonnet이 그대로 팀장 리뷰 단계로 올리고, 팀장이 재시도 여부(codex 재호출 vs 포기)를 판단한다.

## 스킬 / 트리거

- 저장 위치(전역, 모든 프로젝트에서 재사용):
  - `~/.claude/workflows/fable-harness.js` — Workflow 스크립트 본체
  - `~/.claude/skills/fable-harness/SKILL.md` — `/fable-harness <작업 설명>` 슬래시커맨드
- 스킬은 사전 컨텍스트 수집 없이 사용자의 자연어를 `Workflow({ name: 'fable-harness', args: { task } })` 호출로 그대로 전달한다. 저장소 탐색은 CEO(Fable5) 단계의 에이전트가 표준 툴(Bash/Read/Grep)로 직접 수행한다.
- Workflow는 백그라운드 실행이므로, 스킬은 실행 시작을 사용자에게 알리고 완료 알림이 오면 CEO 최종검수 결과(승인 여부·feedback)를 요약해 보고하도록 지시한다.
- v1 범위에는 `--dry-run`, 작업 디렉토리 오버라이드 등 부가 옵션을 넣지 않는다(YAGNI).

## 에러 처리 · 비용 바운드

- 재작업 루프는 각 단계(팀원 실행, 팀장 세분화)에서 **최대 1회**로 고정 — Fable5/Opus 반복 호출로 비용이 무한정 늘어나는 것을 방지.
- `parallel()`/`pipeline()`이 반환하는 `null`(에이전트 스킵/터미널 에러)은 `.filter(Boolean)` 후 팀장 리뷰 단계에서 "미완료 항목"으로 명시적으로 취급한다.
- 상한 도달로 미해결 상태로 끝나는 항목은 절대 조용히 누락시키지 않고 최종 보고서에 남긴다.

## 모델/이펙트 매핑 표

| 단계 | 모델 | effort |
|---|---|---|
| CEO 설계 | claude-fable-5 | xhigh |
| 팀장 세분화 | claude-opus-4-8 | xhigh |
| 팀원 실행(조사/코드 검증) | claude-sonnet-5 | medium |
| 알바(단순조사) | claude-haiku-4-5 | low |
| Codex 실제 코드 작성 | gpt-5.5 (codex exec) | xhigh |
| 팀장 1차 리뷰 | claude-opus-4-8 | xhigh |
| CEO 최종검수 | claude-fable-5 | xhigh |

## 범위 밖 (v1에서 하지 않음)

- 동적 계층 깊이 조절(작업 복잡도에 따라 2단/3단을 매 실행마다 다르게 구성)은 넣지 않는다 — 고정 3단 구조.
- 프로젝트 전용 커스터마이징(D4D 특화 프롬프트)은 넣지 않는다 — 범용 하네스.
- Codex 재시도 자동화(워크플로우가 자체적으로 codex를 반복 재호출)는 넣지 않는다 — 팀장의 1회 재지시 루프 안에서만 재시도된다.
