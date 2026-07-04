import { expect, test } from "@playwright/test"

const validPdfPreviewFixture = `%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 68 >>
stream
BT
/F1 12 Tf
72 720 Td
(D4D report PDF preview fixture) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000117 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
429
%%EOF
`

test.describe("D4D COP 보고서 PDF 미리보기", () => {
  test("PDF 미리보기 성공 시 blob iframe과 저장 링크를 표시한다", async ({ page }) => {
    await page.route("**/api/report-pdf", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: validPdfPreviewFixture,
      })
    })

    await page.goto("/")
    await page.getByRole("tab", { name: "판단·대응" }).click()
    await page.getByRole("button", { name: /PDF 미리보기/ }).click()

    await expect(page.getByText(/PDF 미리보기 생성: RPT-/)).toBeVisible()
    await expect(page.locator(".cop-report-pdf-preview")).toHaveAttribute("src", /^blob:/)
    await expect(page.getByRole("link", { name: /PDF 파일 저장/ })).toBeVisible()
  })

  test("PDF 미리보기 서버 오류를 한국어로 표시하고 재시도 가능 상태를 유지한다", async ({
    page,
  }) => {
    await page.route("**/api/report-pdf", async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          error: "typst CLI가 설치되어 있지 않습니다. 'brew install typst' 후 다시 시도하세요.",
        }),
      })
    })

    await page.goto("/")
    await page.getByRole("tab", { name: "판단·대응" }).click()
    await page.getByRole("button", { name: /PDF 미리보기/ }).click()

    await expect(
      page.getByText(
        "typst CLI가 설치되어 있지 않습니다. 'brew install typst' 후 다시 시도하세요.",
      ),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /PDF 미리보기/ })).toBeEnabled()
    await expect(page.locator(".cop-report-pdf-preview")).toHaveCount(0)
  })
})
