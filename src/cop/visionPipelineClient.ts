import { z } from "zod"

const VisionBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

const VisionObjectSchema = z.object({
  objectId: z.string().optional(),
  label: z.string(),
  confidence: z.number(),
  distanceM: z.number().optional(),
  distanceMeters: z.number().optional(),
  bbox: VisionBoxSchema,
})

const VisionFrameSchema = z.object({
  frameId: z.string(),
  timestampMs: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  objects: z.array(VisionObjectSchema).readonly(),
})

export const VisionPipelineRequestSchema = z.object({
  cameraId: z.string(),
  incidentId: z.string().optional(),
  sequenceId: z.string().optional(),
  capturedAt: z.string().optional(),
  providerHint: z.string().optional(),
  frames: z.array(VisionFrameSchema).readonly(),
})

const VisionPipelineResponseSchema = z.object({
  provider: z.string(),
  sequenceId: z.string(),
  cameraId: z.string(),
  detections: z
    .array(
      z.object({
        id: z.string(),
        frameId: z.string().optional(),
        label: z.string(),
        confidence: z.number(),
        distanceMeters: z.number().nullable().optional(),
      }),
    )
    .readonly(),
  tracks: z
    .array(
      z.object({
        id: z.string().optional(),
        status: z.string(),
      }),
    )
    .readonly(),
  semanticEvents: z
    .array(
      z.object({
        id: z.string(),
        subjectLabel: z.string(),
        action: z.string(),
        direction: z.string(),
        distanceTrend: z.string(),
        durationMs: z.number(),
        frameIds: z.array(z.string()).readonly(),
        confidence: z.number(),
        summary: z.string(),
      }),
    )
    .readonly()
    .optional(),
  visualAnalysisAgent: z.object({
    status: z.string(),
    summary: z.string(),
  }),
  situationAnalysisAgent: z.object({
    riskLevel: z.string(),
    summary: z.string(),
  }),
  evidenceBundle: z
    .object({
      codexReady: z.boolean().optional(),
      recommendedAction: z.string().optional(),
      citations: z.array(z.string()).readonly().optional(),
    })
    .optional(),
})

export type VisionPipelineRequest = Readonly<z.infer<typeof VisionPipelineRequestSchema>>
export type VisionPipelineResponse = Readonly<z.infer<typeof VisionPipelineResponseSchema>>

export class VisionPipelineClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "VisionPipelineClientError"
  }
}

const readServerError = async (response: Response): Promise<string> => {
  const text = await response.text()
  if (text.length === 0) {
    return "비전 파이프라인 응답이 비어 있습니다."
  }
  try {
    const payload: unknown = JSON.parse(text)
    if (typeof payload === "object" && payload !== null && "error" in payload) {
      const error = payload.error
      if (typeof error === "string" && error.length > 0) {
        return error
      }
    }
    return "비전 파이프라인 오류 응답을 확인했습니다."
  } catch (error) {
    if (error instanceof SyntaxError) {
      return text
    }
    throw error
  }
}

export const requestVisionPipeline = async (
  request: VisionPipelineRequest,
): Promise<VisionPipelineResponse> => {
  const response = await fetch("/api/vision-pipeline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new VisionPipelineClientError(await readServerError(response))
  }

  const payload: unknown = await response.json()
  const parsed = VisionPipelineResponseSchema.safeParse(payload)
  if (!parsed.success) {
    throw new VisionPipelineClientError("비전 파이프라인 응답 형식을 확인할 수 없습니다.")
  }
  return parsed.data
}
