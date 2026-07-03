import { SATELLITE } from "./copData"

// Live weather for the basemap coordinate from Open-Meteo (keyless, CORS-enabled).
// Real current conditions drive the map's animated weather overlay and readout.

export type WeatherCondition = "clear" | "clouds" | "fog" | "rain" | "snow" | "thunder"

export type WeatherNow = {
  readonly tempC: number
  readonly apparentC: number
  readonly humidity: number
  readonly precipMm: number
  readonly windKph: number
  readonly windFromDeg: number
  readonly windCompass: string
  readonly cloudPct: number
  readonly isDay: boolean
  readonly code: number
  readonly condition: WeatherCondition
  readonly label: string
  readonly time: string
}

// Korean 8-point name for the direction the wind blows FROM (기상 관례: 풍향).
const COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"] as const
export const windCompass = (fromDeg: number): string => {
  const index = Math.round((((fromDeg % 360) + 360) % 360) / 45) % 8
  return `${COMPASS[index]}풍`
}

export const codeToCondition = (code: number): WeatherCondition => {
  if (code >= 95) {
    return "thunder"
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return "snow"
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return "rain"
  }
  if (code === 45 || code === 48) {
    return "fog"
  }
  if (code === 2 || code === 3) {
    return "clouds"
  }
  return "clear"
}

const LABELS: Record<number, string> = {
  0: "맑음",
  1: "대체로 맑음",
  2: "부분 흐림",
  3: "흐림",
  45: "안개",
  48: "착빙 안개",
  51: "약한 이슬비",
  53: "이슬비",
  55: "강한 이슬비",
  56: "어는 이슬비",
  57: "어는 이슬비",
  61: "약한 비",
  63: "비",
  65: "강한 비",
  66: "어는 비",
  67: "어는 비",
  71: "약한 눈",
  73: "눈",
  75: "강한 눈",
  77: "싸락눈",
  80: "약한 소나기",
  81: "소나기",
  82: "강한 소나기",
  85: "약한 눈 소나기",
  86: "눈 소나기",
  95: "뇌우",
  96: "우박 뇌우",
  99: "강한 우박 뇌우",
}

export const codeToLabel = (code: number): string => LABELS[code] ?? "관측 대기"

const CurrentSchemaKeys = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "is_day",
  "time",
] as const

type OpenMeteoCurrent = Record<(typeof CurrentSchemaKeys)[number], number | string>

const num = (value: number | string | undefined): number =>
  typeof value === "number" ? value : Number(value ?? 0)

export const parseWeather = (current: OpenMeteoCurrent): WeatherNow => {
  const code = Math.round(num(current.weather_code))
  const windFromDeg = Math.round(num(current.wind_direction_10m))
  return {
    tempC: Math.round(num(current.temperature_2m) * 10) / 10,
    apparentC: Math.round(num(current.apparent_temperature) * 10) / 10,
    humidity: Math.round(num(current.relative_humidity_2m)),
    precipMm: Math.round(num(current.precipitation) * 10) / 10,
    windKph: Math.round(num(current.wind_speed_10m)),
    windFromDeg,
    windCompass: windCompass(windFromDeg),
    cloudPct: Math.round(num(current.cloud_cover)),
    isDay: num(current.is_day) === 1,
    code,
    condition: codeToCondition(code),
    label: codeToLabel(code),
    time: typeof current.time === "string" ? current.time.replace("T", " ") : "",
  }
}

const CURRENT_FIELDS =
  "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day"

export const fetchWeather = async (signal?: AbortSignal): Promise<WeatherNow> => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${SATELLITE.lat}&longitude=${SATELLITE.lon}&current=${CURRENT_FIELDS}&timezone=auto`
  const response = await fetch(url, { signal: signal ?? null })
  if (!response.ok) {
    throw new Error(`Open-Meteo ${response.status}`)
  }
  const body: unknown = await response.json()
  const current = (body as { current?: OpenMeteoCurrent }).current
  if (current === undefined) {
    throw new Error("Open-Meteo: missing current block")
  }
  return parseWeather(current)
}
