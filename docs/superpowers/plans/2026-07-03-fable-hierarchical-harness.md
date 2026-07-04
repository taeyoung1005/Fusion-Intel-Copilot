# Fable 5 계층형 하네스 (fable-harness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code의 Workflow 도구로 CEO(Fable 5) → 팀장(Opus 4.8) → 팀원(Sonnet 5 / Haiku 4.5 / Codex-GPT5.5) 계층형 멀티모델 오케스트레이션 하네스를 만들고, `/fable-harness` 슬래시커맨드로 전역에서 재사용 가능하게 한다.

**Architecture:** `~/.claude/workflows/fable-harness.js` 하나의 Workflow 스크립트에 5단계(phase)를 순차 파이프라인으로 구현한다: CEO 설계 → 팀장 세분화 → 팀원 실행(라우팅: 코드=Sonnet이 `codex exec` 호출, 조사=Sonnet/Haiku) → 팀장 1차 리뷰(최대 1회 재작업) → CEO 최종검수(최대 1회 팀장 재지시). `~/.claude/skills/fable-harness/SKILL.md`가 사용자 자연어를 `args.task`로 넘겨 이 스크립트를 호출한다.

**Tech Stack:** Claude Code `Workflow` 도구(plain JS, TypeScript 문법 금지), `agent()`/`pipeline()`/`phase()`/`log()` 훅, `schema` 옵션으로 구조화 출력 강제, Bash 툴을 통한 `codex exec`(GPT-5.5) 셸 호출.

## Global Constraints

- 모델 ID는 정확히 다음 문자열을 사용한다: `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`.
- Fable5/Opus 호출은 모두 `effort: 'xhigh'`. Sonnet은 `effort: 'medium'`. Haiku는 `effort: 'low'`.
- 재작업/재지시는 각 단계에서 **최대 1회**로 고정한다(팀장 리뷰의 워커 재작업 1회, CEO 최종검수의 팀장 재지시 1회) — 무한 루프·비용 폭주 방지.
- 코드 작성/수정이 필요한 work item(`isCodeTask: true`)은 예외 없이 Sonnet이 `codex exec`(GPT-5.5, `model_reasoning_effort=xhigh`)을 호출해서 처리한다. Sonnet도 Haiku도 코드를 직접 작성하지 않는다.
- 저장 위치는 전역이다: `~/.claude/workflows/fable-harness.js`, `~/.claude/skills/fable-harness/SKILL.md`. `~/.claude`는 git 저장소가 아니므로 이 두 파일에 대해서는 git commit을 하지 않는다(D4D 저장소의 design/plan 문서만 git으로 관리).
- Workflow 스크립트 본문에서 `Date.now()`/`Math.random()`/인자 없는 `new Date()`는 사용 금지.
- `parallel()`/`pipeline()`이 반환하는 `null`은 항상 `.filter(Boolean)` 후 사용한다.
- 상한(재작업/재지시) 도달로 미해결 상태로 끝나는 경우, `log()`로 그 사실을 명시하고 조용히 누락시키지 않는다.

## 테스트 방식에 대한 메모

이 하네스는 LLM 서브에이전트를 오케스트레이션하는 스크립트라 전통적 유닛테스트(pytest 등)가 적용되지 않는다. 각 태스크의 "테스트"는 **`Workflow` 도구로 실제 스크립트를 호출해서** 반환값/저장된 `journal.jsonl`이 기대한 스키마 모양을 갖는지 확인하는 방식이다. 초기 태스크들은 스크립트 맨 끝에 **임시 `return`문**을 둬서 아직 만들지 않은 뒷단계 없이도 지금까지 만든 단계만 검증할 수 있게 하고, 다음 태스크에서 그 임시 return을 실제 다음 단계 코드로 교체한다.

---

### Task 1: 스크립트 골격 + CEO 설계 단계

**Files:**
- Create: `/Users/parktaeyeong/.claude/workflows/fable-harness.js`

**Interfaces:**
- Produces: `CEO_SCHEMA` — `{ subtasks: [{ id: string, goal: string, complexity: 'simple'|'complex', notes: string }] }`. 이후 모든 태스크가 이 스키마 모양의 `ceoPlan` 객체를 소비한다.

