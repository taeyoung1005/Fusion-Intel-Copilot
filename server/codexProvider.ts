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

const providerTimeoutMs = 2500
const maxProviderResponseBytes = 64 * 1024

export const callConfiguredCodexEndpoint = async (
  endpoint: URL,
  request: CodexAgentRequest,
): Promise<ProviderResponse> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, providerTimeoutMs)

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
