import type { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod"
import type { ActivityEventInput } from "../src/activityEvents"
import { emitActivityEvent } from "./activityStream"
import { callCodexCli } from "./codexCliProvider"
import { callConfiguredCodexEndpoint } from "./codexProvider"

const CodexEvidenceSchema = z.object({
  incidentId: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  summary: z.string().min(1),
  citations: z.array(z.string().min(1)).min(1).readonly(),
  missingContext: z.array(z.string().min(1)).readonly(),
  responseOutcome: z.string().min(1),
})

export const CodexAgentRequestSchema = z.object({
  checkpointId: z.string().min(1),
  checkpointLabel: z.string().min(1),
  evidence: CodexEvidenceSchema,
})

export type CodexAgentRequest = Readonly<z.infer<typeof CodexAgentRequestSchema>>

export type CodexAgentResponse = {
  readonly codexMode: "configured-codex-endpoint" | "codex-cli" | "local-codex-adapter"
  readonly decision: {
    readonly title: string
    readonly summary: string
    readonly recommendedAction: string
    readonly checkpoint: string
  }
  readonly citations: readonly string[]
  readonly adapterNotice: string
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
} as const

const maxBodyBytes = 64 * 1024

type BodyReadResult =
  | { readonly kind: "ok"; readonly body: string }
  | { readonly kind: "too-large" }

type CodexActivity = {
  readonly stage: string
  readonly level?: ActivityEventInput["level"]
  readonly message: string
  readonly detail?: Readonly<Record<string, unknown>>
}

const emitCodexActivity = (activity: CodexActivity): void => {
  emitActivityEvent({
    source: "codex",
    stage: activity.stage,
    level: activity.level ?? "info",
    message: activity.message,
    ...(activity.detail === undefined ? {} : { detail: activity.detail }),
  })
}

const collectBody = (request: IncomingMessage): Promise<BodyReadResult> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let tooLarge = false
    request.on("data", (chunk: Buffer | string) => {
      if (tooLarge) {
        return
      }
      const buffer = Buffer.from(chunk)
      totalBytes += buffer.byteLength
      if (totalBytes > maxBodyBytes) {
        tooLarge = true
        chunks.length = 0
        resolve({ kind: "too-large" })
        return
      }
      chunks.push(buffer)
    })
    request.on("end", () => {
      if (!tooLarge) {
        resolve({ kind: "ok", body: Buffer.concat(chunks).toString("utf8") })
      }
    })
    request.on("error", (error) => {
      if (!tooLarge) {
        reject(error)
      }
    })
  })

const parseJsonBody = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

const codexMode = (): CodexAgentResponse["codexMode"] => {
  const {
    CODEX_AGENT_ENDPOINT: endpoint,
    CODEX_AGENT_PROVIDER: provider,
    CODEX_AGENT_CLI: legacyCliFlag,
  } = process.env
  if (endpoint !== undefined && endpoint.trim().length > 0) {
    return "configured-codex-endpoint"
  }
  if (provider === "cli" || legacyCliFlag === "1") {
    return "codex-cli"
  }
  return "local-codex-adapter"
}

const configuredEndpoint = (): URL | undefined => {
  const { CODEX_AGENT_ENDPOINT: endpoint } = process.env
  if (endpoint === undefined || endpoint.trim().length === 0) {
    return undefined
  }

  const url = new URL(endpoint)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CODEX_AGENT_ENDPOINT must use http or https")
  }
  return url
}

const localCodexDecision = (
  request: CodexAgentRequest,
  fallbackReason?: string,
): CodexAgentResponse => {
  const mode = codexMode()
  return {
    codexMode: fallbackReason === undefined ? mode : "local-codex-adapter",
    decision: {
      title: "서버 Codex 하네스 판단",
      summary: `${request.evidence.title} 항목은 모의 증거와 누락 맥락을 함께 보존해 검토합니다.`,
      recommendedAction:
        "자동 결론이나 물리 대응을 제안하지 않고, 사람 검토와 인용 보존을 우선합니다.",
      checkpoint: request.checkpointLabel,
    },
    citations: request.evidence.citations,
    adapterNotice:
      fallbackReason !== undefined
        ? `설정된 Codex 엔드포인트 호출에 실패해 로컬 Codex 어댑터 판단을 반환했습니다. 사유: ${fallbackReason}`
        : mode === "local-codex-adapter"
          ? "CODEX_AGENT_ENDPOINT가 설정되지 않아 로컬 Codex 어댑터 판단을 반환했습니다."
          : "CODEX_AGENT_ENDPOINT 설정이 감지되어 서버 하네스 연결 모드로 표시했습니다.",
  }
}

export const decideCodexAgent = async (request: CodexAgentRequest): Promise<CodexAgentResponse> => {
  const mode = codexMode()
  emitCodexActivity({
    stage: "request:send",
    message: "Codex 에이전트 요청을 전송했습니다.",
    detail: {
      checkpointId: request.checkpointId,
      citationCount: request.evidence.citations.length,
      mode,
    },
  })
  let endpoint: URL | undefined
  try {
    endpoint = configuredEndpoint()
  } catch (error) {
    const reason = error instanceof Error ? error.message : "알 수 없는 오류"
    return emitCodexResponse(localCodexDecision(request, reason), true)
  }

  if (endpoint === undefined) {
    if (mode !== "codex-cli") {
      return emitCodexResponse(localCodexDecision(request), false)
    }

    try {
      const providerResponse = await callCodexCli(request)
      return emitCodexResponse(
        {
          codexMode: "codex-cli",
          decision: providerResponse.decision,
          citations: providerResponse.citations ?? request.evidence.citations,
          adapterNotice:
            providerResponse.adapterNotice ?? "로컬 Codex CLI가 하네스 판단을 생성했습니다.",
        },
        false,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : "알 수 없는 오류"
      return emitCodexResponse(localCodexDecision(request, reason), true)
    }
  }

  try {
    const providerResponse = await callConfiguredCodexEndpoint(endpoint, request)
    return emitCodexResponse(
      {
        codexMode: "configured-codex-endpoint",
        decision: providerResponse.decision,
        citations: providerResponse.citations ?? request.evidence.citations,
        adapterNotice:
          providerResponse.adapterNotice ?? "서버 Codex 엔드포인트에서 판단을 수신했습니다.",
      },
      false,
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : "알 수 없는 오류"
    return emitCodexResponse(localCodexDecision(request, reason), true)
  }
}

const emitCodexResponse = (response: CodexAgentResponse, fallback: boolean): CodexAgentResponse => {
  emitCodexActivity({
    stage: "response:received",
    level: fallback ? "warn" : "info",
    message: "Codex 에이전트 응답을 수신했습니다.",
    detail: {
      citationCount: response.citations.length,
      fallback,
      mode: response.codexMode,
    },
  })
  return response
}

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  payload: CodexAgentResponse | { readonly error: string },
): void => {
  response.writeHead(statusCode, jsonHeaders)
  response.end(JSON.stringify(payload))
}

export const handleCodexAgentRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const result = await collectBody(request)
  if (result.kind === "too-large") {
    writeJson(response, 413, { error: "Codex 하네스 요청이 너무 큽니다." })
    return
  }

  const payload = parseJsonBody(result.body)
  const parsed = CodexAgentRequestSchema.safeParse(payload)

  if (!parsed.success) {
    writeJson(response, 400, { error: "잘못된 Codex 하네스 요청입니다." })
    return
  }

  writeJson(response, 200, await decideCodexAgent(parsed.data))
}