- [x] **Step 1: 스크립트 파일 작성**

```js
export const meta = {
  name: 'fable-harness',
  description: 'Fable 5 CEO가 설계·최종검수하고 Opus 팀장이 조율, Sonnet/Haiku/Codex(GPT-5.5)가 실행하는 계층형 멀티모델 하네스',
  phases: [
    { title: 'CEO 설계', detail: 'Fable 5가 요청을 하위 목표로 분해', model: 'claude-fable-5' },
    { title: '팀장 세분화', detail: 'Opus가 실행 단위로 재분해하고 담당자 배정', model: 'claude-opus-4-8' },
    { title: '팀원 실행', detail: 'Sonnet/Haiku 실행, 코드 작업은 Sonnet이 codex exec 호출' },
    { title: '팀장 1차 리뷰', detail: 'Opus가 결과 검토, 미달 항목 1회 재작업', model: 'claude-opus-4-8' },
    { title: 'CEO 최종검수', detail: 'Fable 5가 최종 승인/반려 판단, 반려시 팀장에게 1회 재지시', model: 'claude-fable-5' },
  ],
}

const CEO_SCHEMA = {
  type: 'object',
  properties: {
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          goal: { type: 'string' },
          complexity: { type: 'string', enum: ['simple', 'complex'] },
          notes: { type: 'string' },
        },
        required: ['id', 'goal', 'complexity'],
      },
    },
  },
  required: ['subtasks'],
}

function ceoDesignPrompt(task) {
  return `당신은 이 하네스의 CEO다. 사용자 요청을 실행 가능한 하위 목표(subtask) 목록으로 분해하라.
각 subtask는 id(짧은 kebab-case), goal(한두 문장), complexity('simple' 또는 'complex'), notes(라우팅에 참고할 추가 맥락)를 가진다.

사용자 요청:
"""
${task}
"""

저장소를 살펴봐야 한다면 Read/Grep/Bash 도구를 사용해 직접 탐색하라. 과도하게 잘게 쪼개지 말고, 서로 독립적으로 실행 가능한 단위로만 나눠라.`
}

phase('CEO 설계')
const ceoPlan = await agent(ceoDesignPrompt(args.task), {
  model: 'claude-fable-5',
  effort: 'xhigh',
  schema: CEO_SCHEMA,
  phase: 'CEO 설계',
})

return ceoPlan
```

- [x] **Step 2: 디렉토리 존재 확인 후 실행 검증**

Run:
```bash
mkdir -p ~/.claude/workflows
ls ~/.claude/workflows/fable-harness.js
```
Expected: 파일 경로가 그대로 출력됨(파일 존재 확인).

- [x] **Step 3: 실제 호출로 CEO 설계 단계 검증**

`Workflow` 도구를 다음과 같이 호출한다:
```
Workflow({
  scriptPath: "/Users/parktaeyeong/.claude/workflows/fable-harness.js",
  args: { task: "이 저장소가 어떤 프로젝트인지 한 문단으로 요약해줘" }
})
```
완료 알림이 오면, 반환값(or `journal.jsonl`)에서 `subtasks` 배열이 존재하고 각 원소가 `id`(string), `goal`(string), `complexity`(`'simple'` 또는 `'complex'`)를 가지는지 확인한다.

Expected: 스키마 검증 실패 없이(재시도 없이) 성공적으로 `subtasks` 배열이 반환됨.

커밋은 하지 않는다(Global Constraints 참고 — `~/.claude`는 git 저장소가 아님).

---

### Task 2: 팀장 세분화 단계 추가

**Files:**
- Modify: `/Users/parktaeyeong/.claude/workflows/fable-harness.js`

**Interfaces:**
- Consumes: Task 1의 `ceoPlan` (`CEO_SCHEMA` 모양).
- Produces: `MANAGER_SCHEMA` — `{ workItems: [{ id, subtaskId, owner: 'sonnet'|'haiku', isCodeTask: boolean, instruction, outputFormat }] }`. 이후 모든 태스크가 `workItems` 배열의 이 필드명들을 그대로 사용한다.

- [x] **Step 1: `CEO_SCHEMA` 정의 바로 뒤에 `MANAGER_SCHEMA`와 `managerPrompt` 추가**

