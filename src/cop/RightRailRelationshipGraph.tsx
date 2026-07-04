import { GitBranch, MousePointer2 } from "lucide-react"
import type { ReactElement } from "react"
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
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const activeContext = { selectedIncidentId, selectedCameraId, selectedClipId, selectedCitationId }
  const nodeLabel = (nodeId: string): string => nodeById.get(nodeId)?.label ?? nodeId

  return (
    <section
      id="cop-relationship-graph-panel"
      className="cop-panel cop-relationship"
      aria-labelledby="cop-relationship-title"
    >
      <div className="cop-panel-head">
        <h2 id="cop-relationship-title">
          RELATION GRAPH
          <span className="cop-count-badge">{graph.nodes.length}</span>
        </h2>
        <span className="cop-relationship-stat" aria-label="관계 엣지 수">
          <GitBranch size={13} aria-hidden="true" />
          {graph.edges.length}E
        </span>
      </div>

      {graph.nodes.length === 0 ? (
        <p className="cop-relationship-empty">
          관계 그래프 없음: 합성 CCTV·DETR 증거가 수집되면 사건, 카메라, 탐지, 대응 노드가
          표시됩니다.
        </p>
      ) : (
        <div className="cop-relationship-layout">
          <div className="cop-relationship-nodes" aria-label="관계 그래프 노드">
            {graph.nodes.map((node) => (
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
            {graph.edges.map((edge) => (
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
