import { GitBranch, MousePointer2 } from "lucide-react"
import { type ReactElement, useMemo, useState } from "react"
import type {
  EvidenceRelationshipGraph,
  RelationshipGraphNode,
  RelationshipGraphNodeKind,
} from "./relationshipGraph"

type RelationshipGraphPanelProps = {
  readonly graph: EvidenceRelationshipGraph
  readonly selectedIncidentId: string
  readonly selectedCameraId: string
  readonly selectedClipId: string
  readonly selectedCitationId: string
  readonly onSelectNode: (node: RelationshipGraphNode) => void
}

type ActiveNodeContext = {
  readonly selectedIncidentId: string
  readonly selectedCameraId: string
  readonly selectedClipId: string
  readonly selectedCitationId: string
}

const KIND_LABEL: Record<RelationshipGraphNodeKind, string> = {
  incident: "INCIDENT",
  camera: "CAMERA",
  track: "TRACK",
  detection: "DETR",
  citation: "CITE",
  response: "RESPONSE",
} as const

const isActiveNode = (node: RelationshipGraphNode, context: ActiveNodeContext): boolean =>
  node.incidentId === context.selectedIncidentId ||
  node.cameraId === context.selectedCameraId ||
  node.clipId === context.selectedClipId ||
  node.citationId === context.selectedCitationId

export function RelationshipGraphPanel({
  graph,
  selectedIncidentId,
  selectedCameraId,
  selectedClipId,
  selectedCitationId,
  onSelectNode,
}: RelationshipGraphPanelProps): ReactElement {
  const [showAll, setShowAll] = useState(false)
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const activeContext = { selectedIncidentId, selectedCameraId, selectedClipId, selectedCitationId }
  const nodeLabel = (nodeId: string): string => nodeById.get(nodeId)?.label ?? nodeId

  // Every incident repeats the same 4-5 node chain (incident->camera->track
  // ->detection->citation), so showing all of them at once is mostly
  // repetition of the same shape — default to just the incident the operator
  // is already looking at, with an explicit toggle back to everything.
  const hasSelectedIncidentNodes = graph.nodes.some(
    (node) => node.incidentId === selectedIncidentId,
  )
  const scoped = !showAll && hasSelectedIncidentNodes
  const visibleNodes = useMemo(
    () =>
      scoped ? graph.nodes.filter((node) => node.incidentId === selectedIncidentId) : graph.nodes,
    [graph.nodes, scoped, selectedIncidentId],
  )
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () =>
      scoped
        ? graph.edges.filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))
        : graph.edges,
    [graph.edges, scoped, visibleNodeIds],
  )

  return (
    <section
      id="cop-relationship-graph-panel"
      className="cop-panel cop-relationship"
      aria-labelledby="cop-relationship-title"
    >
      <div className="cop-panel-head">
        <h2 id="cop-relationship-title">
          RELATION GRAPH
          <span className="cop-count-badge">{visibleNodes.length}</span>
        </h2>
        <span className="cop-relationship-stat" aria-label="관계 엣지 수">
          <GitBranch size={13} aria-hidden="true" />
          {visibleEdges.length}E
        </span>
      </div>

      {graph.nodes.length === 0 ? (
        <p className="cop-relationship-empty">
          관계 그래프 없음: 합성 CCTV·DETR 증거가 수집되면 사건, 카메라, 탐지, 대응 노드가
          표시됩니다.
        </p>
      ) : (
        <div className="cop-relationship-layout">
          {hasSelectedIncidentNodes && (
            <button
              type="button"
              className="cop-link-button cop-relationship-toggle"
              onClick={() => setShowAll((previous) => !previous)}
            >
              {showAll ? "선택 사건만 보기" : `전체 ${graph.nodes.length}건 보기`}
            </button>
          )}
          <div className="cop-relationship-nodes" aria-label="관계 그래프 노드">
            {visibleNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`cop-relationship-node kind-${node.kind} tone-${node.tone}${
                  isActiveNode(node, activeContext) ? " active" : ""
                }`}
                aria-pressed={isActiveNode(node, activeContext)}
                aria-label={`${node.label} 관계 노드 선택`}
                onClick={() => onSelectNode(node)}
              >
                <span className="cop-relationship-kind">
                  <MousePointer2 size={11} aria-hidden="true" />
                  {KIND_LABEL[node.kind]}
                </span>
                <strong>{node.label}</strong>
                <small>{node.detail}</small>
              </button>
            ))}
          </div>

          <ol className="cop-relationship-edges" aria-label="관계 그래프 엣지">
            {visibleEdges.map((edge) => (
              <li key={edge.id}>
                <span>{edge.label}</span>
                <code>
                  {nodeLabel(edge.from)} {"->"} {nodeLabel(edge.to)}
                </code>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
