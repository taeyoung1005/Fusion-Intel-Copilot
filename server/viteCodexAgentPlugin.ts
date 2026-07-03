import type { Connect, Plugin } from "vite"
import { handleCarlaCameraRequest, isCarlaCameraRequest } from "./carlaCameraRegistry"
import { handleCodexAgentRequest } from "./codexAgent"
import { handleMobileCameraRequest, isMobileCameraRequest } from "./mobileCameraRegistry"
import { attachMobileSignaling } from "./mobileSignaling"
import { handleVisionPipelineRequest } from "./visionPipeline"

const isCodexAgentPost = (method: string | undefined, url: string | undefined): boolean => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  return method === "POST" && pathname === "/api/codex-agent"
}

const isVisionPipelinePost = (method: string | undefined, url: string | undefined): boolean => {
  const pathname = new URL(url ?? "/", "http://localhost").pathname
  return method === "POST" && pathname === "/api/vision-pipeline"
}

const createCodexAgentMiddleware =
  (): Connect.NextHandleFunction =>
  (request, response, next): void => {
    if (isMobileCameraRequest(request.method, request.url)) {
      handleMobileCameraRequest(request, response).catch((error: unknown) => {
        if (error instanceof Error) {
          response.writeHead(500, { "content-type": "application/json; charset=utf-8" })
          response.end(JSON.stringify({ error: "모바일 CCTV 처리 중 오류가 발생했습니다." }))
          return
        }
        throw error
      })
      return
    }

    if (isCarlaCameraRequest(request.method, request.url)) {
      handleCarlaCameraRequest(request, response).catch((error: unknown) => {
        if (error instanceof Error) {
          response.writeHead(500, { "content-type": "application/json; charset=utf-8" })
          response.end(JSON.stringify({ error: "CARLA 카메라 처리 중 오류가 발생했습니다." }))
          return
        }
        throw error
      })
      return
    }

    if (isVisionPipelinePost(request.method, request.url)) {
      handleVisionPipelineRequest(request, response).catch((error: unknown) => {
        if (error instanceof Error) {
          response.writeHead(500, { "content-type": "application/json; charset=utf-8" })
          response.end(JSON.stringify({ error: "비전 파이프라인 처리 중 오류가 발생했습니다." }))
          return
        }
        throw error
      })
      return
    }

    if (!isCodexAgentPost(request.method, request.url)) {
      next()
      return
    }

    handleCodexAgentRequest(request, response).catch((error: unknown) => {
      if (error instanceof Error) {
        response.writeHead(500, { "content-type": "application/json; charset=utf-8" })
        response.end(JSON.stringify({ error: "서버 Codex 하네스 처리 중 오류가 발생했습니다." }))
        return
      }
      throw error
    })
  }

export const codexAgentPlugin = (): Plugin => ({
  name: "d4d-codex-agent",
  configureServer(server) {
    server.middlewares.use(createCodexAgentMiddleware())
    if (server.httpServer !== null) {
      attachMobileSignaling(server.httpServer)
    }
  },
  configurePreviewServer(server) {
    server.middlewares.use(createCodexAgentMiddleware())
    if (server.httpServer !== null) {
      attachMobileSignaling(server.httpServer)
    }
  },
})
