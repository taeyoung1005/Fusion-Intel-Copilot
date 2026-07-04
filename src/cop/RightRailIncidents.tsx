import { CheckCircle2, ChevronRight } from "lucide-react"
import { type ReactElement, useState } from "react"
import type { Incident } from "./copData"

const TONE_DISPLAY_LABEL: Record<Incident["tone"], string> = {
  normal: "NORMAL",
  uncertain: "UNCERTAIN",
  watch: "WATCH",
  alert: "ALERT",
  confirmed: "CONFIRMED",
}

type ActiveIncidentsProps = {
  readonly incidents: readonly Incident[]
  readonly selectedIncidentId: string
  readonly cameraLabel: string
  readonly onSelectIncident: (incidentId: string) => void
}

export function ActiveIncidents({
  incidents,
  selectedIncidentId,
  cameraLabel,
  onSelectIncident,
}: ActiveIncidentsProps): ReactElement {
  const [showAll, setShowAll] = useState(false)

  return (
    <section
      id="cop-incidents-panel"
      className="cop-panel cop-incidents"
      aria-labelledby="cop-incidents-title"
    >
      <div className="cop-panel-head">
        <h2 id="cop-incidents-title">
          ACTIVE INCIDENTS
          <span className="cop-count-badge">{incidents.length}</span>
        </h2>
        <button
          type="button"
          className="cop-link-button"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? "COLLAPSE" : "VIEW ALL"}
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="cop-incident-list">
        {incidents.map((incident) => (
          <IncidentRow
            key={incident.id}
            incident={incident}
            cameraLabel={cameraLabel}
            selected={incident.id === selectedIncidentId}
            onSelect={() => onSelectIncident(incident.id)}
          />
        ))}
      </div>
      {showAll && (
        <p className="cop-incident-detail" aria-live="polite">
          사건 큐 전체 표시: <strong>{incidents.length}건</strong>. 선택 사건은{" "}
          <strong>{selectedIncidentId}</strong>입니다.
        </p>
      )}
    </section>
  )
}

type IncidentRowProps = {
  readonly incident: Incident
  readonly cameraLabel: string
  readonly selected: boolean
  readonly onSelect: () => void
}

function IncidentRow({
  incident,
  cameraLabel,
  selected,
  onSelect,
}: IncidentRowProps): ReactElement {
  const tone = incident.tone
  const meta = incident.meta.includes("CAM-") ? cameraLabel : incident.meta
  return (
    <button
      type="button"
      className={`cop-incident tone-${tone}${selected ? " selected" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <header>
        <span className="cop-incident-tone">
          <CheckCircle2 size={13} aria-hidden="true" />
          {TONE_DISPLAY_LABEL[incident.tone]}
        </span>
        <time>{incident.time}</time>
      </header>
      <strong className="cop-incident-zone">{incident.zone}</strong>
      <p className="cop-incident-title">{incident.title}</p>
      <p className="cop-incident-meta">{meta}</p>
      <div className="cop-incident-conf">
        <span>CONFIDENCE</span>
        <span className="cop-conf-bar" aria-hidden="true">
          <span style={{ width: `${incident.confidence}%` }} />
        </span>
        <strong>{incident.confidence}%</strong>
      </div>
    </button>
  )
}
