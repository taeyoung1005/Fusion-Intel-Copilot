import type { IncomingMessage, ServerResponse } from "node:http"
import type { Connect, Plugin } from "vite"
import { parseCommanderReportArtifact } from "./reportTypstArtifactSchema"
import {
  TypstCliMissingError,
  TypstCompileError,
  compileTypstPdf,
  typstMissingCliMessage,
} from "./reportTypstCompiler"
import { buildReportTypstSource } from "./reportTypstTemplate"

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
} as const

const reportPdfHeaders = {
  "content-type": "application/pdf",
} as const

const maxBodyBytes = 512 * 1024

type BodyReadResult =
  | { readonly kind: "ok"; readonly body: string }
  | { readonly kind: "too-large" }

export type ReportTypstPluginOptions = {
  readonly renderPdf?: (source: string) => Promise<Buffer>
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
    request.on("error", reject)
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

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  payload: { readonly error: string },
): void => {
  response.writeHead(statusCode, jsonHeaders)
  response.end(JSON.stringify(payload))
}

const writePdf = (response: ServerResponse, payload: Buffer): void => {
  response.writeHead(200, reportPdfHeaders)
  response.end(payload)
}

const hasErrorCode = (error: unknown, code: string): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false
  }
  return Reflect.get(error, "code") === code
}

const stderrOf = (error: unknown): string | null => {
  if (typeof error !== "object" || error === null || !("stderr" in error)) {
    return null
  }
  const stderr = Reflect.get(error, "stderr")
  return typeof stderr === "string" ? stderr : null
}

export const isReportPdfPost = (method: string | undefined, url: string | undefined): boolean => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  return method === "POST" && pathname === "/api/report-pdf"
}

export const handleReportPdfRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  options: ReportTypstPluginOptions = {},
): Promise<void> => {
  const body = await collectBody(request)
  if (body.kind === "too-large") {
    writeJson(response, 413, { error: "보고서 PDF 요청이 너무 큽니다." })
    return
  }

  const artifact = parseCommanderReportArtifact(parseJsonBody(body.body))
  if (artifact === null) {
    writeJson(response, 400, { error: "보고서 PDF 요청 형식을 확인할 수 없습니다." })
    return
  }

  const source = buildReportTypstSource(artifact)
  const renderPdf = options.renderPdf ?? compileTypstPdf
  try {
    writePdf(response, await renderPdf(source))
  } catch (error) {
    if (error instanceof TypstCliMissingError || hasErrorCode(error, "ENOENT")) {
      writeJson(response, 502, { error: typstMissingCliMessage })
      return
    }
    const stderr = error instanceof TypstCompileError ? error.stderr : stderrOf(error)
    if (stderr !== null) {
      writeJson(response, 502, { error: stderr })
      return
    }
    throw error
  }
}

export const createReportTypstMiddleware =
  (options: ReportTypstPluginOptions = {}): Connect.NextHandleFunction =>
  (request, response, next): void => {
    if (!isReportPdfPost(request.method, request.url)) {
      next()
      return
    }
    handleReportPdfRequest(request, response, options).catch((error: unknown) => {
      if (error instanceof Error) {
        writeJson(response, 500, { error: "보고서 PDF 처리 중 오류가 발생했습니다." })
        return
      }
      throw error
    })
  }

export const reportTypstPlugin = (options: ReportTypstPluginOptions = {}): Plugin => ({
  name: "d4d-report-typst",
  configureServer(server) {
    server.middlewares.use(createReportTypstMiddleware(options))
  },
  configurePreviewServer(server) {
    server.middlewares.use(createReportTypstMiddleware(options))
  },
})