`const CEO_SCHEMA = { ... }` 블록과 `function ceoDesignPrompt` 사이에 아래를 삽입:

```js
const MANAGER_SCHEMA = {
  type: 'object',
  properties: {
    workItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          subtaskId: { type: 'string' },
          owner: { type: 'string', enum: ['sonnet', 'haiku'] },
          isCodeTask: { type: 'boolean' },
          instruction: { type: 'string' },
          outputFormat: { type: 'string' },
        },
        required: ['id', 'subtaskId', 'owner', 'isCodeTask', 'instruction', 'outputFormat'],
      },
    },
  },
  required: ['workItems'],
}
```

- [x] **Step 2: `managerPrompt` 함수 추가**

`ceoDesignPrompt` 함수 뒤에 추가:

```js
function managerPrompt(ceoPlan, priorFeedback) {
  let p = `당신은 이 하네스의 팀장이다. CEO가 내려준 하위 목표를 실제로 실행 가능한 work item으로 재분해하고 담당자를 배정하라.

CEO의 하위 목표 목록:
${JSON.stringify(ceoPlan.subtasks, null, 2)}

각 work item은 id(짧은 kebab-case, subtask id와 겹치지 않게), subtaskId(어느 subtask에 속하는지), owner('sonnet' 또는 'haiku'), isCodeTask(코드 작성/수정이 필요하면 true), instruction(담당자에게 줄 구체적 지시문 — 담당자는 이 문장만 보고 작업한다), outputFormat(기대하는 산출물 형태)을 가진다.

라우팅 규칙(반드시 지켜라):
- 코드 작성/수정이 필요한 작업은 isCodeTask: true로 표시하라. isCodeTask: true인 항목은 owner 값과 무관하게 실제로는 Codex(GPT-5.5)가 코드를 작성하고 Sonnet은 결과 검증만 한다.
- 순수 조사/파일탐색/요약처럼 실수해도 리스크가 낮은 단순 작업만 owner: 'haiku'로 배정하라.
- 판단이 섞인 조사나 여러 결과의 통합이 필요한 작업은 owner: 'sonnet'으로 배정하라.`
  if (priorFeedback) {
    p += `\n\nCEO의 최종검수 반려 피드백(이를 반영해 work item을 다시 설계하라):\n"""\n${priorFeedback}\n"""`
  }
  return p
}
```

- [x] **Step 3: 임시 `return ceoPlan`을 팀장 세분화 호출 + 임시 return으로 교체**

`return ceoPlan`을 찾아 아래로 교체:

```js
phase('팀장 세분화')
const managerPlan = await agent(managerPrompt(ceoPlan, null), {
  model: 'claude-opus-4-8',
  effort: 'xhigh',
  schema: MANAGER_SCHEMA,
  phase: '팀장 세분화',
})

return { ceoPlan, managerPlan }
```

- [ ] **Step 4: 실제 호출로 검증**

코드 작업이 섞이도록 테스트 요청을 구성한다:
```
Workflow({
  scriptPath: "/Users/parktaeyeong/.claude/workflows/fable-harness.js",
  args: { task: "README.md에 어떤 내용이 있는지 조사하고, scratch.txt라는 파일을 만들어서 'hello'라고 한 줄 써줘" }
})
```
완료 후 `managerPlan.workItems`가 최소 2개 이상이고, 그 중 파일 생성 항목이 `isCodeTask: true`, `owner`는 `'sonnet'` 또는 `'haiku'` 값만 가지는지 확인한다.

Expected: 스키마 검증 통과, `isCodeTask: true`인 항목이 최소 1개 존재.

---

### Task 3: 팀원 실행 단계 추가 (Codex 연동 포함)

**Files:**
- Modify: `/Users/parktaeyeong/.claude/workflows/fable-harness.js`

**Interfaces:**
- Consumes: Task 2의 `managerPlan.workItems`.
- Produces: `WORK_RESULT_SCHEMA` — `{ id, summary, details }`. 이후 태스크가 `workResults` 배열(각 원소 이 모양)을 소비한다. `routeWorkItem(item): Promise<{id,summary,details}>` 함수를 이후 태스크에서 그대로 재사용한다.

- [x] **Step 1: `MANAGER_SCHEMA` 뒤에 `WORK_RESULT_SCHEMA` 추가**

