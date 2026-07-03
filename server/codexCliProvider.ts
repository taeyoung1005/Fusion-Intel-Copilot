import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import type { CodexAgentRequest } from "./codexAgent"
import type { ProviderResponse } from "./codexProvider"

const CliResponseSchema = z.object({
  decision: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    recommendedAction: z.string().min(1),
    checkpoint: z.string().min(1),
  }),
  citations: z.array(z.string().min(1)).min(1).readonly().optional(),
  adapterNotice: z.string().min(1).optional(),
})

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "citations", "adapterNotice"],
  properties: {
    decision: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "recommendedAction", "checkpoint"],
      properties: {
        title: { type: "string", minLength: 1 },
        summary: { type: "string", minLength: 1 },
        recommendedAction: { type: "string", minLength: 1 },
        checkpoint: { type: "string", minLength: 1 },
      },
    },
    citations: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    adapterNotice: { type: "string", minLength: 1 },
  },
} as const

const defaultTimeoutMs = 60_000
const maxOutputBytes = 128 * 1024

const parseTimeout = (): number => {
  const { CODEX_AGENT_CLI_TIMEOUT_MS: value } = process.env
  if (value === undefined || value.trim().length === 0) {
    return defaultTimeoutMs
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 5_000 || parsed > 180_000) {
    throw new Error("CODEX_AGENT_CLI_TIMEOUT_MS must be between 5000 and 180000")
  }
  return parsed
}

const promptFor = (
  request: CodexAgentRequest,
): string => `당신은 D4D 경계 CCTV AI 하네스의 상황 분석 에이전트입니다.

아래 입력은 CV/추적/메모리 하네스가 수집한 합성 데모 데이터입니다. 목표는 자동 대응이 아니라 지휘관과 운용자가 확인할 수 있는 객관적 판단 보조입니다.

규칙:
- 물리 대응, 공격, 발포, 표적화, 자동 제압을 지시하지 마세요.
- 증거에 없는 내용을 단정하지 마세요.
- 누락 맥락이 있으면 판단 보류와 사람 검토를 우선하세요.
- 출력은 제공된 JSON 스키마만 따르세요.

하네스 요청:
${JSON.stringify(request, null, 2)}
`

const runCodexProcess = (
  codexPath: string,
  args: readonly string[],
  timeout: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(codexPath, args, {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, CODEX_CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    const output: Buffer[] = []
    let outputBytes = 0
    let settled = false

    const terminate = (): void => {
      const { pid } = child
      try {
        if (pid === undefined) {
          child.kill("SIGTERM")
          return
        }
        process.kill(-pid, "SIGTERM")
      } catch {
        child.kill("SIGTERM")
      }
      setTimeout(() => {
        if (!settled) {
          try {
            if (pid === undefined) {
              child.kill("SIGKILL")
              return
            }
            process.kill(-pid, "SIGKILL")
          } catch {
            child.kill("SIGKILL")
          }
        }
      }, 1_000).unref()
    }

    const timer = setTimeout(() => {
      terminate()
      finish(new Error(`Codex CLI timed out after ${timeout}ms`))
    }, timeout)
    timer.unref()

    const finish = (error?: Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error === undefined) {
        resolve()
        return
      }
      reject(error)
    }

    const collectOutput = (chunk: Buffer): void => {
      if (settled) {
        return
      }
      outputBytes += chunk.byteLength
      if (outputBytes > maxOutputBytes) {
        terminate()
        finish(new Error("Codex CLI output is too large"))
        return
      }
      output.push(chunk)
    }

    child.stdout.on("data", collectOutput)
    child.stderr.on("data", collectOutput)
    child.on("error", (error) => finish(error))
    child.on("exit", (code, signal) => {
      if (settled) {
        return
      }
      if (code === 0) {
        finish()
        return
      }
      const detail = Buffer.concat(output).toString("utf8").trim()
      finish(new Error(`Codex CLI exited with ${code ?? signal}${detail ? `: ${detail}` : ""}`))
    })
  })

export const callCodexCli = async (request: CodexAgentRequest): Promise<ProviderResponse> => {
  const { CODEX_AGENT_CLI_MODEL: modelValue, CODEX_AGENT_CLI_PATH: pathValue } = process.env
  const codexPath = pathValue?.trim() || "codex"
  const model = modelValue?.trim()
  const timeout = parseTimeout()
  const tempDir = await mkdtemp(join(tmpdir(), "d4d-codex-agent-"))
  const outputPath = join(tempDir, "decision.json")
  const schemaPath = join(tempDir, "schema.json")

  try {
    await writeFile(schemaPath, JSON.stringify(responseJsonSchema), "utf8")
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      ...(model === undefined || model.length === 0 ? [] : ["--model", model]),
      promptFor(request),
    ]

    await runCodexProcess(codexPath, args, timeout)

    const payload = JSON.parse(await readFile(outputPath, "utf8"))
    const parsed = CliResponseSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error("Codex CLI returned an invalid response")
    }

    return {
      decision: parsed.data.decision,
      citations: parsed.data.citations ?? request.evidence.citations,
      adapterNotice: parsed.data.adapterNotice ?? "로컬 Codex CLI가 하네스 판단을 생성했습니다.",
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
