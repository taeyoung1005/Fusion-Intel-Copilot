import type { ReactElement } from "react"

export function MapDefs(): ReactElement {
  return (
    <defs>
      <radialGradient id="cop-map-bg" cx="48%" cy="46%" r="72%">
        <stop offset="0%" stopColor="#0b2230" />
        <stop offset="48%" stopColor="#07151e" />
        <stop offset="100%" stopColor="#030a0e" />
      </radialGradient>
      <radialGradient id="cop-sat-vignette" cx="50%" cy="48%" r="62%">
        <stop offset="58%" stopColor="rgba(0,0,0,0)" />
        <stop offset="100%" stopColor="rgba(2,8,12,0.55)" />
      </radialGradient>
      <filter id="cop-terrain" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.013 0.019"
          numOctaves="4"
          seed="24"
          stitchTiles="stitch"
          result="bump"
        />
        <feDiffuseLighting
          in="bump"
          surfaceScale="2.2"
          diffuseConstant="1.05"
          lightingColor="#3b5142"
          result="land"
        >
          <feDistantLight azimuth="235" elevation="58" />
        </feDiffuseLighting>
        <feColorMatrix
          in="land"
          type="matrix"
          values="0.82 0 0 0 0  0 0.86 0 0 0  0 0 0.78 0 0  0 0 0 1 0"
        />
      </filter>
      <filter id="cop-terrain-grain" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="7" result="g" />
        <feColorMatrix
          in="g"
          type="matrix"
          values="0 0 0 0 0.12  0 0 0 0 0.15  0 0 0 0 0.11  0 0 0 0.5 0"
        />
      </filter>
      <pattern
        id="cop-blind-hatch"
        width="8"
        height="8"
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
      >
        <rect width="8" height="8" fill="rgba(239,68,68,0.12)" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(248,113,113,0.55)" strokeWidth="1.4" />
      </pattern>
      <pattern
        id="cop-weather-hatch"
        width="10"
        height="10"
        patternTransform="rotate(20)"
        patternUnits="userSpaceOnUse"
      >
        <rect width="10" height="10" fill="rgba(89,215,255,0.05)" />
        <line x1="0" y1="0" x2="10" y2="0" stroke="rgba(89,215,255,0.18)" strokeWidth="1" />
      </pattern>
      <marker
        id="cop-handoff-arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,0 L10,5 L0,10 z" fill="#f4c430" />
      </marker>
    </defs>
  )
}
