import type { AlertTone } from "./copData"

export const riskToTone = (riskLevel: string): AlertTone => {
  if (riskLevel === "review") {
    return "alert"
  }
  if (riskLevel === "watch") {
    return "watch"
  }
  return "normal"
}
