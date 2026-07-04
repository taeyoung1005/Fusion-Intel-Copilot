import type { AlertTone, Citation, EvidenceClip, Incident, ResponseGate } from "./copData"
import type { WindowEntry } from "./evidenceWindowSummary"

export type RelationshipGraphNodeKind =
  | "incident"
  | "camera"
  | "track"
  | "detection"
  | "citation"
  | "response"

export type RelationshipGraphNode = {
  readonly id: string
  readonly kind: RelationshipGraphNodeKind
  readonly label: string
  readonly detail: string
  readonly tone: AlertTone
  readonly incidentId?: string
  readonly cameraId?: string
  readonly clipId?: string
  readonly citationId?: string
  readonly responseGateId?: string
}

export type RelationshipGraphEdge = {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly label: string
}

export type EvidenceRelationshipGraph = {
  readonly nodes: readonly RelationshipGraphNode[]
  readonly edges: readonly RelationshipGraphEdge[]
}

export type EvidenceRelationshipGraphInput = {
  readonly incidents: readonly Incident[]
  readonly citations: readonly Citation[]
  readonly evidence: readonly EvidenceClip[]
  readonly windowBuffer: ReadonlyMap<string, readonly WindowEntry[]>
  readonly responseGates: readonly ResponseGate[]
  readonly selectedIncidentId: string
}

const SOURCE_LABEL: Record<EvidenceClip["source"], string> = {
  mobile: "UPLINK",
  vision: "DETR",
  correlation: "CORR",
} as const

const isRealIncident = (incident: Incident): boolean => incident.id !== "inc-standby"

const incidentTone = (incident: Incident): AlertTone =>
  incident.tone === "WATCH" ? "watch" : "normal"

const graphId = (kind: RelationshipGraphNodeKind, id: string): string => `${kind}:${id}`

const edgeId = (from: string, to: string): string => `${from}->${to}`

const latestClipFirst = (clips: readonly EvidenceClip[]): readonly EvidenceClip[] =>
  [...clips].sort((left, right) => right.time.localeCompare(left.time))

const trackDetail = (
  cameraId: string,
  clips: readonly EvidenceClip[],
  entries: readonly WindowEntry[] | undefined,
): string => {
  const firstTime = entries?.[0]?.clip.time ?? clips.at(-1)?.time ?? "--:--:--"
  const lastTime = entries?.at(-1)?.clip.time ?? clips[0]?.time ?? "--:--:--"
  const count = entries?.length ?? clips.length
  return `${cameraId} · ${count}건 · ${firstTime}~${lastTime}`
}

const citationForClip = (
  citations: readonly Citation[],
  clip: EvidenceClip,
): Citation | undefined => citations.find((citation) => citation.id === `cite-${clip.id}`)

export const buildEvidenceRelationshipGraph = ({
  incidents,
  citations,
  evidence,
  windowBuffer,
  responseGates,
  selectedIncidentId,
}: EvidenceRelationshipGraphInput): EvidenceRelationshipGraph => {
  if (evidence.length === 0 || incidents.every((incident) => !isRealIncident(incident))) {
    return { nodes: [], edges: [] }
  }

  const nodes: RelationshipGraphNode[] = []
  const edges: RelationshipGraphEdge[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()
  const evidenceByCamera = new Map<string, EvidenceClip[]>()

  for (const clip of evidence) {
    const clips = evidenceByCamera.get(clip.camera) ?? []
    clips.push(clip)
    evidenceByCamera.set(clip.camera, clips)
  }

  const addNode = (node: RelationshipGraphNode): void => {
    if (seenNodes.has(node.id)) {
      return
    }
    seenNodes.add(node.id)
    nodes.push(node)
  }

  const addEdge = (from: string, to: string, label: string): void => {
    const id = edgeId(from, to)
    if (seenEdges.has(id)) {
      return
    }
    seenEdges.add(id)
    edges.push({ id, from, to, label })
  }

  for (const incident of incidents) {
    if (!isRealIncident(incident)) {
      continue
    }
    const incidentId = graphId("incident", incident.id)
    const cameraId = graphId("camera", incident.zone)
    const clips = latestClipFirst(evidenceByCamera.get(incident.zone) ?? [])

    addNode({
      id: incidentId,
      kind: "incident",
      label: incident.id,
      detail: `${incident.time} · ${incident.title}`,
      tone: incidentTone(incident),
      incidentId: incident.id,
      cameraId: incident.zone,
    })
    addNode({
      id: cameraId,
      kind: "camera",
      label: incident.zone,
      detail: incident.meta,
      tone: incidentTone(incident),
      incidentId: incident.id,
      cameraId: incident.zone,
    })
    addEdge(incidentId, cameraId, "incident-camera")

    if (clips.length > 0) {
      const firstClip = clips[0]
      const trackId = graphId("track", incident.zone)
      if (firstClip !== undefined) {
        addNode({
          id: trackId,
          kind: "track",
          label: `track-${incident.zone}`,
          detail: trackDetail(incident.zone, clips, windowBuffer.get(incident.zone)),
          tone: incidentTone(incident),
          incidentId: incident.id,
          cameraId: incident.zone,
          clipId: firstClip.id,
        })
        addEdge(cameraId, trackId, "camera-track")
      }

      for (const clip of clips) {
        const detectionId = graphId("detection", clip.id)
        const citation = citationForClip(citations, clip)
        addNode({
          id: detectionId,
          kind: "detection",
          label: clip.id,
          detail: `${SOURCE_LABEL[clip.source]} · ${clip.time} · ${clip.detail}`,
          tone: clip.tone,
          incidentId: incident.id,
          cameraId: clip.camera,
          clipId: clip.id,
          ...(citation !== undefined ? { citationId: citation.id } : {}),
        })
        addEdge(trackId, detectionId, "track-detection")

        if (citation !== undefined) {
          const citationId = graphId("citation", citation.id)
          addNode({
            id: citationId,
            kind: "citation",
            label: citation.id,
            detail: citation.label,
            tone: clip.tone,
            incidentId: incident.id,
            cameraId: clip.camera,
            clipId: clip.id,
            citationId: citation.id,
          })
          addEdge(detectionId, citationId, "detection-citation")
        }
      }
    }

    if (incident.id === selectedIncidentId && responseGates.length > 0) {
      const responseId = graphId("response", incident.id)
      const pendingCount = responseGates.filter((gate) => gate.initial === "PENDING").length
      const passCount = responseGates.length - pendingCount
      const activeGate =
        responseGates.find((gate) => gate.initial === "PENDING") ?? responseGates[0]
      addNode({
        id: responseId,
        kind: "response",
        label: `response-${incident.id}`,
        detail: `${passCount} PASS · ${pendingCount} PENDING`,
        tone: pendingCount > 0 ? "watch" : "normal",
        incidentId: incident.id,
        cameraId: incident.zone,
        ...(activeGate !== undefined ? { responseGateId: activeGate.id } : {}),
      })
      addEdge(incidentId, responseId, "incident-response")
    }
  }

  return { nodes, edges }
}
