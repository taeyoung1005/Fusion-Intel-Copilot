import { afterEach, describe, expect, it, vi } from "vitest"
import type { CommanderReportArtifact } from "./reportArtifact"
import {
  REPORT_PDF_CLIENT_TIMEOUT_MS,
  ReportPdfClientError,
  requestReportPdf,
} from "./reportPdfClient"

const reportArtifact = {
  reportId: "RPT-20260705-INC-CARLA-N-01-140305",
  exportReceiptId: "EXP-20260705-INC-CARLA-N-01-140305",
  generatedAtIso: "2026-07-05T05:06:07.000Z",
  date: "2026-07-05",
  title: "FUSION INTEL COPILOT DAILY SITUATION REPORT",
  period: "14:03:05 ~ 14:03:35",
  incident: {
    id: "inc-CARLA-N-01",
    tone: "WATCH",
    zone: "CARLA-N-01",
    title: "CARLA-N-01 person approaching",
    meta: "북측 CARLA CCTV",
    time: "14:03:05",
    confidence: 91,
  },
  summary: "inc-CARLA-N-01 / CARLA-N-01 person approaching / 1개 증거 이벤트",
  rows: [{ id: "total", label: "TOTAL EVENTS", value: "1" }],
  timeline: [],
  perCameraFindings: [],
  responseActions: [],
  unresolved: [],
  citations: [],
} satisfies CommanderReportArtifact

const validPdfContent = `%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 68 >>
stream
BT
/F1 12 Tf
72 720 Td
(D4D report PDF preview fixture) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000117 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
429
%%EOF
`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("requestReportPdf", () => {
  it("creates a PDF Blob from server bytes", async () => {
    // Given: the report PDF endpoint returns binary PDF bytes.
    let requestBody = ""
    const fetchPdf = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requestBody = String(init?.body ?? "")
      return new Response(Buffer.from(validPdfContent), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    }
    vi.stubGlobal("fetch", fetchPdf)

    // When: the client requests a PDF for the artifact.
    const result = await requestReportPdf(reportArtifact)

    // Then: the helper exposes a PDF blob and deterministic filename.
    expect(JSON.parse(requestBody)).toMatchObject({ reportId: reportArtifact.reportId })
    expect(result.fileName).toBe("d4d-report-RPT-20260705-INC-CARLA-N-01-140305.pdf")
    expect(result.blob.type).toBe("application/pdf")
    expect(await result.blob.text()).toBe(validPdfContent)
  })

  it("surfaces server JSON errors as retryable Korean messages", async () => {
    // Given: the server returns a Korean JSON error.
    const fetchError = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          error: "typst CLI가 설치되어 있지 않습니다. 'brew install typst' 후 다시 시도하세요.",
        }),
        {
          status: 502,
          headers: { "content-type": "application/json; charset=utf-8" },
        },
      )
    vi.stubGlobal("fetch", fetchError)

    // When / Then: the UI-facing error message is exactly the server guidance.
    await expect(requestReportPdf(reportArtifact)).rejects.toMatchObject({
      message: "typst CLI가 설치되어 있지 않습니다. 'brew install typst' 후 다시 시도하세요.",
    })
    await expect(requestReportPdf(reportArtifact)).rejects.toBeInstanceOf(ReportPdfClientError)
  })

  it("rejects tiny placeholder PDF bytes instead of showing a blank preview", async () => {
    // Given: the server returns a 200 response with bytes that cannot be a rendered report PDF.
    const fetchPlaceholderPdf = async (): Promise<Response> =>
      new Response(Buffer.from("%PDF-1.7\n"), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    vi.stubGlobal("fetch", fetchPlaceholderPdf)

    // When / Then: the client keeps the operator on a retryable error path.
    await expect(requestReportPdf(reportArtifact)).rejects.toMatchObject({
      message: "PDF 미리보기 생성 실패: PDF 파일이 비어 있거나 손상되었습니다.",
    })
  })

  it("rejects zero-page PDF bytes instead of showing a blank preview", async () => {
    // Given: the server returns a large PDF payload whose page tree has no pages.
    const zeroPagePdf = `%PDF-1.7
1 0 obj
<< /Type/Pages/Count 0/Kids[] >>
endobj
2 0 obj
<< /Type/Catalog/Pages 1 0 R >>
endobj
${"0".repeat(700)}
%%EOF
`
    const fetchZeroPagePdf = async (): Promise<Response> =>
      new Response(Buffer.from(zeroPagePdf), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    vi.stubGlobal("fetch", fetchZeroPagePdf)

    // When / Then: the client keeps the operator on a retryable error path.
    await expect(requestReportPdf(reportArtifact)).rejects.toMatchObject({
      message: "PDF 미리보기 생성 실패: PDF 파일이 비어 있거나 손상되었습니다.",
    })
  })

  it("shows Korean network failure guidance", async () => {
    // Given: fetch fails before the server returns a response.
    const fetchFailure = async (): Promise<Response> => {
      throw new TypeError("failed to fetch")
    }
    vi.stubGlobal("fetch", fetchFailure)

    // When / Then: the helper converts the transport failure for the operator.
    await expect(requestReportPdf(reportArtifact)).rejects.toMatchObject({
      message: "PDF 미리보기 생성 실패: 서버 연결 상태를 확인하세요.",
    })
  })

  it("aborts and surfaces a retryable timeout instead of hanging forever", async () => {
    // Given: the server never responds (e.g. a dev-server restart mid-request).
    vi.useFakeTimers()
    const fetchHangs = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")))
      })
    vi.stubGlobal("fetch", fetchHangs)

    // When: the client request is left in flight past the client-side timeout.
    const pending = requestReportPdf(reportArtifact)
    const assertion = expect(pending).rejects.toMatchObject({
      message:
        "PDF 미리보기 생성 실패: 서버 응답이 너무 오래 걸려 요청을 취소했습니다. 다시 시도하세요.",
    })
    await vi.advanceTimersByTimeAsync(REPORT_PDF_CLIENT_TIMEOUT_MS)

    // Then: it rejects with Korean timeout guidance instead of staying pending.
    await assertion
    vi.useRealTimers()
  })
})
