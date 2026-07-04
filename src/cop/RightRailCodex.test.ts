import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CodexSummary } from "./RightRailCodex"
import type { Incident } from "./copData"

describe("CodexSummary", () => {
  it("renders the Fusion Intel Copilot product label", () => {
    const selectedIncident = {
      id: "inc-test",
      tone: "WATCH",
      zone: "PERIMETER EAST",
      title: "Camera Handoff Event",
      meta: "CAM-N-02 -> CAM-E-01",
      time: "09:41:02",
      confidence: 72,
    } satisfies Incident

    const markup = renderToStaticMarkup(
      createElement(CodexSummary, {
        selectedClip: undefined,
        selectedIncident,
        metrics: [],
        citations: [],
        missingContext: [],
        recentActivitySummary: undefined,
      }),
    )

    expect(markup).toContain("Fusion Intel Copilot")
  })
})