```js
const WORK_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    summary: { type: 'string' },
    details: { type: 'string' },
  },
  required: ['id', 'summary', 'details'],
}
```

- [x] **Step 2: `managerPrompt` 뒤에 `workerPrompt`, `codexWrapperPrompt`, `routeWorkItem` 추가**

```js
function workerPrompt(item) {
  return `다음 작업을 수행하고 결과를 보고하라.
지시: ${item.instruction}
기대 산출물 형태: ${item.outputFormat}
응답은 id="${item.id}", summary(한두 문장 요약), details(상세 결과)로 구성하라.`
}

function codexWrapperPrompt(item) {
  return `아래 코드 작업을 codex CLI(GPT-5.5)에게 위임해서 실행하라. 너는 코드를 직접 작성하지 않는다 — codex의 결과를 실행하고 해석·검증만 한다.

작업 지시: ${item.instruction}
기대 산출물 형태: ${item.outputFormat}

Bash 툴로 아래와 같은 형태의 명령을 실행하라(작업 대상 디렉토리가 지시문에 명시되어 있다면 -C <디렉토리> 옵션을 추가하라):
codex exec -m gpt-5.5 -c model_reasoning_effort=xhigh --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --output-last-message /tmp/fable-harness-codex-${item.id}.txt "<위 작업 지시를 그대로 codex 프롬프트로 전달>"

실행 후 /tmp/fable-harness-codex-${item.id}.txt 내용과 (git 저장소라면) git diff를 확인해서, id="${item.id}", summary(codex가 무엇을 했는지 한두 문장), details(변경 내용 상세 또는 실패 시 에러 내용)로 응답하라. codex 실행이 실패하면 details에 에러를 그대로 남기고 summary에 "실패"라고 명시하라.`
}

async function routeWorkItem(item) {
  if (item.isCodeTask) {
    return agent(codexWrapperPrompt(item), {
      model: 'claude-sonnet-5',
      effort: 'medium',
      phase: '팀원 실행',
      schema: WORK_RESULT_SCHEMA,
      label: `codex:${item.id}`,
    })
  }
  if (item.owner === 'haiku') {
    return agent(workerPrompt(item), {
      model: 'claude-haiku-4-5-20251001',
      effort: 'low',
      phase: '팀원 실행',
      schema: WORK_RESULT_SCHEMA,
      label: `haiku:${item.id}`,
    })
  }
  return agent(workerPrompt(item), {
    model: 'claude-sonnet-5',
    effort: 'medium',
    phase: '팀원 실행',
    schema: WORK_RESULT_SCHEMA,
    label: `sonnet:${item.id}`,
  })
}
```

- [x] **Step 3: 임시 return을 팀원 실행 단계 + 임시 return으로 교체**

`return { ceoPlan, managerPlan }`을 찾아 아래로 교체:

```js
phase('팀원 실행')
const workResults = await pipeline(managerPlan.workItems, item => routeWorkItem(item))

return { ceoPlan, managerPlan, workResults }
```

- [ ] **Step 4: 스크래치 git 저장소에서 Codex 경로 실제 검증**

Run:
```bash
SCRATCH=$(mktemp -d)
git -C "$SCRATCH" init -q
echo "scratch repo for fable-harness codex test" > "$SCRATCH/README.md"
git -C "$SCRATCH" add -A && git -C "$SCRATCH" -c user.email=test@test -c user.name=test commit -q -m init
echo "$SCRATCH"
```
Expected: 임시 디렉토리 경로가 출력됨. 이 경로를 아래 호출에 사용한다.

```
Workflow({
  scriptPath: "/Users/parktaeyeong/.claude/workflows/fable-harness.js",
  args: { task: "다음 디렉토리에서 작업하라: <위에서 출력된 $SCRATCH 경로>. 이 디렉토리에 hello.txt라는 파일을 만들고 내용으로 'hello from fable harness'라고 써줘." }
})
```
완료 후:
```bash
cat "$SCRATCH/hello.txt"
```
Expected: `hello from fable harness`가 출력됨(Codex가 실제로 파일을 생성했다는 증거). 또한 `workResults` 중 `isCodeTask: true`였던 항목의 `summary`/`details`에 codex 실행 결과가 반영되어 있는지 확인한다.

