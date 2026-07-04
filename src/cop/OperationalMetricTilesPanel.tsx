import type { ReactElement } from "react"
import type { OperationalMetricTile } from "./operationalTelemetry"

type OperationalMetricTilesProps = {
  readonly metrics: readonly OperationalMetricTile[]
}

export function OperationalMetricTiles({ metrics }: OperationalMetricTilesProps): ReactElement {
  return (
    <section
      className="cop-panel cop-operational"
      aria-labelledby="cop-operational-title"
      data-testid="operational-metric-tiles"
    >
      <div className="cop-panel-head">
        <h2 id="cop-operational-title">
          운영 지표 <small>(LIVE OPS METRICS)</small>
        </h2>
      </div>
      <dl className="cop-operational-grid">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className={`cop-operational-tile tone-${metric.tone}`}
            data-metric-id={metric.id}
          >
            <dt>
              <span className="cop-operational-label">{metric.label}</span>
              <span className="cop-operational-caption">{metric.caption}</span>
            </dt>
            <dd>
              <strong className="cop-operational-value">{metric.value}</strong>
              <span className="cop-operational-detail">{metric.detail}</span>
              {metric.bar !== undefined && (
                <span className="cop-operational-meter" aria-hidden="true">
                  <span className={`tone-${metric.tone}`} style={{ width: `${metric.bar}%` }} />
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
