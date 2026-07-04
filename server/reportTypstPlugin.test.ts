import { type Server, createServer } from "node:http"
import { type ViteDevServer, createServer as createViteServer } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import type { CommanderReportArtifact } from "../src/cop/reportArtifact"
import { reportTypstPlugin } from "./reportTypstPlugin"

type StartedReportServer = {
  readonly app: ViteDevServer
  readonly server: Server
  readonly url: string
}

type JsonResponse = {
  readonly status: number
  readonly body: unknown
}

type RawResponse = {
  readonly status: number
  readonly contentType: string
  readonly body: Buffer
}

class MissingTypstCliError extends Error {
  readonly code = "ENOENT"
}

class TypstCompileFailure extends Error {
  readonly stderr: string

  constructor(stderr: string) {
    super("typst compile failed")
    this.stderr = stderr
  }
}

const reportArtifact = {
  reportId: "RPT-20260705-INC-CARLA-N-01-140305",
  exportReceiptId: "EXP-20260705-INC-CARLA-N-01-140305",
  generatedAtIso: "2026-07-05T05:06:07.000Z",
  date: "2026-07-05",
  title: "FUSION INTEL COPILOT DAILY SITUATION REPORT",
  period: "14:03:05 ~ 14:03:35",
  incident: {
    id: "inc-CARLA-N-01",
    tone: "watch",
    zone: "CARLA-N-01",
    title: "CARLA-N-01 person approaching",
    meta: "북측 CARLA CCTV",
    time: "14:03:05",
    confidence: 91,
  },
  selectedClipId: "ev-carla-vision-CARLA-N-01-7",
  summary: "inc-CARLA-N-01 / CARLA-N-01 person approaching / 1개 증거 이벤트",
  rows: [{ id: "total", label: "TOTAL EVENTS", value: "1" }],
  timeline: [
    {
      clipId: "ev-carla-vision-CARLA-N-01-7",
      time: "14:03:05",
      camera: "CARLA-N-01",
      tone: "alert",
      source: "vision",
      label: "북측 CARLA CCTV · person 접근",
      detail: "CONF 91%",
      confidencePct: 91,
      detectionClass: "person",
    },
  ],
  perCameraFindings: [
    {
      camera: "CARLA-N-01",
      eventCount: 1,
      highestConfidencePct: 91,
      latestTime: "14:03:05",
      detectionClasses: ["person"],
    },
  ],
  responseActions: [{ gateId: "gate-data", label: "추가 데이터 검토", status: "PASS" }],
  unresolved: ["CARLA-E-02: 업링크 프레임 대기 (No Uplink Frame)"],
  citations: [
    {
      id: "cite-ev-carla-vision-CARLA-N-01-7",
      label: "CARLA-N-01 · DETR",
      time: "14:03:05",
    },
  ],
} satisfies CommanderReportArtifact

const startedServers: StartedReportServer[] = []

afterEach(async () => {
  await Promise.all(startedServers.splice(0).map(stopReportServer))
})