---

### Task 4: 팀장 1차 리뷰 단계 추가 + `runTeamCycle` 헬퍼로 리팩터

**Files:**
- Modify: `/Users/parktaeyeong/.claude/workflows/fable-harness.js`

**Interfaces:**
- Consumes: Task 3의 `routeWorkItem`, `managerPrompt`.
- Produces: `REVIEW_SCHEMA` — `{ approved: boolean, reworkItemIds: string[], escalate: [{itemId, reason}] }`. `runTeamCycle(ceoPlan, priorManagerFeedback): Promise<{workItems, workResults, review}>` — 이후 태스크(CEO 최종검수)가 이 함수와 반환 모양을 그대로 소비한다.

- [x] **Step 1: `WORK_RESULT_SCHEMA` 뒤에 `REVIEW_SCHEMA` 추가**

```js
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    reworkItemIds: { type: 'array', items: { type: 'string' } },
    escalate: {
      type: 'array',
      items: {
        type: 'object',
        properties: { itemId: { type: 'string' }, reason: { type: 'string' } },
        required: ['itemId', 'reason'],
      },
    },
  },
  required: ['approved', 'reworkItemIds', 'escalate'],
}
```

- [x] **Step 2: `routeWorkItem` 함수 뒤에 `reviewPrompt`와 `runTeamCycle` 추가**

```js
function reviewPrompt(workItems, workResults) {
  return `당신은 팀장이다. 아래 work item 지시와 그 실행 결과를 대조 검토하라.

Work items:
${JSON.stringify(workItems, null, 2)}

실행 결과:
${JSON.stringify(workResults.filter(Boolean), null, 2)}

approved(전체 통과 여부), reworkItemIds(재작업이 필요한 work item id 배열 — 결과가 지시를 충족 못했을 때만), escalate(팀장 선에서 판단 불가능해 CEO에게 넘겨야 할 항목: itemId와 reason)로 응답하라. 사소한 흠은 재작업시키지 말고 승인하라 — 재작업은 비용이 크다.`
}

async function runTeamCycle(ceoPlan, priorManagerFeedback) {
  phase('팀장 세분화')
  const managerPlan = await agent(managerPrompt(ceoPlan, priorManagerFeedback), {
    model: 'claude-opus-4-8',
    effort: 'xhigh',
    schema: MANAGER_SCHEMA,
    phase: '팀장 세분화',
  })
  const workItems = managerPlan.workItems

  phase('팀원 실행')
  let workResults = await pipeline(workItems, item => routeWorkItem(item))

  phase('팀장 1차 리뷰')
  let review = await agent(reviewPrompt(workItems, workResults), {
    model: 'claude-opus-4-8',
    effort: 'xhigh',
    schema: REVIEW_SCHEMA,
    phase: '팀장 1차 리뷰',
  })

  if (!review.approved && review.reworkItemIds.length > 0) {
    log(`재작업 ${review.reworkItemIds.length}건: ${review.reworkItemIds.join(', ')}`)
    const reworkIndices = workItems
      .map((item, idx) => (review.reworkItemIds.includes(item.id) ? idx : -1))
      .filter(idx => idx !== -1)
    const reworkItems = reworkIndices.map(idx => workItems[idx])
    const reworked = await pipeline(reworkItems, item => routeWorkItem(item))
    reworkIndices.forEach((idx, i) => {
      workResults[idx] = reworked[i]
    })
    phase('팀장 1차 리뷰')
    review = await agent(reviewPrompt(workItems, workResults), {
      model: 'claude-opus-4-8',
      effort: 'xhigh',
      schema: REVIEW_SCHEMA,
      phase: '팀장 1차 리뷰',
    })
    if (!review.approved) {
      log('팀장 리뷰 재작업 상한(1회) 도달 — 미해결 상태로 CEO 최종검수에 전달')
    }
  }

  return { workItems, workResults, review }
}
```

- [x] **Step 3: CEO 설계 이후 코드를 `runTeamCycle` 호출 + 임시 return으로 교체**

`phase('팀장 세분화')`부터 `return { ceoPlan, managerPlan, workResults }`까지의 블록 전체(CEO 설계 `agent()` 호출 다음 줄부터)를 아래로 교체:

