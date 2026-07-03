import { describe, expect, it } from "vitest"
import { codeToCondition, parseWeather, windCompass } from "./weatherData"

describe("windCompass", () => {
  it("names the direction the wind blows FROM in Korean", () => {
    expect(windCompass(0)).toBe("북풍")
    expect(windCompass(90)).toBe("동풍")
    expect(windCompass(180)).toBe("남풍")
    expect(windCompass(270)).toBe("서풍")
    expect(windCompass(315)).toBe("북서풍")
    expect(windCompass(360)).toBe("북풍")
  })
})

describe("codeToCondition", () => {
  it("maps WMO weather codes to conditions", () => {
    expect(codeToCondition(0)).toBe("clear")
    expect(codeToCondition(1)).toBe("clear")
    expect(codeToCondition(2)).toBe("clouds")
    expect(codeToCondition(3)).toBe("clouds")
    expect(codeToCondition(48)).toBe("fog")
    expect(codeToCondition(63)).toBe("rain")
    expect(codeToCondition(81)).toBe("rain")
    expect(codeToCondition(75)).toBe("snow")
    expect(codeToCondition(86)).toBe("snow")
    expect(codeToCondition(95)).toBe("thunder")
    expect(codeToCondition(99)).toBe("thunder")
  })
})

describe("parseWeather", () => {
  it("parses an Open-Meteo current block into a typed reading", () => {
    const now = parseWeather({
      temperature_2m: 26.53,
      apparent_temperature: 30.4,
      relative_humidity_2m: 73,
      precipitation: 0,
      weather_code: 2,
      cloud_cover: 65,
      wind_speed_10m: 10.4,
      wind_direction_10m: 315,
      is_day: 1,
      time: "2026-07-01T12:30",
    })
    expect(now.tempC).toBe(26.5)
    expect(now.condition).toBe("clouds")
    expect(now.label).toBe("부분 흐림")
    expect(now.humidity).toBe(73)
    expect(now.windKph).toBe(10)
    expect(now.windFromDeg).toBe(315)
    expect(now.windCompass).toBe("북서풍")
    expect(now.isDay).toBe(true)
    expect(now.time).toBe("2026-07-01 12:30")
  })

  it("flags rain and night correctly", () => {
    const now = parseWeather({
      temperature_2m: 18,
      apparent_temperature: 17,
      relative_humidity_2m: 90,
      precipitation: 3.2,
      weather_code: 65,
      cloud_cover: 100,
      wind_speed_10m: 22,
      is_day: 0,
      time: "2026-07-01T23:00",
    })
    expect(now.condition).toBe("rain")
    expect(now.precipMm).toBe(3.2)
    expect(now.isDay).toBe(false)
  })
})
