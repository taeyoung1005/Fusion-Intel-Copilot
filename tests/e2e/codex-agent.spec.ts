import { expect, test } from "@playwright/test"

test.describe("server Codex harness", () => {
  test("returns a Korean local adapter decision for valid context", async ({ request }) => {
    // Given: the preview server exposes the server-side Codex harness route.
    const response = await request.post("/api/codex-agent", {
      data: {
        checkpointId: "uncertain",
        checkpointLabel: "판단 불충분",
        evidence: {
          incidentId: "evt-low-confidence",
          title: "판단 불충분 저신뢰 움직임",
          status: "고비용 대응 차단",
          summary: "모의 CCTV 맥락이 불충분하여 사람 검토로 보냅니다.",
          citations: ["evt-low-confidence"],
          missingContext: ["카메라 연속성 부족"],
          responseOutcome: "감독자 검토 필요",
        },
      },
    })

    // Then: no external credential is required and the response is Korean structured JSON.
    expect(response.status()).toBe(200)
    await expect(response).toBeOK()
    const body = await response.json()
    expect(body).toMatchObject({
      codexMode: "local-codex-adapter",
      decision: {
        title: expect.stringContaining("서버 Codex"),
        recommendedAction: expect.stringContaining("사람"),
      },
      citations: ["evt-low-confidence"],
    })
  })

  test("rejects schema-invalid JSON with a Korean 400 error", async ({ request }) => {
    // Given: an invalid request crosses the API boundary.
    const response = await request.post("/api/codex-agent", {
      data: { checkpointId: "", evidence: { citations: [] } },
    })

    // Then: the boundary parser rejects it with Korean JSON.
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({
      error: "잘못된 Codex 하네스 요청입니다.",
    })
  })

  test("rejects malformed JSON with a Korean 400 error", async ({ request }) => {
    // Given: malformed JSON crosses the API boundary.
    const response = await request.post("/api/codex-agent", {
      data: "{",
      headers: { "content-type": "application/json" },
    })

    // Then: the JSON parser rejects it with the same Korean boundary error.
    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body).toMatchObject({
      error: "잘못된 Codex 하네스 요청입니다.",
    })
  })

  test("rejects oversized Codex harness requests", async ({ request }) => {
    // Given: a request exceeds the server-side harness body limit.
    const response = await request.post("/api/codex-agent", {
      data: "x".repeat(65 * 1024),
      headers: { "content-type": "application/json" },
    })

    // Then: the server refuses it before buffering unbounded input.
    expect(response.status()).toBe(413)
    const body = await response.json()
    expect(body).toMatchObject({
      error: "Codex 하네스 요청이 너무 큽니다.",
    })
  })
})
