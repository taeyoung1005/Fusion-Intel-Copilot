import type { Connect, Plugin } from "vite"
import {
  handleActivityEventPost,
  handleActivityStreamRequest,
  isActivityEventPost,
  isActivityStreamRequest,
} from "./activityStream"
import { handleCarlaCameraRequest, isCarlaCameraRequest } from "./carlaCameraRegistry"
import { handleCarlaWebrtcRequest, isCarlaWebrtcRequest } from "./carlaWebrtcSignaling"
import { handleCodexAgentRequest } from "./codexAgent"
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
    if (isActivityStreamRequest(request.method, request.url)) {
      handleActivityStreamRequest(request, response)
      return
    }

    if (isActivityEventPost(request.method, request.url)) {
      handleActivityEventPost(request, response).catch((error: unknown) => {
        if (error instanceof Error) {
          response.writeHead(500, { "content-type": "application/json; charset=utf-8" })
          response.end(JSON.stringify({ error: "활동 이벤트 처리 중 오류가 발생했습니다." }))
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

    if (isCarlaWebrtcRequest(request.method, request.url)) {
      handleCarlaWebrtcRequest(request, response).catch((error: unknown) => {
        if (error instanceof Error) {
          response.writeHead(500, { "content-type": "application/json; charset=utf-8" })
          response.end(JSON.stringify({ error: "CARLA WebRTC 처리 중 오류가 발생했습니다." }))
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
  },
  configurePreviewServer(server) {
    server.middlewares.use(createCodexAgentMiddleware())
  },
})
