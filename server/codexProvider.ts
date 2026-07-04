import { z } from "zod"
import type { CodexAgentRequest } from "./codexAgent"

const ProviderResponseSchema = z.object({
  decision: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    recommendedAction: z.string().min(1),
    checkpoint: z.string().min(1),
  }),
  citations: z.array(z.string().min(1)).min(1).readonly().optional(),
  adapterNotice: z.string().min(1).optional(),
})

export type ProviderResponse = Readonly<z.infer<typeof ProviderResponseSchema>>

export const CODEX_AGENT_ENDPOINT_TIMEOUT_MS = 30_000
export const CODEX_AGENT_ENDPOINT_RETRY_COUNT = 1
const CODEX_AGENT_ENDPOINT_RETRY_BACKOFF_MS = 500
const CODEX_AGENT_ENDPOINT_MIN_TIMEOUT_MS = 5_000
const CODEX_AGENT_ENDPOINT_MAX_TIMEOUT_MS = 30_000
const maxProviderResponseBytes = 64 * 1024

const parseEndpointTimeout = (): number => {
  const { CODEX_AGENT_ENDPOINT_TIMEOUT_MS: value } = process.env
  if (value === undefined || value.trim().length === 0) {
    return CODEX_AGENT_ENDPOINT_TIMEOUT_MS
  }
  const parsed = Number(value)
  if (
    !Number.isFinite(parsed) ||
    parsed < CODEX_AGENT_ENDPOINT_MIN_TIMEOUT_MS ||
    parsed > CODEX_AGENT_ENDPOINT_MAX_TIMEOUT_MS
  ) {
    throw new Error("CODEX_AGENT_ENDPOINT_TIMEOUT_MS must be between 5000 and 30000")
  }
  return parsed
}

const parseEndpointRetryCount = (): number => {
  const { CODEX_AGENT_ENDPOINT_RETRY_COUNT: value } = process.env
  if (value === undefined || value.trim().length === 0) {
    return CODEX_AGENT_ENDPOINT_RETRY_COUNT
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > CODEX_AGENT_ENDPOINT_RETRY_COUNT) {
    throw new Error("CODEX_AGENT_ENDPOINT_RETRY_COUNT must be 0 or 1")
  }
  return parsed
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const callConfiguredCodexEndpoint = async (
  endpoint: URL,
  request: CodexAgentRequest,
): Promise<ProviderResponse> => {
  const timeoutMs = parseEndpointTimeout()
  const retryCount = parseEndpointRetryCount()
  let lastError: unknown

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await callConfiguredCodexEndpointOnce(endpoint, request, timeoutMs)
    } catch (error) {
      lastError = error
      if (attempt === retryCount) {
        break
      }
      await delay(CODEX_AGENT_ENDPOINT_RETRY_BACKOFF_MS)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Codex endpoint request failed")
}

const callConfiguredCodexEndpointOnce = async (
  endpoint: URL,
  request: CodexAgentRequest,
  timeoutMs: number,
): Promise<ProviderResponse> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Codex endpoint returned ${response.status}`)
    }

    const parsed = ProviderResponseSchema.safeParse(await readLimitedJson(response))
    if (!parsed.success) {
      throw new Error("Codex endpoint returned an invalid response")
    }
    return parsed.data
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Codex endpoint timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const readLimitedJson = async (response: Response): Promise<unknown> => {
  const contentLength = response.headers.get("content-length")
  if (contentLength !== null && Number(contentLength) > maxProviderResponseBytes) {
    throw new Error("Codex endpoint response is too large")
  }

  const reader = response.body?.getReader()
  if (reader === undefined) {
    return response.json()
  }

  const chunks: Buffer[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    totalBytes += value.byteLength
    if (totalBytes > maxProviderResponseBytes) {
      await reader.cancel()
      throw new Error("Codex endpoint response is too large")
    }
    chunks.push(Buffer.from(value))
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}