```js
const cycle = await runTeamCycle(ceoPlan, null)

return { ceoPlan, cycle }
```

(주의: `phase('CEO 설계')`와 CEO `agent()` 호출 부분은 그대로 남긴다 — 삭제하는 건 그 아래 팀장 세분화~팀원 실행 인라인 코드뿐이다.)

- [x] **Step 4: 실제 호출로 검증**

```
Workflow({
  scriptPath: "/Users/parktaeyeong/.claude/workflows/fable-harness.js",
  args: { task: "이 저장소가 어떤 프로젝트인지 한 문단으로 요약해줘" }
})
```
완료 후 `cycle.review`가 `approved`(boolean), `reworkItemIds`(array), `escalate`(array) 필드를 모두 가지는지 확인한다.

Expected: 스키마 검증 통과. (재작업이 실제로 트리거되는지는 LLM 판단에 달려 있어 매번 보장되진 않는다 — 이 스텝에서는 정상 승인 경로가 에러 없이 끝나는 것만 확인한다.)

---

### Task 5: CEO 최종검수 단계 추가 (스크립트 완성)

**Files:**
- Modify: `/Users/parktaeyeong/.claude/workflows/fable-harness.js`

**Interfaces:**
- Consumes: Task 4의 `runTeamCycle`, `cycle.review.escalate`, `ceoPlan`.
- Produces: 스크립트 최종 반환값 — `{ approved, feedback, subtasks, workItems, workResults, escalated }`. `/fable-harness` 스킬(Task 6)이 이 모양을 소비해 사용자에게 보고한다.

- [x] **Step 1: `REVIEW_SCHEMA` 뒤에 `CEO_FINAL_SCHEMA` 추가**

```js
const CEO_FINAL_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    feedback: { type: 'string' },
  },
  required: ['approved', 'feedback'],
}
```

- [x] **Step 2: `reviewPrompt` 뒤, `runTeamCycle` 앞에 `ceoFinalPrompt` 추가**

```js
function ceoFinalPrompt(originalTask, ceoPlan, workResults, escalate) {
  return `당신은 CEO다. 원래 사용자 요청과 팀 전체의 최종 산출물을 대조해서 승인 여부를 판단하라.

원래 사용자 요청:
"""
${originalTask}
"""

CEO 자신이 세운 하위 목표:
${JSON.stringify(ceoPlan.subtasks, null, 2)}

팀 실행 결과:
${JSON.stringify(workResults.filter(Boolean), null, 2)}

팀장이 판단을 넘긴 에스컬레이션 항목:
${JSON.stringify(escalate, null, 2)}

approved(원래 요청을 충족했으면 true), feedback(반려라면 팀장이 재작업에 쓸 구체적 피드백, 승인이면 최종 요약)으로 응답하라.`
}
```

- [x] **Step 3: 임시 return을 CEO 최종검수 + 최종 return으로 교체**

`const cycle = await runTeamCycle(ceoPlan, null)`와 `return { ceoPlan, cycle }`을 찾아 아래 전체로 교체:

```js
let cycle = await runTeamCycle(ceoPlan, null)

phase('CEO 최종검수')
let ceoFinal = await agent(
  ceoFinalPrompt(args.task, ceoPlan, cycle.workResults, cycle.review.escalate),
  { model: 'claude-fable-5', effort: 'xhigh', schema: CEO_FINAL_SCHEMA, phase: 'CEO 최종검수' }
)

if (!ceoFinal.approved) {
  log(`CEO 반려 — 팀장에게 1회 재지시: ${ceoFinal.feedback}`)
  cycle = await runTeamCycle(ceoPlan, ceoFinal.feedback)
  phase('CEO 최종검수')
  ceoFinal = await agent(
    ceoFinalPrompt(args.task, ceoPlan, cycle.workResults, cycle.review.escalate),
    { model: 'claude-fable-5', effort: 'xhigh', schema: CEO_FINAL_SCHEMA, phase: 'CEO 최종검수' }
  )
  if (!ceoFinal.approved) {
    log('CEO 최종검수 재지시 상한(1회) 도달 — 미해결 상태로 종료, 결과를 그대로 보고')
  }
}

return {
  approved: ceoFinal.approved,
  feedback: ceoFinal.feedback,
  subtasks: ceoPlan.subtasks,
  workItems: cycle.workItems,
  workResults: cycle.workResults,
  escalated: cycle.review.escalate,
}
```

