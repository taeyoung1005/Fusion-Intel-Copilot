import { useEffect, useState } from "react"
import { type WeatherNow, fetchWeather } from "./weatherData"

const REFRESH_MS = 10 * 60 * 1000

// Live weather for the basemap coordinate, refreshed every 10 minutes so the
// map's weather overlay tracks today's real conditions. Returns null until the
// first successful fetch (or if the service is unreachable).
export const useWeather = (): WeatherNow | null => {
  const [weather, setWeather] = useState<WeatherNow | null>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const load = (): void => {
      fetchWeather(controller.signal)
        .then((result) => {
          if (active) {
            setWeather(result)
          }
        })
        .catch(() => {
          // Unreachable / offline: leave the overlay in its last known state.
        })
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      active = false
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])

  return weather
}
