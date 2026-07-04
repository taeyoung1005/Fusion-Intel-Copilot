import { expect, test } from "@playwright/test"

test.describe("D4D COP 스모크", () => {
  test("운용자 상황도 셸과 핵심 표면을 표시한다", async ({ page }) => {
    // When: an operator opens the harness root.
    await page.goto("/")

    // Then: the COP shell and core operational surfaces are visible.
    await expect(page.getByRole("main")).toBeVisible()
    await expect(page.getByRole("heading", { name: "FUSION INTEL COPILOT" })).toBeVisible()
    await expect(page.getByText("FACILITY MAP / LIVE SIM CCTV")).toBeVisible()
    await expect(page.getByRole("img", { name: "시설 지도" })).toBeVisible()
    await expect(page.getByText("EVENT TIMELINE")).toBeVisible()
    await expect(page.getByText("CITATIONS")).toBeVisible()
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
})