- [x] **Step 4: 전체 end-to-end 실제 호출로 검증**

```
Workflow({
  scriptPath: "/Users/parktaeyeong/.claude/workflows/fable-harness.js",
  args: { task: "이 저장소가 어떤 프로젝트인지 한 문단으로 요약해줘" }
})
```
완료 후 최종 반환값이 `approved`(boolean), `feedback`(string), `subtasks`(array), `workItems`(array), `workResults`(array), `escalated`(array)를 모두 갖는지 확인한다.

Expected: 5단계(CEO 설계 → 팀장 세분화 → 팀원 실행 → 팀장 1차 리뷰 → CEO 최종검수) 전체가 에러 없이 끝나고, 위 필드가 모두 채워진 객체가 반환됨.

---

### Task 6: `/fable-harness` 스킬 작성

**Files:**
- Create: `/Users/parktaeyeong/.claude/skills/fable-harness/SKILL.md`

**Interfaces:**
- Consumes: Task 5에서 완성한 `/Users/parktaeyeong/.claude/workflows/fable-harness.js`의 최종 반환 모양.

- [x] **Step 1: 스킬 디렉토리 생성**

Run: `mkdir -p ~/.claude/skills/fable-harness`
Expected: 에러 없이 종료.

- [x] **Step 2: SKILL.md 작성**

```markdown
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

사용자가 자연어로 설명한 작업을 `~/.claude/workflows/fable-harness.js` Workflow
스크립트로 넘겨서, CEO(Fable 5) → 팀장(Opus 4.8) → 팀원(Sonnet 5 / Haiku 4.5 /
Codex GPT-5.5) 계층 구조로 처리한다.

설계 문서: D4D 저장소의
`docs/superpowers/specs/2026-07-03-fable-hierarchical-harness-design.md`.

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
```

- [x] **Step 3: frontmatter YAML 유효성 확인**

Run:
```bash
python3 -c "
import yaml
with open('/Users/parktaeyeong/.claude/skills/fable-harness/SKILL.md') as f:
    content = f.read()
front = content.split('---')[1]
data = yaml.safe_load(front)
assert data['name'] == 'fable-harness'
assert 'Workflow' in data['allowed-tools']
print('OK')
"
```
Expected: `OK` 출력.

---

### Task 7: 전체 통합 검증 (`/fable-harness` 슬래시커맨드까지)

**Files:** 없음(검증 전용 태스크)

- [ ] **Step 1: 세션 재시작으로 새 스킬 로드**

새 스킬 파일은 현재 세션에 이미 로드된 스킬 목록에는 반영되지 않을 수 있다. 사용자에게 Claude Code를 재시작(또는 새 세션 시작)해서 `/fable-harness` 슬래시커맨드가 목록에 나타나는지 확인해달라고 요청한다.

Expected: 재시작 후 `/fable-harness`가 사용 가능한 스킬로 인식됨.

- [x] **Step 2: 슬래시커맨드로 비-코드 작업 실행**

Run(대화창에 입력): `/fable-harness 이 저장소가 어떤 프로젝트인지 한 문단으로 요약해줘`

Expected: 스킬이 `Workflow`를 `scriptPath`로 호출하고, 완료 후 `approved`/`feedback`/`workResults` 요약이 사용자에게 보고됨.

- [ ] **Step 3: 슬래시커맨드로 코드 작업 실행 (Codex 경로 재확인)**

Run(대화창에 입력, 절대경로는 `mktemp -d`로 만든 스크래치 디렉토리로 교체):
```
/fable-harness 다음 디렉토리에서 작업하라: <스크래치 디렉토리 절대경로>. 여기에 greet.py라는 파일을 만들어서 실행하면 "hi"를 출력하도록 작성해줘
```

완료 후:
```bash
python3 <스크래치 디렉토리>/greet.py
```
Expected: `hi` 출력 — Codex(GPT-5.5)가 실제로 코드를 작성했다는 증거. `workResults` 중 해당 항목의 `details`에 codex 실행 결과가 언급되어 있는지 확인한다.
