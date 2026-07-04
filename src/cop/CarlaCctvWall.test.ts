import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CarlaCctvWall } from "./CarlaCctvWall"
import { buildDynamicCameraRecord, carlaCameraInput } from "./dynamicMapCamera"

describe("CarlaCctvWall", () => {
  it("renders each camera tile's own per-frame JPEG src, not a shared persistent stream", () => {
    const cameras = [
      buildDynamicCameraRecord(
        carlaCameraInput(
          "CARLA-E-02",
          "동측 탄약고 외곽 CCTV",
          0,
          3016,
          "2026-07-04T09:38:29.000Z",
          "/api/carla-cameras/CARLA-E-02/frame.jpg?frame=3016",
        ),
      ),
      buildDynamicCameraRecord(
        carlaCameraInput(
          "CARLA-DRONE-ISR",
          "공중 ISR 드론",
          1,
          2124,
          "2026-07-04T09:38:29.000Z",
          "/api/carla-cameras/CARLA-DRONE-ISR/frame.jpg?frame=2124",
        ),
      ),
    ]

    const markup = renderToStaticMarkup(
      createElement(CarlaCctvWall, {
        cameras,
        selectedCameraId: "CARLA-E-02",
        onSelectCamera: () => {},
        onVisionEvidence: () => {},
      }),
    )

    expect(markup).toContain("/api/carla-cameras/CARLA-E-02/frame.jpg?frame=3016")
    expect(markup).toContain("/api/carla-cameras/CARLA-DRONE-ISR/frame.jpg?frame=2124")
    expect(markup).not.toContain("stream.mjpg")
  })
})
