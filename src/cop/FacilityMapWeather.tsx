import {
  ArrowUp,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Sun,
  Wind,
} from "lucide-react"
import { type ReactElement, useEffect, useRef } from "react"
import type { WeatherCondition, WeatherNow } from "./weatherData"

const CONDITION_ICON: Record<WeatherCondition, typeof Sun> = {
  clear: Sun,
  clouds: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
}

type Particle = { x: number; y: number; z: number; s: number }

const rand = (max: number): number => Math.random() * max

// Canvas weather simulation: precipitation and wind streaks move in the REAL
// wind direction so the operator can see which way weather is coming from.
export function WeatherCanvas({ weather }: { readonly weather: WeatherNow }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d") ?? null
    const parent = canvas?.parentElement ?? null
    if (canvas === null || context === null || parent === null) {
      return
    }

    const size = (): void => {
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
    }
    size()
    const resize = new ResizeObserver(size)
    resize.observe(parent)

    // Wind FROM windFromDeg → blowing TOWARD (from + 180). Screen: 0°=up(-y).
    const towardRad = (((weather.windFromDeg + 180) % 360) * Math.PI) / 180
    const windUnitX = Math.sin(towardRad)
    const windUnitY = -Math.cos(towardRad)
    const windPx = 0.6 + weather.windKph * 0.16

    const condition = weather.condition
    const precip = condition === "rain" || condition === "thunder" || condition === "snow"
    const isSnow = condition === "snow"
    const dropCount = precip ? (isSnow ? 150 : 260) : 0
    const streakCount = 26
    const fogCount = condition === "fog" ? 18 : 0

    const spawn = (): Particle => ({
      x: rand(canvas.width),
      y: rand(canvas.height),
      z: 0.5 + rand(1),
      s: rand(1),
    })
    const drops = Array.from({ length: dropCount }, spawn)
    const streaks = Array.from({ length: streakCount }, spawn)
    const fog = Array.from({ length: fogCount }, spawn)

    let raf = 0
    let frame = 0
    const step = (): void => {
      frame += 1
      context.clearRect(0, 0, canvas.width, canvas.height)

      // Faint wind-flow streaks (every condition) — the direction cue.
      context.strokeStyle = "rgba(150,180,205,0.16)"
      context.lineWidth = 1
      for (const p of streaks) {
        const vx = windUnitX * (1.4 + windPx * 1.8) * p.z
        const vy = windUnitY * (1.4 + windPx * 1.8) * p.z
        context.beginPath()
        context.moveTo(p.x, p.y)
        context.lineTo(p.x - vx * 5, p.y - vy * 5)
        context.stroke()
        p.x += vx
        p.y += vy
        if (p.x < -20 || p.x > canvas.width + 20 || p.y < -20 || p.y > canvas.height + 20) {
          p.x = rand(canvas.width)
          p.y = rand(canvas.height)
        }
      }

      // Fog: drifting translucent blobs.
      for (const p of fog) {
        context.fillStyle = "rgba(210,220,228,0.05)"
        context.beginPath()
        context.arc(p.x, p.y, 60 + p.s * 60, 0, Math.PI * 2)
        context.fill()
        p.x += windUnitX * windPx * 0.4
        p.y += windUnitY * windPx * 0.4
        if (p.x < -140) p.x = canvas.width + 140
        if (p.x > canvas.width + 140) p.x = -140
        if (p.y < -140) p.y = canvas.height + 140
        if (p.y > canvas.height + 140) p.y = -140
      }

      // Precipitation drifting in the wind direction.
      for (const p of drops) {
        if (isSnow) {
          const vx = windUnitX * (0.6 + windPx) + Math.sin((frame + p.x) * 0.03) * 0.6
          const vy = 0.9 + windPx * 0.2 + p.z
          context.fillStyle = "rgba(255,255,255,0.85)"
          context.beginPath()
          context.arc(p.x, p.y, 1.1 + p.z, 0, Math.PI * 2)
          context.fill()
          p.x += vx
          p.y += vy
        } else {
          const vx = windUnitX * (1.5 + windPx * 1.6) * p.z
          const vy = 8 + p.z * 5 + windUnitY * windPx * 0.6
          context.strokeStyle = "rgba(174,198,224,0.5)"
          context.lineWidth = 1.1
          context.beginPath()
          context.moveTo(p.x, p.y)
          context.lineTo(p.x - vx * 1.4, p.y - vy * 1.4)
          context.stroke()
          p.x += vx
          p.y += vy
        }
        if (p.y > canvas.height + 12 || p.x < -12 || p.x > canvas.width + 12) {
          p.x = rand(canvas.width)
          p.y = -12
        }
      }

      // Thunder: occasional lightning flash.
      if (condition === "thunder" && frame % 150 < 3) {
        context.fillStyle = "rgba(220,232,255,0.28)"
        context.fillRect(0, 0, canvas.width, canvas.height)
      }

      raf = window.requestAnimationFrame(step)
    }
    raf = window.requestAnimationFrame(step)

    return () => {
      window.cancelAnimationFrame(raf)
      resize.disconnect()
    }
  }, [weather])

  return (
    <canvas ref={canvasRef} className="cop-map-weather-canvas" data-condition={weather.condition} />
  )
}

export function WeatherReadout({
  weather,
}: {
  readonly weather: WeatherNow | null
}): ReactElement {
  if (weather === null) {
    return (
      <div className="cop-map-weather" aria-label="실시간 날씨">
        <span className="cop-map-weather-wait">실시간 날씨 관측 대기</span>
      </div>
    )
  }
  const Icon = CONDITION_ICON[weather.condition]
  // Arrow points the way the wind blows toward (from + 180).
  const towardDeg = (weather.windFromDeg + 180) % 360
  return (
    <div className="cop-map-weather" aria-label="실시간 날씨">
      <span className="cop-map-weather-main">
        <Icon size={15} aria-hidden="true" />
        <strong>{weather.tempC}°C</strong>
        <span>{weather.label}</span>
      </span>
      <span className="cop-map-weather-meta">
        <span className="cop-map-weather-wind" aria-label={`${weather.windCompass} 풍향`}>
          <ArrowUp size={12} aria-hidden="true" style={{ transform: `rotate(${towardDeg}deg)` }} />
          {weather.windCompass}
        </span>
        <span>
          <Wind size={11} aria-hidden="true" />
          {weather.windKph}km/h
        </span>
        <span>
          <Droplets size={11} aria-hidden="true" />
          {weather.humidity}%
        </span>
        <span>강수 {weather.precipMm}mm</span>
      </span>
    </div>
  )
}
