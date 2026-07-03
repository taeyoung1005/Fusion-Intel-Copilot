import type {
  Citation,
  CodexMetric,
  EvidenceClip,
  Incident,
  MapEvent,
  MissingContext,
  ResponseGate,
} from "./copData"
import type { DynamicCameraRecord } from "./dynamicMapCamera"
import { mobileCameraConnectionState } from "./mobileCameraStatus"

export type DailyReportRow = { readonly id: string; readonly label: string; readonly value: string }

// Derives the right-rail panels (incidents, citations, Codex metrics) from the
// only real signals the harness has: connected mobile CCTV and DETR detections.
// With nothing connected the panels report a quiet, honest baseline rather than
// fabricated activity.

const STANDBY_INCIDENT: Incident = {
  id: "inc-standby",
  tone: "NORMAL",
  zone: "PERIMETER",
  title: "활성 사건 없음",
  meta: "실시간 탐지·업링크 대기",
  time: "--:--:--",
  confidence: 0,
}

const toneRank = (tone: EvidenceClip["tone"]): number => {
  if (tone === "alert") {
    return 3
  }
  if (tone === "watch") {
    return 2
  }
  return 1
}

export const buildIncidents = (
  cameras: readonly DynamicCameraRecord[],
  evidence: readonly EvidenceClip[],
): readonly Incident[] => {
  const byCamera = new Map<string, EvidenceClip[]>()
  for (const clip of evidence) {
    const bucket = byCamera.get(clip.camera) ?? []
    bucket.push(clip)
    byCamera.set(clip.camera, bucket)
  }

  const incidents: Incident[] = []
  for (const [camera, clips] of byCamera) {
    const worst = clips.reduce((max, clip) => Math.max(max, toneRank(clip.tone)), 1)
    const latest = clips[0]
    const cameraRecord = cameras.find((record) => record.id === camera)
    incidents.push({
      id: `inc-${camera}`,
      tone: worst >= 2 ? "WATCH" : "NORMAL",
      zone: camera,
      title: latest?.label ?? "라이브 업링크",
      meta: cameraRecord?.label ?? `증거 ${clips.length}건`,
      time: latest?.time ?? "--:--:--",
      confidence: Math.max(...clips.map((clip) => clip.confidencePct)),
    })
  }

  incidents.sort((left, right) => {
    if (left.tone !== right.tone) {
      return left.tone === "WATCH" ? -1 : 1
    }
    return right.confidence - left.confidence
  })

  return incidents.length > 0 ? incidents : [STANDBY_INCIDENT]
}

// Real DETR detections surface on the facility map as markers anchored to the
// camera node that produced them. Live mobile frames alone are not "events", so
// only vision detections place a marker; with none the map carries no markers.
export const buildDetectionMarkers = (
  cameras: readonly DynamicCameraRecord[],
  evidence: readonly EvidenceClip[],
): readonly MapEvent[] => {
  const markers: MapEvent[] = []
  const seen = new Set<string>()
  for (const clip of evidence) {
    if (clip.source !== "vision" || seen.has(clip.camera)) {
      continue
    }
    const record = cameras.find((camera) => camera.id === clip.camera)
    if (record === undefined) {
      continue
    }
    seen.add(clip.camera)
    markers.push({
      id: `mk-${clip.camera}`,
      time: clip.time,
      tone: clip.tone === "alert" ? "alert" : "watch",
      point: record.camera.node,
    })
  }
  return markers
}

// Real data gaps: cameras registered on the map that have not uplinked a frame
// yet. With every camera streaming (or none connected) there is no missing context.
export const buildMissingContext = (
  cameras: readonly DynamicCameraRecord[],
): readonly MissingContext[] =>
  cameras
    .filter((camera) => mobileCameraConnectionState(camera).tone === "waiting")
    .map((camera) => ({
      id: `miss-${camera.id}`,
      camera: camera.id,
      reason: "업링크 프레임 대기 (No Uplink Frame)",
      since: "연결 직후",
    }))

