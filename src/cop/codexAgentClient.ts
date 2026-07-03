import { z } from "zod"
import type { Citation, Incident, MissingContext } from "./copData"

const CodexAgentResponseSchema = z.object({
  codexMode: z.union([
    z.literal("configured-codex-endpoint"),
    z.literal("codex-cli"),
    z.literal("local-codex-adapter"),
  ]),
  decision: z.object({
    title: z.string(),
    summary: z.string(),
    recommendedAction: z.string(),
    checkpoint: z.string(),
  }),
  citations: z.array(z.string()).readonly(),
  adapterNotice: z.string(),
})

export type CodexAgentDecision = Readonly<z.infer<typeof CodexAgentResponseSchema>>

export type CodexAgentContext = {
  readonly incident: Incident
  readonly citations: readonly Citation[]
  readonly missingContext: readonly MissingContext[]
  readonly responseOutcome: string
  readonly recentActivitySummary?: string
}

export class CodexAgentClientError extends Error {
  readonly statusCode: number | null

  constructor(message: string, statusCode: number | null) {
    super(message)
    this.name = "CodexAgentClientError"
    this.statusCode = statusCode
  }
}

const checkpointForIncident = (
  incident: Incident,
): { readonly id: string; readonly label: string } => {
  switch (incident.tone) {
    case "WATCH":
      return { id: "operator-review", label: "운용자 검토 필요" }
    case "NORMAL":
      return { id: "routine-monitoring", label: "정상 감시 유지" }
  }
}

const statusForIncident = (incident: Incident): string => {
  switch (incident.tone) {
    case "WATCH":
      return "판단 보류: 사람 검토 필요"
    case "NORMAL":
      return "정상 감시 유지"
  }
}

const citationLabel = (citation: Citation): string =>
  citation.time === undefined ? citation.label : `${citation.label} ${citation.time}`

const readServerError = async (response: Response): Promise<string> => {
  const text = await response.text()
  if (text.length === 0) {
    return "서버 Codex 요청 실패: 응답 본문이 없습니다."
  }

  try {
    const payload: unknown = JSON.parse(text)
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      const error = payload.error
      if (typeof error === "string" && error.length > 0) {
        return error
      }
    }
    return "서버 Codex 요청 실패: 오류 응답을 확인했습니다."
  } catch (error) {
    if (error instanceof SyntaxError) {
      return "서버 Codex 요청 실패: 오류 응답을 읽을 수 없습니다."
    }
    throw error
  }
}

export const requestCodexAgent = async (
  context: CodexAgentContext,
): Promise<CodexAgentDecision> => {
  const checkpoint = checkpointForIncident(context.incident)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch("/api/codex-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        checkpointId: checkpoint.id,
        checkpointLabel: checkpoint.label,
        evidence: {
          incidentId: context.incident.id,
          title: context.incident.title,
          status: statusForIncident(context.incident),
          summary: `${context.incident.zone} ${context.incident.meta} 증거 패킷 — ${context.incident.title}${
            context.recentActivitySummary !== undefined ? ` · ${context.recentActivitySummary}` : ""
          }`,
          citations: context.citations.map(citationLabel),
          missingContext: context.missingContext.map((item) => `${item.camera}: ${item.reason}`),
          responseOutcome: context.responseOutcome,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new CodexAgentClientError(await readServerError(response), response.status)
    }

    const payload: unknown = await response.json()
    const parsed = CodexAgentResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new CodexAgentClientError("서버 Codex 응답 형식을 확인할 수 없습니다.", null)
    }
    return parsed.data
  } catch (error) {
    if (error instanceof CodexAgentClientError) {
      throw error
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new CodexAgentClientError("서버 Codex 요청 시간이 초과되었습니다.", null)
    }
    throw new CodexAgentClientError("서버 Codex 요청 실패: 연결 상태를 확인하세요.", null)
  } finally {
    clearTimeout(timeout)
  }
}
