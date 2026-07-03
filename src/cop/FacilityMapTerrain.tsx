import type { ReactElement } from "react"
import { CLEARINGS, MAP_VIEW, SATELLITE_TILES } from "./copData"

export function SatelliteTiles(): ReactElement {
  return (
    <g>
      {SATELLITE_TILES.map((tile) => (
        <image
          key={tile.id}
          href={tile.href}
          x={tile.x}
          y={tile.y}
          width={tile.size}
          height={tile.size}
          preserveAspectRatio="none"
        />
      ))}
      <rect x={0} y={0} width={MAP_VIEW.width} height={MAP_VIEW.height} fill="rgba(3,12,19,0.44)" />
      <rect
        x={0}
        y={0}
        width={MAP_VIEW.width}
        height={MAP_VIEW.height}
        fill="rgba(16,54,74,0.16)"
      />
      <rect
        x={0}
        y={0}
        width={MAP_VIEW.width}
        height={MAP_VIEW.height}
        fill="url(#cop-sat-vignette)"
      />
    </g>
  )
}

export function SatelliteBase(): ReactElement {
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={MAP_VIEW.width}
        height={MAP_VIEW.height}
        fill="#243528"
        filter="url(#cop-terrain)"
        opacity={0.82}
      />
      <rect
        x={0}
        y={0}
        width={MAP_VIEW.width}
        height={MAP_VIEW.height}
        filter="url(#cop-terrain-grain)"
        opacity={0.5}
      />
      {CLEARINGS.map((points) => (
        <polygon key={points} points={points} fill="rgba(120,118,86,0.12)" />
      ))}
    </g>
  )
}
