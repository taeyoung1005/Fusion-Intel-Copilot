import { describe, expect, it } from "vitest"
import {
  buildMobileUplinkUrl,
  isPhoneReachableOrigin,
  normalizeUplinkOrigin,
  resolveUplinkOrigin,
} from "./mobileUplink"

describe("normalizeUplinkOrigin", () => {
  it("returns null for empty input", () => {
    expect(normalizeUplinkOrigin("")).toBeNull()
    expect(normalizeUplinkOrigin("   ")).toBeNull()
  })

  it("adds https when scheme is missing and keeps only the origin", () => {
    expect(normalizeUplinkOrigin("tunnel.trycloudflare.com")).toBe(
      "https://tunnel.trycloudflare.com",
    )
    expect(normalizeUplinkOrigin("https://t.ngrok.io/extra/path")).toBe("https://t.ngrok.io")
  })

  it("preserves an explicit http scheme and port", () => {
    expect(normalizeUplinkOrigin("http://192.168.0.5:5173")).toBe("http://192.168.0.5:5173")
  })

  it("returns null for unparseable values", () => {
    expect(normalizeUplinkOrigin("http://")).toBeNull()
  })
})

describe("resolveUplinkOrigin", () => {
  const current = "http://127.0.0.1:5199"

  it("falls back to the current origin when no override is set", () => {
    expect(resolveUplinkOrigin("", current)).toBe(current)
  })

  it("prefers a valid operator override over the current origin", () => {
    expect(resolveUplinkOrigin("https://demo.trycloudflare.com", current)).toBe(
      "https://demo.trycloudflare.com",
    )
  })

  it("ignores an unparseable override and falls back", () => {
    expect(resolveUplinkOrigin("http://", current)).toBe(current)
  })
})

describe("buildMobileUplinkUrl", () => {
  it("targets the mobile camera route with autostart", () => {
    expect(buildMobileUplinkUrl("https://demo.trycloudflare.com")).toBe(
      "https://demo.trycloudflare.com/mobile-camera?autostart=1",
    )
  })
})

describe("isPhoneReachableOrigin", () => {
  it("accepts a secure non-local origin", () => {
    expect(isPhoneReachableOrigin("https://demo.trycloudflare.com")).toBe(true)
  })

  it("rejects localhost and plain http", () => {
    expect(isPhoneReachableOrigin("https://localhost:5199")).toBe(false)
    expect(isPhoneReachableOrigin("http://127.0.0.1:5199")).toBe(false)
    expect(isPhoneReachableOrigin("http://192.168.0.5:5173")).toBe(false)
  })
})
