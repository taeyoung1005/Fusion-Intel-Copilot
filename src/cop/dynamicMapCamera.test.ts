import { afterEach, describe, expect, it, vi } from "vitest"
import { listCarlaCameras } from "./carlaCameraClient"
import { CENTER, MAP_CAMERAS, type MapCamera, PERIMETER, type Point } from "./copData"
import {
  buildConePoints,
  buildDynamicCameraRecord,
  cameraYawToMapAngle,
  carlaCameraInput,
  coneAngleForCamera,
  directionForAngle,
} from "./dynamicMapCamera"
import { TOWN10_CARLA_CAMERA_CALIBRATION } from "./mapCameraCalibration"

const parseConePoints = (points: string): readonly Point[] =>
  points.split(" ").map((pair) => {
    const [rawX, rawY] = pair.split(",")
    return { x: Number(rawX), y: Number(rawY) }
  })

const recoverSeedAngle = (camera: MapCamera): number => {
  const radians = Math.atan2(
    (camera.node.y - CENTER.y) / PERIMETER.ry,
    (camera.node.x - CENTER.x) / PERIMETER.rx,
  )
  const degrees = (radians * 180) / Math.PI
  return ((degrees % 360) + 360) % 360
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("cameraYawToMapAngle", () => {
  it("exposes the Town10 CARLA yaw calibration as named settings", () => {
    // Given: the measured Town10 CARLA-to-map calibration.
    const calibration = TOWN10_CARLA_CAMERA_CALIBRATION

    // When: callers inspect the calibration values.
    const values = {
      screenAngleOffsetDegrees: calibration.screenAngleOffsetDegrees,
      yawSign: calibration.yawSign,
      screenNorthAngleDegrees: calibration.screenNorthAngleDegrees,
    }

    // Then: the magic numbers remain named and reusable for map recalibration.
    expect(values).toEqual({
      screenAngleOffsetDegrees: 90,
      yawSign: -1,
      screenNorthAngleDegrees: 180,
    })
  })

  it("maps calibrated CARLA camera yaw values to the measured SVG screen directions", () => {
    // Given: CARLA bridge camera yaw values from sim/carla-bridge/config.json.
    const calibratedCameras = [
      { id: "CARLA-N-01", yaw: 0.16, angle: 89.84, direction: "S" },
      { id: "CARLA-E-02", yaw: -89.36, angle: 179.36, direction: "W" },
      { id: "CARLA-S-03", yaw: -179.84, angle: 269.84, direction: "N" },
      { id: "CARLA-W-04", yaw: 90.64, angle: 359.36, direction: "E" },
    ] satisfies readonly {
      readonly id: string
      readonly yaw: number
      readonly angle: number
      readonly direction: ReturnType<typeof directionForAngle>
    }[]

    // When: each yaw is converted with the map calibration.
    const results = calibratedCameras.map((camera) => {
      const angle = cameraYawToMapAngle(camera.yaw)
      return {
        id: camera.id,
        angle,
        direction: directionForAngle(angle),
      }
    })

    // Then: the screen angle and direction match the measured map calibration.
    expect(results).toEqual(
      calibratedCameras.map((camera) => ({
        id: camera.id,
        angle: expect.closeTo(camera.angle),
        direction: camera.direction,
      })),
    )
  })

  it("applies the measured CARLA yaw offset and sign to normalized bridge yaw", () => {
    // Given: the bridge has normalized a CARLA yaw into the 0..360 payload range.
    const yaw = 354.75

    // When: the dashboard converts yaw for the SVG map coordinate system.
    const angle = cameraYawToMapAngle(yaw)

    // Then: the measured Town10 calibration controls the SVG screen angle.
    expect(angle).toBeCloseTo(95.25)
  })

  it("normalizes negative yaw values when old bridge payloads leak through", () => {
    // Given: a legacy payload sends raw CARLA yaw rather than normalized bridge yaw.
    const yaw = -32.15

    // When: the dashboard computes the map angle.
    const angle = cameraYawToMapAngle(yaw)

    // Then: the angle remains usable for SVG trigonometry.
    expect(angle).toBeCloseTo(122.15)
  })

  it("maps cardinal CARLA yaw headings to SVG screen angles", () => {
    // Given: CARLA headings on the world x/y axes.
    const yaws = [0, 90, 180, 270] as const

    // When: each yaw is converted to a screen angle.
    const angles = yaws.map(cameraYawToMapAngle)

    // Then: the measured screen angle is offset by 90 degrees and subtracts yaw.
    expect(angles).toEqual([90, 0, 270, 180])
  })
})

describe("coneAngleForCamera", () => {
  it("uses yaw instead of the center-facing fallback when yaw is present", () => {
    // Given: a camera node on the east side with a yaw calibrated to point south.
    const node = { x: CENTER.x + 10, y: CENTER.y }

    // When: the cone angle is selected.
    const angle = coneAngleForCamera(node, 0)

    // Then: yaw wins over the previous inward-facing fallback angle.
    expect(angle).toBe(90)
  })

  it("falls back to the old inward angle when yaw is missing", () => {
    // Given: a camera node on the east side without yaw payload data.
    const node = { x: CENTER.x + 10, y: CENTER.y }

    // When: the cone angle is selected.
    const angle = coneAngleForCamera(node)

    // Then: the camera cone keeps pointing toward the map center.
    expect(angle).toBe(180)
  })
})

describe("directionForAngle", () => {
  it("maps yaw-derived screen angles to cardinal camera directions", () => {
    // Given: representative CARLA yaw headings for each calibrated screen direction.
    const yaws = [0, 90, 180, 270, 359] as const

    // When: the yaw values are converted through SVG angles to map camera directions.
    const directions = yaws.map((yaw) => directionForAngle(cameraYawToMapAngle(yaw)))

    // Then: the buckets follow the SVG map axis orientation.
    expect(directions).toEqual(["S", "E", "N", "W", "S"])
  })

  it("keeps every seeded static camera direction aligned with its seed angle", () => {
    // Given: static MAP_CAMERAS generated from the seed angle table.
    const cameras = MAP_CAMERAS

    // When: the original perimeter seed angle is recovered from each camera node.
    const mismatches = cameras.flatMap((camera) => {
      const recoveredAngle = recoverSeedAngle(camera)
      const recoveredDirection = directionForAngle(recoveredAngle)
      return recoveredDirection === camera.direction
        ? []
        : [
            {
              id: camera.id,
              angle: recoveredAngle,
              expected: camera.direction,
              actual: recoveredDirection,
            },
          ]
    })

    // Then: every seed angle falls inside its declared direction bucket.
    expect(mismatches).toEqual([])
  })
})

describe("buildConePoints", () => {
  it("builds a cone whose axis follows the yaw-derived screen angle", () => {
    // Given: a camera node and a south-facing calibrated CARLA yaw angle.
    const node = { x: 100, y: 100 }

    // When: the cone polygon is generated.
    const points = parseConePoints(buildConePoints(node, cameraYawToMapAngle(0)))

    // Then: both cone endpoints sit south of the camera node.
    expect(points[0]).toEqual(node)
    expect(points[1]?.y).toBeGreaterThan(node.y)
    expect(points[2]?.y).toBeGreaterThan(node.y)
    expect(((points[1]?.x ?? 0) + (points[2]?.x ?? 0)) / 2).toBeCloseTo(node.x)
  })
})

describe("buildDynamicCameraRecord", () => {
  it("rotates the cone from yaw parsed from the CARLA camera payload", async () => {
    // Given: the live camera registry returns a CARLA camera with yaw metadata.
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            cameras: [
              {
                id: "CARLA-YAW-99",
                label: "Yaw test camera",
                source: "carla",
                status: "online",
                createdAt: "2026-07-04T09:00:00.000Z",
                lastFrameAt: "2026-07-04T09:42:18.000Z",
                frameCount: 42,
                latestFrameDataUrl: null,
                yaw: 90,
              },
            ],
          }),
        ),
    )
    const cameras = await listCarlaCameras()
    const camera = cameras[0]
    expect(camera?.yaw).toBe(90)

    // When: the existing dynamic camera input path builds a map camera record.
    const record = buildDynamicCameraRecord(
      carlaCameraInput(
        "CARLA-YAW-99",
        "Yaw test camera",
        0,
        42,
        "2026-07-04T09:42:18.000Z",
        null,
        camera?.yaw,
      ),
    )
    const points = parseConePoints(record.camera.conePoints)

    // Then: the cone faces east on the SVG map, matching yaw 90 instead of center fallback.
    expect(record.camera.direction).toBe("E")
    expect(((points[1]?.x ?? 0) + (points[2]?.x ?? 0)) / 2).toBeGreaterThan(record.camera.node.x)
    expect(((points[1]?.y ?? 0) + (points[2]?.y ?? 0)) / 2).toBeCloseTo(record.camera.node.y)
  })
})
