const STORAGE_KEY = "d4d.mobileUplinkOrigin"

const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
])

const envUplinkOrigin = (): string => {
  const raw = import.meta.env.VITE_MOBILE_UPLINK_ORIGIN
  return typeof raw === "string" ? raw.trim() : ""
}

/**
 * Normalize an operator-entered host or URL into an `https://host[:port]` origin.
 * Returns null when the value is empty or cannot be parsed as an origin.
 */
export const normalizeUplinkOrigin = (value: string): string | null => {
  const trimmed = value.trim()
  if (trimmed === "") {
    return null
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(candidate).origin
  } catch {
    return null
  }
}

export const loadStoredUplinkOrigin = (): string => {
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() ?? ""
  } catch {
    return ""
  }
}

export const saveStoredUplinkOrigin = (value: string): void => {
  try {
    const trimmed = value.trim()
    if (trimmed === "") {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, trimmed)
  } catch {
    // Storage may be unavailable (private mode); the in-memory override still applies.
  }
}

/**
 * Resolve the origin a phone should connect to, in priority order:
 * operator override → build-time env → the origin currently serving the dashboard.
 * The dead hardcoded demo tunnel is gone; a phone reaches the same tunnel/LAN
 * host the operator opened, or a URL they paste in.
 */
export const resolveUplinkOrigin = (override: string, currentOrigin: string): string => {
  return (
    normalizeUplinkOrigin(override) ?? normalizeUplinkOrigin(envUplinkOrigin()) ?? currentOrigin
  )
}

export const buildMobileUplinkUrl = (origin: string): string => {
  const url = new URL("/mobile-camera", origin)
  url.searchParams.set("autostart", "1")
  return url.toString()
}

/**
 * A phone can only open its camera over a secure, routable origin. Localhost
 * and plain HTTP fail on a real device, so the UI warns when that is the case.
 */
export const isPhoneReachableOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin)
    return url.protocol === "https:" && !LOCAL_HOSTNAMES.has(url.hostname)
  } catch {
    return false
  }
}
