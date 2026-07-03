import { expect, test } from "@playwright/test"

test.describe("D4D COP 스모크", () => {
  test("운용자 상황도 셸과 핵심 표면을 표시한다", async ({ page }) => {
    // When: an operator opens the harness root.
    await page.goto("/")

    // Then: the COP shell and core operational surfaces are visible.
    await expect(page.getByRole("main")).toBeVisible()
    await expect(page.getByRole("heading", { name: "D4D AI PERIMETER HARNESS" })).toBeVisible()
    await expect(page.getByText("FACILITY MAP / LIVE PHONE CCTV")).toBeVisible()
    await expect(page.getByRole("img", { name: "시설 지도" })).toBeVisible()
    await expect(page.getByText("EVENT TIMELINE")).toBeVisible()
    await expect(page.getByText("EVIDENCE CLIPS")).toBeVisible()
    await expect(page.getByText("ACTIVE INCIDENTS")).toBeVisible()
  })

  test("없는 경로에서 제어된 상태를 표시한다", async ({ page }, testInfo) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []

    page.on("pageerror", (error) => {
      pageErrors.push(error.message)
    })
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text())
      }
    })

    try {
      // When: an operator opens an unknown route.
      await page.goto("/missing")

      // Then: the app handles the route intentionally without runtime errors.
      await expect(page.getByRole("main")).toBeVisible()
      await expect(page.getByRole("heading", { name: "없는 경로" })).toBeVisible()
      await expect.poll(() => pageErrors, { message: "pageerror events" }).toEqual([])
      await expect.poll(() => consoleErrors, { message: "console error events" }).toEqual([])
    } finally {
      await testInfo.attach("missing-route-runtime-errors", {
        body: JSON.stringify({ consoleErrors, pageErrors }, null, 2),
        contentType: "application/json",
      })
    }
  })

  test("휴대폰 CCTV 등록 표면에서 카메라 프레임을 전송한다", async ({ page }) => {
    let registerCalled = false
    let frameCameraId = ""

    await page.addInitScript(() => {
      const canvas = document.createElement("canvas")
      canvas.width = 320
      canvas.height = 180
      const context = canvas.getContext("2d")
      if (context !== null) {
        context.fillStyle = "#03090d"
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = "#f4c430"
        context.fillRect(128, 48, 52, 92)
      }
      Object.defineProperty(navigator, "mediaDevices", {
        value: {
          getUserMedia: async () => canvas.captureStream(2),
        },
        configurable: true,
      })
      Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
        get: () => 320,
        configurable: true,
      })
      Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
        get: () => 180,
        configurable: true,
      })
      HTMLMediaElement.prototype.play = async () => undefined
      CanvasRenderingContext2D.prototype.drawImage = () => undefined
    })

    await page.route("**/api/mobile-cameras/register", async (route) => {
      registerCalled = true
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          camera: {
            id: "PHONE-E2E-001",
            label: "E2E 휴대폰 CCTV",
            source: "mobile",
            status: "online",
            frameCount: 0,
            createdAt: "2026-06-30T00:00:00.000Z",
            lastFrameAt: null,
            latestFrameDataUrl: null,
          },
        }),
      })
    })

    await page.route("**/api/mobile-cameras/PHONE-E2E-001/frame", async (route) => {
      frameCameraId = "PHONE-E2E-001"
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          camera: {
            id: "PHONE-E2E-001",
            label: "E2E 휴대폰 CCTV",
            source: "mobile",
            status: "online",
            frameCount: 1,
            createdAt: "2026-06-30T00:00:00.000Z",
            lastFrameAt: "2026-06-30T00:00:01.000Z",
            latestFrameDataUrl: "data:image/jpeg;base64,QUJDRA==",
          },
        }),
      })
    })

    await page.goto("/mobile-camera?autostart=1")
    await expect(page.getByRole("heading", { name: "MOBILE CCTV UPLINK" })).toBeVisible()
    await expect(page.getByRole("button", { name: "테스트 프레임 전송" })).toHaveCount(0)

    await expect.poll(() => registerCalled).toBe(true)
    await expect.poll(() => frameCameraId).toBe("PHONE-E2E-001")
    await expect(page.locator(".mobile-cctv-status div").first().locator("dd")).toHaveText(
      "PHONE-E2E-001",
    )
    await expect(page.locator(".mobile-cctv-status div").nth(1).locator("dd")).toHaveText(
      "프레임 1건",
    )
  })
})
