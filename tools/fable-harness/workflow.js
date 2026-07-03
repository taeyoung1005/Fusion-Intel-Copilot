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

const WORK_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    summary: { type: 'string' },
    details: { type: 'string' },
  },
  required: ['id', 'summary', 'details'],
}

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

const CEO_FINAL_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    feedback: { type: 'string' },
  },
  required: ['approved', 'feedback'],
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

const task = typeof args === 'string' ? JSON.parse(args).task : args.task

phase('CEO 설계')
const ceoPlan = await agent(ceoDesignPrompt(task), {
  model: 'claude-fable-5',
  effort: 'xhigh',
  schema: CEO_SCHEMA,
  phase: 'CEO 설계',
})

let cycle = await runTeamCycle(ceoPlan, null)

phase('CEO 최종검수')
let ceoFinal = await agent(
  ceoFinalPrompt(task, ceoPlan, cycle.workResults, cycle.review.escalate),
  { model: 'claude-fable-5', effort: 'xhigh', schema: CEO_FINAL_SCHEMA, phase: 'CEO 최종검수' }
)

if (!ceoFinal.approved) {
  log(`CEO 반려 — 팀장에게 1회 재지시: ${ceoFinal.feedback}`)
  cycle = await runTeamCycle(ceoPlan, ceoFinal.feedback)
  phase('CEO 최종검수')
  ceoFinal = await agent(
    ceoFinalPrompt(task, ceoPlan, cycle.workResults, cycle.review.escalate),
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
