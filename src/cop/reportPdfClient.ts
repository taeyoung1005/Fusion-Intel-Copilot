import type { CommanderReportArtifact } from "./reportArtifact"

export class ReportPdfClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReportPdfClientError"
  }
}

export type ReportPdfClientResult = {
  readonly fileName: string
  readonly blob: Blob
}

const fallbackServerError = "PDF 미리보기 생성 실패: 서버 응답을 확인하세요."
const networkErrorMessage = "PDF 미리보기 생성 실패: 서버 연결 상태를 확인하세요."
const invalidPdfMessage = "PDF 미리보기 생성 실패: PDF 파일이 비어 있거나 손상되었습니다."
const minimumReportPdfBytes = 512

const isUsablePdfPayload = (payload: ArrayBuffer): boolean => {
  const bytes = new Uint8Array(payload)
  if (bytes.byteLength < minimumReportPdfBytes) {
    return false
  }
  const text = new TextDecoder("latin1").decode(bytes)
  return (
    text.startsWith("%PDF-") &&
    text.includes("%%EOF") &&
    /\/Count\s*[1-9]/u.test(text) &&
    !/\/Count\s*0\b/u.test(text)
  )
}

const readErrorMessage = async (response: Response): Promise<string> => {
  const text = await response.text()
  if (text.length === 0) {
    return fallbackServerError
  }
  try {
    const payload: unknown = JSON.parse(text)
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      const error = payload.error
      if (typeof error === "string" && error.length > 0) {
        return error
      }
    }
    return fallbackServerError
  } catch (error) {
    if (error instanceof SyntaxError) {
      return text
    }
    throw error
  }
}

export const requestReportPdf = async (
  artifact: CommanderReportArtifact,
): Promise<ReportPdfClientResult> => {
  try {
    const response = await fetch("/api/report-pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(artifact),
    })

    if (!response.ok) {
      throw new ReportPdfClientError(await readErrorMessage(response))
    }

    const payload = await response.arrayBuffer()
    if (!isUsablePdfPayload(payload)) {
      throw new ReportPdfClientError(invalidPdfMessage)
    }

    return {
      fileName: `d4d-report-${artifact.reportId}.pdf`,
      blob: new Blob([payload], { type: "application/pdf" }),
    }
  } catch (error) {
    if (error instanceof ReportPdfClientError) {
      throw error
    }
    throw new ReportPdfClientError(networkErrorMessage)
  }
}