// The human-confirmation gate reflects the SELECTED incident's real readiness:
// a step is pre-PASSed when the evidence already satisfies it, and left PENDING
// for the operator to confirm otherwise. Switching incidents recomputes it.
export const buildResponseGates = (
  incident: Incident,
  evidence: readonly EvidenceClip[],
  missingContext: readonly MissingContext[],
): readonly ResponseGate[] => {
  const cameraEvidence = evidence.filter((clip) => clip.camera === incident.zone)
  const hasEvidence = cameraEvidence.length > 0
  const hasDetection = cameraEvidence.some((clip) => clip.source === "vision")
  const hasGap = missingContext.some((item) => item.camera === incident.zone)
  const pass = (ready: boolean): "PASS" | "PENDING" => (ready ? "PASS" : "PENDING")
  return [
    { id: "gate-fact", label: "이벤트 사실 확인", initial: pass(hasEvidence) },
    { id: "gate-context", label: "맥락 검토 완료", initial: pass(!hasGap) },
    { id: "gate-data", label: "추가 데이터 검토", initial: pass(hasDetection) },
    { id: "gate-assess", label: "상황 평가 완료", initial: pass(incident.tone === "NORMAL") },
  ]
}

// The report period spans the real evidence window; the date is stamped by the
// caller at render time (kept out of this pure function).
export const buildDailyReportPeriod = (evidence: readonly EvidenceClip[]): string => {
  const times = evidence
    .map((clip) => clip.time)
    .filter((time) => /^\d{2}:\d{2}:\d{2}$/.test(time))
    .sort()
  const first = times[0]
  const last = times.at(-1)
  if (first === undefined || last === undefined) {
    return "실시간 대기"
  }
  return first === last ? first : `${first} ~ ${last}`
}

export const buildDailyReportRows = (
  evidence: readonly EvidenceClip[],
): readonly DailyReportRow[] => {
  const count = (predicate: (clip: EvidenceClip) => boolean): string =>
    String(evidence.filter(predicate).length)
  return [
    { id: "total", label: "TOTAL EVENTS", value: String(evidence.length) },
    { id: "watch", label: "WATCH EVENTS", value: count((clip) => clip.tone === "watch") },
    { id: "alert", label: "ALERT EVENTS", value: count((clip) => clip.tone === "alert") },
    { id: "confirmed", label: "CONFIRMED", value: count((clip) => clip.tone === "confirmed") },
  ]
}

export const buildCitations = (evidence: readonly EvidenceClip[]): readonly Citation[] =>
  evidence.map((clip) => ({
    id: `cite-${clip.id}`,
    label: `${clip.camera} · ${clip.source === "vision" ? "DETR" : "UPLINK"}`,
    time: clip.time,
  }))

const ramp = (target: number): readonly number[] => {
  const value = Math.max(0, target)
  return [0.35, 0.5, 0.45, 0.65, 0.82, 1].map((factor) => Math.round(value * factor))
}

export const buildCodexMetrics = (
  cameras: readonly DynamicCameraRecord[],
  evidence: readonly EvidenceClip[],
): readonly CodexMetric[] => {
  const totalFrames = cameras.reduce((sum, camera) => sum + (camera.frameCount ?? 0), 0)
  const visionDetections = evidence.filter((clip) => clip.source === "vision").length
  const objectiveEvidence = totalFrames + visionDetections
  const anomalies = evidence.filter((clip) => clip.tone === "watch" || clip.tone === "alert").length
  const liveCount = cameras.filter(
    (camera) => mobileCameraConnectionState(camera).tone === "live",
  ).length
  const coverage = cameras.length === 0 ? 0 : Math.round((liveCount / cameras.length) * 100)
  const avgConfidence =
    evidence.length === 0
      ? 0
      : Math.round(evidence.reduce((sum, clip) => sum + clip.confidencePct, 0) / evidence.length)

  return [
    {
      id: "evidence",
      ko: "객관적 근거",
      en: "Objective Evidence",
      value: String(objectiveEvidence),
      spark: ramp(objectiveEvidence),
      tone: "normal",
    },
    {
      id: "anomalies",
      ko: "이상 징후 탐지",
      en: "Anomalies Detected",
      value: String(anomalies),
      spark: ramp(anomalies),
      tone: anomalies > 0 ? "watch" : "normal",
    },
    {
      id: "nodes",
      ko: "연결 센서 노드",
      en: "Connected Nodes",
      value: String(cameras.length),
      spark: ramp(cameras.length),
      tone: cameras.length > 0 ? "normal" : "uncertain",
    },
    {
      id: "uptime",
      ko: "커버리지 활용률",
      en: "Coverage Uptime",
      value: `${coverage}%`,
      spark: [],
      bar: coverage,
      tone: coverage >= 50 ? "normal" : "uncertain",
    },
    {
      id: "confidence",
      ko: "종합 신뢰도",
      en: "Confidence Overall",
      value: `${avgConfidence}%`,
      spark: [],
      bar: avgConfidence,
      tone: avgConfidence >= 60 ? "normal" : "watch",
    },
  ]
}
