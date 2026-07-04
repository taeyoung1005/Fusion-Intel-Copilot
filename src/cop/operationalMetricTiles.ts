import { cameraConnectionState } from "./cameraConnectionStatus"
import type { EvidenceClip } from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import type { WindowEntry } from "./evidenceWindowSummary"

export type OperationalMetricTone = "normal" | "watch" | "alert" | "uncertain"

export type OperationalMetricTile = {
  readonly id: "coverage" | "falsePositive" | "detectionLatency" | "averageConfidence"
  readonly label: string
  readonly caption: string
  readonly value: string
  readonly detail: string
  readonly tone: OperationalMetricTone
  readonly bar?: number
}

type OperationalMetricInput = {
  readonly cameras: readonly DynamicCameraRecord[]
  readonly evidence: readonly EvidenceClip[]
  readonly windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>
}

const EMPTY_VALUE = "—"

const percentOf = (count: number, total: number): number => Math.round((count / total) * 100)

const average = (values: readonly number[]): number | undefined => {
  if (values.length === 0) {
    return undefined
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const percentTone = (percent: number): OperationalMetricTone => {
  if (percent >= 80) {
    return "normal"
  }
  if (percent >= 50) {
    return "watch"
  }
  return "alert"
}

const falsePositiveTone = (percent: number): OperationalMetricTone => {
  if (percent <= 10) {
    return "normal"
  }
  if (percent <= 25) {
    return "watch"
  }
  return "alert"
}

const latencyTone = (latencyMs: number): OperationalMetricTone => {
  if (latencyMs <= 1_500) {
    return "normal"
  }
  if (latencyMs <= 3_500) {
    return "watch"
  }
  return "alert"
}

const confidenceTone = (percent: number): OperationalMetricTone => {
  if (percent >= 75) {
    return "normal"
  }
  if (percent >= 55) {
    return "watch"
  }
  return "alert"
}

const formatLatency = (latencyMs: number): string => {
  if (latencyMs < 1_000) {
    return `${Math.round(latencyMs)}ms`
  }
  return `${Math.round((latencyMs / 1_000) * 10) / 10}s`
}

const detectionLatencies = (
  cameras: readonly DynamicCameraRecord[],
  windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>,
): readonly number[] => {
  const latencies: number[] = []
  for (const [cameraId, entries] of windowBuffer) {
    const camera = cameras.find((record) => record.id === cameraId)
    const frameReceivedAtMs = Date.parse(camera?.lastFrameAt ?? "")
    if (!Number.isFinite(frameReceivedAtMs)) {
      continue
    }
    for (const entry of entries) {
      if (entry.clip.source !== "vision") {
        continue
      }
      const deltaMs = entry.observedAtMs - frameReceivedAtMs
      if (Number.isFinite(deltaMs) && deltaMs >= 0) {
        latencies.push(deltaMs)
      }
    }
  }
  return latencies
}

export const buildOperationalMetricTiles = ({
  cameras,
  evidence,
  windowBuffer,
}: OperationalMetricInput): readonly OperationalMetricTile[] => {
  const liveCameras = cameras.filter((camera) => cameraConnectionState(camera).tone === "live")
  const visionEvidence = evidence.filter((clip) => clip.source === "vision")
  const uncertainEvidence = visionEvidence.filter((clip) => clip.tone === "uncertain")
  const confidenceAverage = average(visionEvidence.map((clip) => clip.confidencePct))
  const latencyAverage = average(detectionLatencies(cameras, windowBuffer))

  const coveragePercent =
    cameras.length === 0 ? undefined : percentOf(liveCameras.length, cameras.length)
  const falsePositivePercent =
    visionEvidence.length === 0
      ? undefined
      : percentOf(uncertainEvidence.length, visionEvidence.length)

  return [
    {
      id: "coverage",
      label: "커버리지율",
      caption: "FRAME UPLINK",
      value: coveragePercent === undefined ? EMPTY_VALUE : `${coveragePercent}%`,
      detail:
        coveragePercent === undefined
          ? "카메라 없음"
          : `프레임 업링크 ${liveCameras.length}/${cameras.length}`,
      tone: coveragePercent === undefined ? "uncertain" : percentTone(coveragePercent),
      ...(coveragePercent !== undefined ? { bar: coveragePercent } : {}),
    },
    {
      id: "falsePositive",
      label: "오탐 후보율",
      caption: "UNCERTAIN TONE",
      value: falsePositivePercent === undefined ? EMPTY_VALUE : `${falsePositivePercent}%`,
      detail:
        falsePositivePercent === undefined
          ? "DETR 증거 없음"
          : `불확실 ${uncertainEvidence.length}/${visionEvidence.length}`,
      tone:
        falsePositivePercent === undefined ? "uncertain" : falsePositiveTone(falsePositivePercent),
      ...(falsePositivePercent !== undefined ? { bar: falsePositivePercent } : {}),
    },
    {
      id: "detectionLatency",
      label: "탐지 지연",
      caption: "FRAME TO EMIT",
      value: latencyAverage === undefined ? EMPTY_VALUE : formatLatency(latencyAverage),
      detail: latencyAverage === undefined ? "수신→탐지 대기" : "수신→탐지 평균",
      tone: latencyAverage === undefined ? "uncertain" : latencyTone(latencyAverage),
    },
    {
      id: "averageConfidence",
      label: "평균 신뢰도",
      caption: "DETR CONF",
      value: confidenceAverage === undefined ? EMPTY_VALUE : `${Math.round(confidenceAverage)}%`,
      detail:
        confidenceAverage === undefined
          ? "DETR 신뢰도 없음"
          : `DETR ${visionEvidence.length}건 평균`,
      tone: confidenceAverage === undefined ? "uncertain" : confidenceTone(confidenceAverage),
      ...(confidenceAverage !== undefined ? { bar: Math.round(confidenceAverage) } : {}),
    },
  ]
}
