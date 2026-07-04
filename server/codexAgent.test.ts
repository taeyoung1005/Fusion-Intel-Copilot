import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { type IncomingMessage, createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { activityStream } from "./activityStream"
import { type CodexAgentRequest, decideCodexAgent } from "./codexAgent"

const codexEndpointEnvKey = "CODEX_AGENT_ENDPOINT"
const codexProviderEnvKey = "CODEX_AGENT_PROVIDER"
const codexCliPathEnvKey = "CODEX_AGENT_CLI_PATH"
const codexLegacyCliEnvKey = "CODEX_AGENT_CLI"

const baseRequest: CodexAgentRequest = {
  checkpointId: "uncertain",
  checkpointLabel: "판단 불충분",
  evidence: {
    incidentId: "evt-low-confidence",
    title: "판단 불충분 저신뢰 움직임",
    status: "고비용 대응 차단",
    summary: "모의 CCTV 맥락이 불충분하여 사람 검토로 보냅니다.",
    citations: ["evt-low-confidence"],
    missingContext: ["카메라 연속성 부족"],
    responseOutcome: "감독자 검토 필요",
  },
}

beforeEach(() => {
  activityStream.clear()
})

afterEach(() => {
  Reflect.deleteProperty(process.env, codexEndpointEnvKey)
  Reflect.deleteProperty(process.env, codexProviderEnvKey)
  Reflect.deleteProperty(process.env, codexCliPathEnvKey)
  Reflect.deleteProperty(process.env, codexLegacyCliEnvKey)
  activityStream.clear()
})

describe("server Codex provider boundary", () => {
  it("uses the local Codex adapter when no endpoint is configured", async () => {
    const response = await decideCodexAgent(baseRequest)

    expect(response.codexMode).toBe("local-codex-adapter")
    expect(response.decision.title).toBe("서버 Codex 하네스 판단")
    expect(response.adapterNotice).toContain("CODEX_AGENT_ENDPOINT가 설정되지 않아")
  })

  it("posts harness context to the configured Codex endpoint", async () => {
    const receivedBodies: unknown[] = []
    const server = createServer(async (request, response) => {
      receivedBodies.push(JSON.parse(await readRequestBody(request)))
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      response.end(
        JSON.stringify({
          decision: {
            title: "Mock Codex provider 판단",
            summary: "Mock provider가 하네스 맥락을 수신했습니다.",
            recommendedAction: "사람 검토를 유지합니다.",
            checkpoint: "판단 불충분",
          },
          citations: ["mock-provider-citation"],
          adapterNotice: "Mock Codex provider 응답입니다.",
        }),
      )
    })
    await listen(server)
    process.env[codexEndpointEnvKey] = serverUrl(server)

    const response = await decideCodexAgent(baseRequest)

    expect(receivedBodies).toHaveLength(1)
    expect(receivedBodies[0]).toMatchObject({
      checkpointId: "uncertain",
      evidence: { incidentId: "evt-low-confidence" },
    })
    expect(response).toMatchObject({
      codexMode: "configured-codex-endpoint",
      decision: { title: "Mock Codex provider 판단" },
      citations: ["mock-provider-citation"],
      adapterNotice: "Mock Codex provider 응답입니다.",
    })
    expect(activityStream.snapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "codex",
          stage: "request:send",
          detail: expect.objectContaining({
            citationCount: 1,
            mode: "configured-codex-endpoint",
          }),
        }),
        expect.objectContaining({
          source: "codex",
          stage: "response:received",
          detail: expect.objectContaining({
            citationCount: 1,
            fallback: false,
            mode: "configured-codex-endpoint",
          }),
        }),
      ]),
    )
    await close(server)
  })

  it("falls back to the local adapter when the configured endpoint fails", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(503, { "content-type": "application/json; charset=utf-8" })
      response.end(JSON.stringify({ error: "unavailable" }))
    })
    await listen(server)
    process.env[codexEndpointEnvKey] = serverUrl(server)

    const response = await decideCodexAgent(baseRequest)

    expect(response.codexMode).toBe("local-codex-adapter")
    expect(response.adapterNotice).toContain("설정된 Codex 엔드포인트 호출에 실패")
    expect(activityStream.snapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "codex",
          stage: "response:received",
          level: "warn",
          detail: expect.objectContaining({
            citationCount: 1,
            fallback: true,
            mode: "local-codex-adapter",
          }),
        }),
      ]),
    )
    await close(server)
  })

  it("falls back to the local adapter when the provider response is too large", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      response.end(JSON.stringify({ payload: "x".repeat(65 * 1024) }))
    })
    await listen(server)
    process.env[codexEndpointEnvKey] = serverUrl(server)

    const response = await decideCodexAgent(baseRequest)

    expect(response.codexMode).toBe("local-codex-adapter")
    expect(response.adapterNotice).toContain("Codex endpoint response is too large")
    await close(server)
  })

  it("uses the local Codex CLI provider when configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "d4d-fake-codex-"))
    const fakeCodexPath = join(tempDir, "codex")
    await writeFile(
      fakeCodexPath,
      `#!/usr/bin/env node
const { writeFileSync } = require("node:fs")
const outputIndex = process.argv.indexOf("--output-last-message")
const outputPath = process.argv[outputIndex + 1]
writeFileSync(outputPath, JSON.stringify({
  decision: {
    title: "Fake Codex CLI 판단",
    summary: "CLI 어댑터가 하네스 맥락을 수신했습니다.",
    recommendedAction: "사람 검토를 유지합니다.",
    checkpoint: "판단 불충분"
  },
  citations: ["fake-cli-citation"],
  adapterNotice: "Fake Codex CLI 응답입니다."
}))
`,
      "utf8",
    )
    await chmod(fakeCodexPath, 0o755)
    process.env[codexProviderEnvKey] = "cli"
    process.env[codexCliPathEnvKey] = fakeCodexPath

    try {
      const response = await decideCodexAgent(baseRequest)

      expect(response).toMatchObject({
        codexMode: "codex-cli",
        decision: { title: "Fake Codex CLI 판단" },
        citations: ["fake-cli-citation"],
        adapterNotice: "Fake Codex CLI 응답입니다.",
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

const readRequestBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.from(chunk))
    })
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
    request.on("error", reject)
  })

const listen = (server: ReturnType<typeof createServer>): Promise<void> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

const close = (server: ReturnType<typeof createServer>): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve()
        return
      }
      reject(error)
    })
  })

const serverUrl = (server: ReturnType<typeof createServer>): string => {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Mock Codex provider address was not allocated")
  }
  const { address: host, port } = address as AddressInfo
  return `http://${host}:${port}/codex`
}