describe("report Typst PDF HTTP boundary", () => {
  it("returns application/pdf bytes when the mocked Typst renderer succeeds", async () => {
    // Given: the report PDF plugin is mounted with a renderer that returns PDF bytes.
    const renderedSources: string[] = []
    const pdfBytes = Buffer.from("%PDF-1.7\n% mocked typst output\n")
    const server = await startReportServer({
      renderPdf: async (source) => {
        renderedSources.push(source)
        return pdfBytes
      },
    })

    // When: the client posts a commander report artifact.
    const response = await postRaw(`${server.url}/api/report-pdf`, reportArtifact)

    // Then: the response is the renderer output and the renderer receives Typst source.
    expect(response.status).toBe(200)
    expect(response.contentType).toContain("application/pdf")
    expect(response.body.equals(pdfBytes)).toBe(true)
    expect(renderedSources).toHaveLength(1)
    expect(renderedSources[0]).toContain("경계구역 일일 상황보고")
    expect(renderedSources[0]).toContain("RPT-20260705-INC-CARLA-N-01-140305")
  })

  it("renders hostile footer metadata as inert Typst text before compilation", async () => {
    // Given: a report artifact carries Typst code-shaped metadata strings.
    const renderedSources: string[] = []
    const server = await startReportServer({
      renderPdf: async (source) => {
        renderedSources.push(source)
        return Buffer.from("%PDF-1.7\n% mocked typst output\n")
      },
    })
    const hostileArtifact = {
      ...reportArtifact,
      generatedAtIso: '#panic("INJECTED_GENERATED")',
      exportReceiptId: '#read("package.json")',
    } satisfies CommanderReportArtifact

    // When: the client posts the artifact through the HTTP boundary.
    const response = await postRaw(`${server.url}/api/report-pdf`, hostileArtifact)

    // Then: the renderer receives the hostile footer as text, not raw Typst markup.
    expect(response.status).toBe(200)
    expect(renderedSources).toHaveLength(1)
    const footer = renderedSources[0]?.slice(renderedSources[0].indexOf("#v(8pt)")) ?? ""
    expect(footer).toContain('#text(size: 8pt)[#text("generatedAtIso:')
    expect(footer).toContain("#panic")
    expect(footer).toContain("#read")
    expect(footer).not.toContain("#text(size: 8pt)[generatedAtIso: #panic")
  })

  it("returns 400 when the request body is malformed JSON", async () => {
    // Given: the report PDF plugin is mounted with a renderer that should not be called.
    let renderCallCount = 0
    const server = await startReportServer({
      renderPdf: async () => {
        renderCallCount += 1
        return Buffer.from("%PDF-1.7\n")
      },
    })

    // When: the client posts invalid JSON.
    const response = await postText(`${server.url}/api/report-pdf`, "{")

    // Then: the boundary rejects the request before rendering.
    expect(response.status).toBe(400)
    expect(renderCallCount).toBe(0)
    expect(response.body).toEqual({ error: expect.any(String) })
  })

  it("returns 502 with the Korean brew install guidance when Typst is missing", async () => {
    // Given: the renderer reports the same ENOENT shape child_process emits for a missing CLI.
    const server = await startReportServer({
      renderPdf: async () => {
        throw new MissingTypstCliError("spawn typst ENOENT")
      },
    })

    // When: the client requests a PDF.
    const response = await postJson(`${server.url}/api/report-pdf`, reportArtifact)

    // Then: the HTTP boundary returns actionable setup guidance.
    expect(response.status).toBe(502)
    expect(response.body).toEqual({
      error: "typst CLI가 설치되어 있지 않습니다. 'brew install typst' 후 다시 시도하세요.",
    })
  })

  it("returns 502 with raw Typst stderr when compilation fails", async () => {
    // Given: the renderer exposes Typst stderr from a compile failure.
    const server = await startReportServer({
      renderPdf: async () => {
        throw new TypstCompileFailure("error: expected expression at report.typ:12:4")
      },
    })

    // When: the client requests a PDF.
    const response = await postJson(`${server.url}/api/report-pdf`, reportArtifact)

    // Then: the response includes stderr so the Typst source can be debugged.
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: "error: expected expression at report.typ:12:4" })
  })
})

const startReportServer = async (
  options: Parameters<typeof reportTypstPlugin>[0],
): Promise<StartedReportServer> => {
  const app = await createViteServer({
    configFile: false,
    logLevel: "silent",
    plugins: [reportTypstPlugin(options)],
    server: { middlewareMode: true },
  })
  const server = createServer(app.middlewares)
  await listen(server)
  const started = { app, server, url: serverUrl(server) }
  startedServers.push(started)
  return started
}

const stopReportServer = async ({ app, server }: StartedReportServer): Promise<void> => {
  await Promise.all([close(server), app.close()])
}

const postRaw = async (url: string, payload: unknown): Promise<RawResponse> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: Buffer.from(await response.arrayBuffer()),
  }
}

const postJson = async (url: string, payload: unknown): Promise<JsonResponse> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  return { status: response.status, body: await parseJsonResponse(response) }
}

const postText = async (url: string, body: string): Promise<JsonResponse> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })
  return { status: response.status, body: await parseJsonResponse(response) }
}

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  return text.length === 0 ? undefined : JSON.parse(text)
}

const listen = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

const close = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve()
        return
      }
      reject(error)
    })
  })

const serverUrl = (server: Server): string => {
  const address = server.address()
  if (typeof address === "string" || address === null || typeof address.port !== "number") {
    throw new Error("Expected TCP server address")
  }
  return `http://127.0.0.1:${address.port}`
}
