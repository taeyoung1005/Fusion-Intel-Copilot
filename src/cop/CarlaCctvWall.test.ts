import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { CarlaCctvDetectionOverlay, CarlaCctvWall } from "./CarlaCctvWall"
import { buildDynamicCameraRecord, carlaCameraInput } from "./dynamicMapCamera"

const { useCarlaCameraDetectionMock } = vi.hoisted(() => ({
  useCarlaCameraDetectionMock: vi.fn(),
}))

vi.mock("./useCarlaCameraDetection", () => ({
  useCarlaCameraDetection: useCarlaCameraDetectionMock,
}))

describe("CarlaCctvWall", () => {
  it("renders each camera tile's own per-frame JPEG src, not a shared persistent stream", () => {
    useCarlaCameraDetectionMock.mockClear()
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

  it("wires polling DETR detections into each camera tile", () => {
    useCarlaCameraDetectionMock.mockClear()
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
    ]

    renderToStaticMarkup(
      createElement(CarlaCctvWall, {
        cameras,
        selectedCameraId: "CARLA-E-02",
        onSelectCamera: () => {},
        onVisionEvidence: () => {},
      }),
    )

    expect(useCarlaCameraDetectionMock).toHaveBeenCalledWith(
      "CARLA-E-02",
      "동측 탄약고 외곽 CCTV",
      "/api/carla-cameras/CARLA-E-02/frame.jpg?frame=3016",
      "2026-07-04T09:38:29.000Z",
      expect.any(Function),
      expect.any(Function),
    )
  })

  it("renders DETR boxes as a non-interactive 640x360 SVG contour overlay", () => {
    const markup = renderToStaticMarkup(
      createElement(CarlaCctvDetectionOverlay, {
        frame: {
          width: 640,
          height: 360,
          objects: [
            {
              objectId: "detr-person-001",
              label: "person",
              confidence: 0.91,
              distanceMeters: 16,
              bbox: { x: 300, y: 92, width: 66, height: 166 },
            },
          ],
        },
      }),
    )

    expect(markup).toContain('class="cop-detection-overlay"')
    expect(markup).toContain('viewBox="0 0 640 360"')
    expect(markup).toContain('preserveAspectRatio="xMidYMid slice"')
    expect(markup).toContain("person")
    expect(markup).toContain("91%")
  })

  it("omits the overlay when DETR returns an empty object list", () => {
    const markup = renderToStaticMarkup(
      createElement(CarlaCctvDetectionOverlay, {
        frame: { width: 640, height: 360, objects: [] },
      }),
    )

    expect(markup).toBe("")
  })
})
