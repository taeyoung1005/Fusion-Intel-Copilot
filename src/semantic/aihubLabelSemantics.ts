import { z } from "zod"

const ViewKeySchema = z.enum(["c1", "c2"])
const BboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

const VideoSchema = z
  .object({
    filename: z.string().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    length: z.number().positive(),
    cctv_distribution: z.string().min(1),
    cctv_camera: z.string().min(1),
    cctv_angle: z.string().min(1),
    view: ViewKeySchema,
  })
  .passthrough()
  .readonly()

const CaptionSchema = z
  .object({
    caption_text: z.string().min(1),
    cot: z.record(z.string().min(1), z.string().min(1)),
  })
  .strict()
  .readonly()

const EvidenceSchema = z
  .object({
    evidence_text: z.string().min(1),
    frame_id: z.array(z.number().int().nonnegative()).min(1).readonly(),
    obj_id: z.array(z.string().min(1)).min(1).readonly(),
    obj_bbox: z.array(BboxSchema).min(1).readonly(),
    obj_label: z.array(z.string().min(1)).min(1).readonly(),
  })
  .strict()
  .readonly()

export const AihubAnnotationSchema = z
  .object({
    videos: z.array(VideoSchema).min(1).readonly(),
    annotations: z
      .object({
        event_class: z.string().min(1),
        question: z.string().min(1),
        caption: z.record(ViewKeySchema, CaptionSchema),
        answer: z.string().min(1),
        evidence: z.record(ViewKeySchema, EvidenceSchema),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly()

export type AihubAnnotation = Readonly<z.infer<typeof AihubAnnotationSchema>>
type AihubCaption = Readonly<z.infer<typeof CaptionSchema>>

export type LightweightSignal =
  | "bbox_motion"
  | "distance_proxy"
  | "zone_crossing"
  | "interaction_candidate"
  | "caption_action"
  | "camera_agreement"

export type AihubViewSemantic = {
  readonly view: "c1" | "c2"
  readonly camera: string
  readonly frameRange: readonly [number, number]
  readonly durationSeconds: number
  readonly direction: string
  readonly distanceTrend: string
  readonly zonePath: readonly string[]
  readonly actionCandidates: readonly string[]
  readonly interaction: string
  readonly confidence: number
  readonly signals: readonly LightweightSignal[]
  readonly summary: string
}

export type AihubSemanticReport = {
  readonly eventId: string
  readonly eventClass: string
  readonly cameraCount: number
  readonly riskLevel: "watch" | "review" | "high"
  readonly sharedMemorySummary: string
  readonly viewSemantics: readonly AihubViewSemantic[]
  readonly phaseTimeline: readonly string[]
  readonly commanderBrief: string
}

type Observation = {
  readonly frameId: number
  readonly centerX: number
  readonly centerY: number
  readonly area: number
  readonly zone: string
}

const FPS = 30

const observationOf = (
  frameId: number,
  bbox: readonly [number, number, number, number],
): Observation => {
  const [x1, y1, x2, y2] = bbox
  const centerX = (x1 + x2) / 2
  const centerY = (y1 + y2) / 2
  const area = Math.max(1, (x2 - x1) * (y2 - y1))
  const horizontal = centerX < 768 ? "left" : centerX > 1_152 ? "right" : "center"
  const depth = centerY < 360 ? "far" : centerY > 720 ? "near" : "mid"
  return { frameId, centerX, centerY, area, zone: `${depth}-${horizontal}` }
}

const compactPath = (zones: readonly string[]): readonly string[] =>
  zones.filter((zone, index) => index === 0 || zone !== zones[index - 1])

const directionOf = (observations: readonly Observation[]): string => {
  const first = observations[0]
  const last = observations.at(-1)
  if (first === undefined || last === undefined) {
    return "stationary"
  }
  const deltaX = last.centerX - first.centerX
  const deltaY = last.centerY - first.centerY
  if (Math.abs(deltaX) >= Math.abs(deltaY) && Math.abs(deltaX) > 40) {
    return deltaX > 0 ? "moving_right" : "moving_left"
  }
  if (Math.abs(deltaY) > 40) {
    return deltaY > 0 ? "moving_down" : "moving_up"
  }
  return "stationary"
}

const distanceTrendOf = (observations: readonly Observation[]): string => {
  const first = observations[0]
  const last = observations.at(-1)
  if (first === undefined || last === undefined) {
    return "unknown"
  }
  const ratio = last.area / first.area
  if (ratio > 1.18) {
    return "approaching_camera"
  }
  if (ratio < 0.82) {
    return "receding_from_camera"
  }
  return "stable_distance"
}

const keywordAction = (text: string): string => {
  if (/휘두르|가격|때리|발로 차|공격/.test(text)) {
    return "strike_or_kick_candidate"
  }
  if (/밀치|붙잡|감싸|잡고/.test(text)) {
    return "grapple_or_push_candidate"
  }
  if (/쓰러|넘어|몸이 기울/.test(text)) {
    return "fall_or_stumble_candidate"
  }
  if (/이동|걸어|방향/.test(text)) {
    return "movement_candidate"
  }
  if (/피해|움츠/.test(text)) {
    return "evasive_motion_candidate"
  }
  return "context_change_candidate"
}

const actionCandidatesOf = (caption: AihubCaption): readonly string[] => [
  ...new Set(Object.values(caption.cot).map(keywordAction)),
]

const confidenceOf = (signals: readonly LightweightSignal[], viewCount: number): number =>
  Number(Math.min(0.98, 0.48 + signals.length * 0.08 + viewCount * 0.06).toFixed(2))

const buildViewSemantic = (view: "c1" | "c2", annotation: AihubAnnotation): AihubViewSemantic => {
  const evidence = annotation.annotations.evidence[view]
  const caption = annotation.annotations.caption[view]
  const video = annotation.videos.find((item) => item.view === view)
  if (evidence === undefined || caption === undefined || video === undefined) {
    throw new Error(`AI Hub annotation is missing ${view}`)
  }
  const fallbackBbox = evidence.obj_bbox[0]
  if (fallbackBbox === undefined) {
    throw new Error(`AI Hub annotation is missing ${view} bbox evidence`)
  }
  const observations = evidence.frame_id.map((frameId, index) => {
    const bbox = evidence.obj_bbox[index] ?? fallbackBbox
    return observationOf(frameId, bbox)
  })
  const frameStart = evidence.frame_id[0] ?? 0
  const frameEnd = evidence.frame_id.at(-1) ?? frameStart
  const zonePath = compactPath(observations.map((observation) => observation.zone))
  const signals: readonly LightweightSignal[] = [
    "bbox_motion",
    "distance_proxy",
    ...(zonePath.length > 1 ? ["zone_crossing" as const] : []),
    "interaction_candidate",
    "caption_action",
  ]
  const actionCandidates = actionCandidatesOf(caption)
  return {
    view,
    camera: video.cctv_camera,
    frameRange: [frameStart, frameEnd],
    durationSeconds: Number(((frameEnd - frameStart) / FPS).toFixed(1)),
    direction: directionOf(observations),
    distanceTrend: distanceTrendOf(observations),
    zonePath,
    actionCandidates,
    interaction: annotation.annotations.event_class.includes("싸움")
      ? "physical_contact_candidate"
      : "multi_object_interaction_candidate",
    confidence: confidenceOf(signals, annotation.videos.length),
    signals,
    summary: `${view}: ${directionOf(observations)}, ${distanceTrendOf(observations)}, ${actionCandidates.join(", ")}`,
  }
}

export const buildAihubSemanticReport = (
  eventId: string,
  annotationInput: unknown,
): AihubSemanticReport => {
  const annotation = AihubAnnotationSchema.parse(annotationInput)
  const viewSemantics = ViewKeySchema.options.map((view) => buildViewSemantic(view, annotation))
  const phaseTimeline = Object.entries(annotation.annotations.caption.c1?.cot ?? {}).map(
    ([step, summary]) => `${step}: ${summary}`,
  )
  const cameraAgreement =
    viewSemantics.length >= 2
      ? "두 CCTV가 동일 사건 class와 연속 프레임 근거를 공유합니다."
      : "단일 CCTV 근거만 존재합니다."
  const riskLevel = viewSemantics.some((view) => view.interaction === "physical_contact_candidate")
    ? "high"
    : "review"
  return {
    eventId,
    eventClass: annotation.annotations.event_class,
    cameraCount: annotation.videos.length,
    riskLevel,
    sharedMemorySummary: cameraAgreement,
    viewSemantics: viewSemantics.map((view) => ({
      ...view,
      signals: [...view.signals, "camera_agreement"],
      confidence: confidenceOf([...view.signals, "camera_agreement"], annotation.videos.length),
    })),
    phaseTimeline,
    commanderBrief: `${eventId}: ${annotation.annotations.event_class} 후보. ${cameraAgreement} ${viewSemantics
      .map((view) => `${view.view} ${view.direction}/${view.distanceTrend}`)
      .join("; ")}`,
  }
}
