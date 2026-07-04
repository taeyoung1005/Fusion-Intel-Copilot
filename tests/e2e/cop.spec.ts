import { expect, test } from "@playwright/test"

test.describe("D4D COP 표면과 상호작용", () => {
  test("컨셉의 모든 표면과 기능을 노출한다", async ({ page }, testInfo) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []

    page.on("pageerror", (error) => {
      pageErrors.push(error.message)
    })
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text()
        // External satellite tiles may be unreachable in CI/offline; the base
        // covers that case. Ignore resource-load noise from those requests.
        if (text.includes("arcgisonline.com") || text.includes("Failed to load resource")) {
          return
        }
        consoleErrors.push(text)
      }
    })

    try {
      await page.goto("/")

      // --- Command bar ---------------------------------------------------------
      await expect(page.getByRole("heading", { name: "D4D AI PERIMETER HARNESS" })).toBeVisible()
      await expect(page.getByText("COMMON OPERATIONAL PICTURE")).toBeVisible()
      await expect(page.getByText("SYSTEM NOMINAL")).toBeVisible()
      await expect(page.getByText(/AI AGENTS\s+6 \/ 6/)).toBeVisible()
      await expect(page.getByText("ALERT WATCH")).toBeVisible()
      await expect(page.getByText("Alpha-1")).toBeVisible()

      // --- Left rail: map layers + live phone CCTV -----------------------------
      await expect(page.getByText("MAP LAYERS")).toBeVisible()
      await expect(page.getByRole("checkbox")).toHaveCount(12)

      const cones = page.locator('polygon[fill="#59d7ff"]')
      await expect(cones).toHaveCount(0)
      // The LIVE PHONE CCTV wall is always present; with no phones it shows an empty screen.
      await expect(page.locator(".cop-mobile-live")).toHaveCount(1)
      await expect(page.locator(".cop-mobile-live-empty-screen")).toBeVisible()
      await expect(page.locator(".cop-mobile-live-card")).toHaveCount(0)
      await page.locator("label.cop-layer", { hasText: "Camera Coverage" }).click()
      await expect(cones).toHaveCount(0)
      await page.locator("label.cop-layer", { hasText: "Camera Coverage" }).click()
      await expect(cones).toHaveCount(0)

      // Buildings/Roads layers render REAL OpenStreetMap geometry (a bundled
      // snapshot projected onto the satellite imagery), not hand-drawn shapes.
      const buildingShapes = page.locator('.cop-map-svg polygon[fill="rgba(89,215,255,0.2)"]')
      const roadShapes = page.locator('.cop-map-svg polyline[stroke="rgba(8,14,10,0.5)"]')
      await expect(buildingShapes).toHaveCount(0)
      await expect(roadShapes).toHaveCount(0)
      await page.locator("label.cop-layer", { hasText: "Buildings" }).click()
      await expect(buildingShapes.first()).toBeVisible()
      await page.locator("label.cop-layer", { hasText: "Roads" }).click()
      await expect(roadShapes.first()).toBeVisible()
      await page.locator("label.cop-layer", { hasText: "Buildings" }).click()
      await expect(buildingShapes).toHaveCount(0)
      await page.locator("label.cop-layer", { hasText: "Roads" }).click()
      await expect(roadShapes).toHaveCount(0)

      await expect(page.locator(".cop-map-svg .cop-svg-camlabel")).toHaveCount(0)

      // Refresh updates the LAST UPDATED stamp.
      const updated = page.locator(".cop-left-footer strong")
      await expect(updated).toHaveText("09:42:15")
      await page.getByRole("button", { name: /REFRESH/ }).click()
      await expect(updated).toHaveText("09:42:18")

      await expect(page.getByRole("img", { name: "시설 지도" })).toBeVisible()
      await expect(page.getByRole("button", { name: "GRAPH" })).toHaveCount(0)

      await page.getByRole("button", { name: "3D" }).click()
      await expect(page.locator(".cop-map.is-3d")).toBeVisible()
      await page.getByRole("button", { name: "2D" }).click()
      await page.getByRole("button", { name: "확대" }).click()
      await page.getByRole("button", { name: "기준 위치로" }).click()

      // --- Event timeline ------------------------------------------------------
      // Real current-time axis. With no live events it shows an empty state, and
      // the range buttons zoom the axis (relabeling the ticks around "now").
      await expect(page.getByText("EVENT TIMELINE")).toBeVisible()
      await expect(page.locator(".cop-timeline-empty")).toBeVisible()
      await expect(page.locator(".cop-track-block")).toHaveCount(0)
      const firstAxisTick = page.locator(".cop-axis-tick").first()
      const tickAt1H = await firstAxisTick.textContent()
      const sixHour = page.getByRole("button", { name: "6H", exact: true })
      await sixHour.click()
      await expect(sixHour).toHaveAttribute("aria-pressed", "true")
      await expect(firstAxisTick).not.toHaveText(tickAt1H ?? "")
      const watchFilter = page.getByRole("button", { name: "Watch", exact: true })
      await watchFilter.click()
      await expect(watchFilter).toHaveAttribute("aria-pressed", "true")

      // --- Right rail: active incidents (real, quiet baseline) -----------------
      // With nothing connected the queue shows a single honest standby incident,
      // not fabricated PERIMETER/AMMO/SOUTH events.
      const incidents = page.locator(".cop-incidents")
      await expect(incidents.getByText("활성 사건 없음")).toBeVisible()
      await expect(incidents.locator(".cop-count-badge")).toHaveText("1")
      await page.getByRole("button", { name: "VIEW ALL" }).click()
      await expect(page.getByText(/사건 큐 전체 표시: .*1건/)).toBeVisible()

      // --- Right rail: Codex summary (computed from real telemetry) ------------
      const codex = page.locator(".cop-codex")
      await expect(codex.getByText("객관적 근거")).toBeVisible()
      await expect(codex.getByText("연결 센서 노드")).toBeVisible()
      // No cameras and no detections → zeroed metrics, not the old 128/64%.
      await expect(codex.locator(".cop-codex-value")).toHaveText(["0", "0", "0", "0%", "0%"])
      // The Codex request now fires automatically on selection; the manual
      // button was removed. The decision text appears without any click.
      await expect(page.getByText(/서버 Codex 하네스 판단/)).toBeVisible()

      // --- Right rail: citations (empty until real evidence) -------------------
      await expect(page.getByText(/실측 증거 인용 없음/)).toBeVisible()
      await expect(page.getByRole("button", { name: "보기", exact: true })).toHaveCount(0)

      // --- Right rail: response gate -------------------------------------------
      await expect(page.locator(".cop-gate-status.pass")).toHaveCount(2)
      await expect(page.locator(".cop-gate-status.pending")).toHaveCount(2)
      await page.getByRole("button", { name: "검토 및 확인" }).click()
      await expect(page.locator(".cop-gate-status.pass")).toHaveCount(4)
      await expect(page.locator(".cop-gate-status.pending")).toHaveCount(0)
      await expect(page.getByText(/검토 및 확인 완료/)).toBeVisible()
      await page.getByRole("button", { name: "에스컬레이션" }).click()
      await expect(page.getByText(/감독자 검토로 상신/)).toBeVisible()

      // The recommended-action CTA scrolls to the response gate.
      await page.getByRole("button", { name: /사람 확인 게이트로 이동/ }).click()
      await expect(page.locator("#cop-gate")).toBeInViewport()

      // --- Right rail: daily report --------------------------------------------
      await expect(page.getByText("DAILY SITUATION REPORT")).toBeVisible()
      await page.getByRole("button", { name: /보고서 내보내기/ }).click()
      await expect(page.getByText(/EXP-2025-05-20-001/)).toBeVisible()
      await page.getByRole("button", { name: /PDF 미리보기/ }).click()
      await expect(page.getByText(/RPT-2025-05-20-PREVIEW/)).toBeVisible()

      // No marketing copy and no runtime errors.
      await expect(page.getByText(/Live Guard COP/)).toHaveCount(0)
      await expect.poll(() => pageErrors, { message: "pageerror events" }).toEqual([])
      await expect.poll(() => consoleErrors, { message: "console error events" }).toEqual([])
    } finally {
      await testInfo.attach("cop-runtime-errors", {
        body: JSON.stringify({ consoleErrors, pageErrors }, null, 2),
        contentType: "application/json",
      })
    }
  })

  test("모바일 폭에서 가로 스크롤 없이 핵심 표면을 유지한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")

    await expect(page.getByRole("heading", { name: "D4D AI PERIMETER HARNESS" })).toBeVisible()
    await expect(page.getByRole("img", { name: "시설 지도" })).toBeVisible()
    await expect(page.getByText("ACTIVE INCIDENTS")).toBeVisible()

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
  })

  test("활동 스트림 패널이 SSE 처리 단계를 실시간 로그로 표시한다", async ({ page }) => {
    await page.addInitScript(() => {
      class MockActivityEventSource extends EventTarget implements EventSource {
        static readonly CONNECTING = 0
        static readonly OPEN = 1
        static readonly CLOSED = 2
        readonly CONNECTING = 0
        readonly OPEN = 1
        readonly CLOSED = 2
        readonly url: string
        readonly withCredentials = false
        readyState = MockActivityEventSource.CONNECTING
        onerror: ((this: EventSource, event: Event) => unknown) | null = null
        onmessage: ((this: EventSource, event: MessageEvent) => unknown) | null = null
        onopen: ((this: EventSource, event: Event) => unknown) | null = null

        constructor(url: string | URL) {
          super()
          this.url = String(url)
          window.setTimeout(() => {
            this.readyState = MockActivityEventSource.OPEN
            this.onopen?.call(this, new Event("open"))
            this.emit({
              ts: "2026-07-04T09:42:18.120Z",
              source: "vision",
              level: "info",
              stage: "receive",
              message: "프레임 수신",
              detail: { machineId: "activity-event-backend/vision-worker-01" },
            })
            this.emit({
              ts: "2026-07-04T09:42:19.360Z",
              source: "vision",
              level: "watch",
              stage: "detect",
              message: "DETR 후보 2건 검출",
              detail: { machineId: "activity-event-backend/vision-worker-01" },
            })
          }, 25)
        }

        close(): void {
          this.readyState = MockActivityEventSource.CLOSED
        }

        private emit(payload: {
          readonly ts: string
          readonly source: string
          readonly level: string
          readonly stage: string
          readonly message: string
          readonly detail: {
            readonly machineId: string
          }
        }): void {
          const event = new MessageEvent("activity", { data: JSON.stringify(payload) })
          this.onmessage?.call(this, event)
          this.dispatchEvent(event)
        }
      }

      Object.defineProperty(window, "EventSource", { value: MockActivityEventSource })
    })

    await page.goto("/")

    const panel = page.locator(".cop-activity-stream")
    await expect(panel.getByRole("heading", { name: /시스템 처리 로그/ })).toBeVisible()
    await expect(panel.locator(".cop-activity-stage", { hasText: /^수신$/ })).toBeVisible()
    await expect(panel.locator(".cop-activity-stage", { hasText: /^검출$/ })).toBeVisible()
    await expect(panel.getByText("프레임 수신")).toBeVisible()
    await expect(panel.getByText("DETR 후보 2건 검출")).toBeVisible()
    await expect(
      panel
        .locator(".cop-activity-line", { hasText: "프레임 수신" })
        .getByText("activity-event-backend/vision-worker-01"),
    ).toBeVisible()
  })

  test("Codex 요청 중 사건을 바꿔도 이전 판단을 표시하지 않는다", async ({ page }) => {
    // Incidents are now real: they only exist once DETR actually detects
    // something. Two CARLA simulation cameras, brought online one after the
    // other, each auto-detect via useCarlaCameraDetection and yield the two
    // real incidents this test switches between.
    const framePng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    const cameraA = {
      id: "CARLA-STALE-A",
      label: "지연 테스트 A",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-06-30T00:00:00.000Z",
      lastFrameAt: "2026-06-30T00:00:01.000Z",
      latestFrameDataUrl: framePng,
    }
    const cameraB = {
      id: "CARLA-STALE-B",
      label: "지연 테스트 B",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-06-30T00:01:00.000Z",
      lastFrameAt: "2026-06-30T00:01:01.000Z",
      latestFrameDataUrl: framePng,
    }
    let onlineCameras = [cameraA]
    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: onlineCameras }),
      })
    })

    // Deliberately a non-person label: this test only cares which camera an
    // incident is tagged to and the Codex race timing, not attributes. A
    // "person" label would trigger CLIP attribute extraction on both cameras
    // with identical mock scores, making them look like the same person and
    // firing the D-phase cross-camera correlation feature — which would
    // rename/relabel one of the two incidents mid-test and break the
    // camera-identity assertions below.
    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "car", score: 0.9, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "stale-test-sequence",
          cameraId: "unused",
          detections: [{ id: "det-stale-001", label: "car", confidence: 0.9 }],
          tracks: [{ id: "trk-stale-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })
    // The Codex mock echoes the incident id so a stale response is identifiable.
    await page.route("**/api/codex-agent", async (route) => {
      const incidentId = route.request().postDataJSON()?.evidence?.incidentId ?? "unknown"
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          codexMode: "local-codex-adapter",
          decision: {
            title: `판단-${incidentId}`,
            summary: "지연 응답",
            recommendedAction: "사람 확인 유지",
            checkpoint: "stale-request",
          },
          citations: ["CARLA-STALE-A"],
          adapterNotice: "테스트 지연 응답",
        }),
      })
    })

    await page.goto("/")

    // Camera A is online from the start and auto-detects → the dashboard's
    // first-ever incident (A) becomes the sticky default selection.
    const incidents = page.locator(".cop-incidents")
    await expect(incidents.locator(".cop-incident", { hasText: "CARLA-STALE-A" })).toBeVisible({
      timeout: 10_000,
    })

    // Camera B comes online second; its own automatic detection creates a
    // second, independent incident.
    onlineCameras = [cameraA, cameraB]
    await expect(incidents.locator(".cop-incident", { hasText: "CARLA-STALE-B" })).toBeVisible({
      timeout: 10_000,
    })
    // Let any in-flight auto-triggered Codex requests from the detection churn
    // above settle before the race this test actually exercises.
    await page.waitForTimeout(1_000)

    // Switch to B here first so the actual race below starts from a real
    // prior selection and clicking A is a genuine transition.
    await incidents.locator(".cop-incident", { hasText: "CARLA-STALE-B" }).click()
    await page.waitForTimeout(500)

    // Selecting incident A auto-fires a Codex request (300ms delayed mock).
    // Immediately switching to B fires a second request; the requestVersion
    // guard must drop A's stale response so it never replaces the panel.
    const staleResponseA = page.waitForResponse(
      (response) =>
        response.url().includes("/api/codex-agent") &&
        (response.request().postDataJSON()?.evidence?.incidentId ?? "") === "inc-CARLA-STALE-A",
    )
    await incidents.locator(".cop-incident", { hasText: "CARLA-STALE-A" }).click()
    await incidents.locator(".cop-incident", { hasText: "CARLA-STALE-B" }).click()
    await staleResponseA

    await expect(page.locator(".cop-codex")).toHaveCount(1)
    // The stale request bound to incident A must never replace the active panel.
    await expect(page.getByText("판단-inc-CARLA-STALE-A")).toHaveCount(0)
    // B's decision is the one that lands.
    await expect(page.getByText("판단-inc-CARLA-STALE-B")).toBeVisible()
  })

  test("Codex 자동 요청에 최근 활동 시간 윈도우 종합 문구가 포함된다", async ({ page }) => {
    const carlaCamera = {
      id: "CARLA-WINDOW-01",
      label: "E2E 시간윈도우 테스트",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [carlaCamera] }),
      })
    })

    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "person", score: 0.9, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
      window.__D4D_TEST_CLIP_CLASSIFIER__ = async (_source, candidateLabels) => {
        const first = candidateLabels[0]
        const second = candidateLabels[1]
        if (first === undefined || second === undefined) {
          return []
        }
        if (first.includes("hat")) {
          return [
            { label: first, score: 0.2 },
            { label: second, score: 0.8 },
          ]
        }
        return [
          { label: first, score: 0.85 },
          { label: second, score: 0.15 },
        ]
      }
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "window-test-sequence",
          cameraId: "CARLA-WINDOW-01",
          detections: [{ id: "det-window-001", label: "person", confidence: 0.9 }],
          tracks: [{ id: "trk-window-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    let postedSummary = ""
    await page.route("**/api/codex-agent", async (route) => {
      const payload = route.request().postDataJSON()
      postedSummary = payload?.evidence?.summary ?? ""
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          codexMode: "local-codex-adapter",
          decision: {
            title: "테스트 판단",
            summary: "테스트 응답",
            recommendedAction: "사람 확인 유지",
            checkpoint: "test-checkpoint",
          },
          citations: ["CARLA-WINDOW-01"],
          adapterNotice: "테스트 응답",
        }),
      })
    })

    await page.goto("/")

    await expect
      .poll(() => page.locator(".cop-track-block").count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1)

    await expect.poll(() => postedSummary).toContain("분간")
    await expect.poll(() => postedSummary).toContain("회 탐지")
  })

  test("CARLA 시뮬레이션 카메라를 CARLA SIM CCTV와 지도에 표시한다", async ({ page }) => {
    const carlaCameraA = {
      id: "CARLA-E2E-001",
      label: "E2E CARLA CCTV",
      source: "carla",
      status: "online",
      frameCount: 3,
      createdAt: "2026-06-30T00:00:00.000Z",
      lastFrameAt: "2026-06-30T00:00:03.000Z",
      latestFrameDataUrl: "data:image/jpeg;base64,QUJDRA==",
    }
    const carlaCameraB = {
      id: "CARLA-E2E-002",
      label: "E2E 보조 CARLA CCTV",
      source: "carla",
      status: "online",
      frameCount: 0,
      createdAt: "2026-06-30T00:01:00.000Z",
      lastFrameAt: null,
      latestFrameDataUrl: null,
    }
    const registeredCameras = [carlaCameraA, carlaCameraB]

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ cameras: registeredCameras }),
        })
        return
      }
      await route.fulfill({ status: 405 })
    })

    await page.goto("/")

    const cameraLabels = page.locator(".cop-map-svg .cop-svg-camlabel")

    // The CARLA SIM CCTV wall is the single place that lists connected cameras —
    // there is no separate registry/QR panel, since CARLA cameras register
    // themselves via the bridge.
    await expect(page.locator(".cop-mobile-live-card")).toHaveCount(2)
    await expect(page.getByRole("img", { name: "CARLA-E2E-001 CARLA CCTV 화면" })).toBeVisible()
    await expect(
      page
        .locator(".cop-mobile-live-card", { hasText: "CARLA-E2E-002" })
        .locator(".cop-mobile-live-empty"),
    ).toBeVisible()
    await expect(cameraLabels.filter({ hasText: "CARLA-E2E-001" })).toHaveCount(1)
    await expect(cameraLabels.filter({ hasText: "CARLA-E2E-002" })).toHaveCount(1)
    await expect(page.locator('polygon[fill="#59d7ff"]')).toHaveCount(2)

    // Camera Handoff layer draws a real handoff route between the two camera nodes.
    const handoffRoutes = page.locator('.cop-map-svg line[stroke="#f4c430"]')
    await expect(handoffRoutes).toHaveCount(1)
    await page.locator("label.cop-layer", { hasText: "Camera Handoff" }).click()
    await expect(handoffRoutes).toHaveCount(0)
    await page.locator("label.cop-layer", { hasText: "Camera Handoff" }).click()
    await expect(handoffRoutes).toHaveCount(1)
    await page.getByRole("button", { name: "3D" }).click()
    await expect(page.locator(".cop-map.is-3d")).toBeVisible()
    await page.getByRole("button", { name: "2D" }).click()
    await expect(page.locator(".cop-map.is-3d")).toHaveCount(0)

    await page.getByRole("button", { name: "CARLA-E2E-001 카메라 선택" }).hover()
    await expect(page.getByRole("img", { name: "CARLA-E2E-001 지도 CCTV 미리보기" })).toBeVisible()

    await page.getByRole("button", { name: "CARLA-E2E-001 CARLA 시뮬레이션 CCTV 선택" }).click()
    await expect(page.getByText(/CARLA-E2E-001 선택/)).toBeVisible()
  })

  test("Weather Overlay는 실시간 현지 날씨를 반영한다", async ({ page }) => {
    // Live weather for the basemap coordinate (Open-Meteo).
    await page.route("**/api.open-meteo.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: {
            time: "2026-07-01T14:00",
            temperature_2m: 19.4,
            apparent_temperature: 18.0,
            relative_humidity_2m: 92,
            precipitation: 4.1,
            weather_code: 65,
            cloud_cover: 100,
            wind_speed_10m: 24,
            wind_direction_10m: 315,
            is_day: 1,
          },
        }),
      })
    })

    await page.goto("/")
    // Off by default: no weather chip or effect.
    await expect(page.locator(".cop-map-weather")).toHaveCount(0)
    await expect(page.locator(".cop-map-weather-canvas")).toHaveCount(0)

    await page.locator("label.cop-layer", { hasText: "Weather Overlay" }).click()
    // Real reading drives the readout + a condition-matched simulation + wind dir.
    const chip = page.locator(".cop-map-weather")
    await expect(chip).toContainText("19.4°C")
    await expect(chip).toContainText("비")
    await expect(chip).toContainText("92%")
    await expect(chip).toContainText("북서풍") // wind_direction 315° = NW
    await expect(page.locator('.cop-map-weather-canvas[data-condition="rain"]')).toBeVisible()

    await page.locator("label.cop-layer", { hasText: "Weather Overlay" }).click()
    await expect(page.locator(".cop-map-weather")).toHaveCount(0)
    await expect(page.locator(".cop-map-weather-canvas")).toHaveCount(0)
  })

  test("Weather Overlay는 폴링 주기마다 실시간으로 갱신된다", async ({ page }) => {
    await page.clock.install()
    let call = 0
    await page.route("**/api.open-meteo.com/**", async (route) => {
      call += 1
      const first = call === 1
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: {
            time: "2026-07-01T14:00",
            temperature_2m: first ? 17.2 : 24.6,
            apparent_temperature: first ? 15 : 25,
            relative_humidity_2m: first ? 94 : 40,
            precipitation: first ? 6.5 : 0,
            weather_code: first ? 65 : 0,
            cloud_cover: first ? 100 : 5,
            wind_speed_10m: first ? 34 : 8,
            wind_direction_10m: first ? 315 : 90,
            is_day: 1,
          },
        }),
      })
    })

    await page.goto("/")
    await page.locator("label.cop-layer", { hasText: "Weather Overlay" }).click()
    const chip = page.locator(".cop-map-weather")
    // First reading: rainy, NW wind.
    await expect(chip).toContainText("17.2°C")
    await expect(chip).toContainText("비")
    await expect(page.locator('.cop-map-weather-canvas[data-condition="rain"]')).toBeVisible()

    // Advance past the 10-minute refresh — the overlay re-fetches and updates
    // live (no reload) to the new reading: clear, E wind.
    await page.clock.fastForward("10:05")
    await expect(chip).toContainText("24.6°C")
    await expect(chip).toContainText("맑음")
    await expect(chip).toContainText("동풍")
    await expect(page.locator('.cop-map-weather-canvas[data-condition="clear"]')).toBeVisible()
    expect(call).toBeGreaterThanOrEqual(2)
  })

  test("CARLA 탐지 시 실시간 알림 팝업이 뜨고, EVENT TIMELINE 호버/클릭이 동작한다", async ({
    page,
  }) => {
    const TINY_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    )
    const carlaCamera = {
      id: "CARLA-ALERT-01",
      label: "E2E 알림 테스트",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl: null,
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [carlaCamera] }),
      })
    })

    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "person", score: 0.88, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
      window.__D4D_TEST_CLIP_CLASSIFIER__ = async (_source, candidateLabels) => {
        const first = candidateLabels[0]
        const second = candidateLabels[1]
        if (first === undefined || second === undefined) {
          return []
        }
        if (first.includes("hat")) {
          return [
            { label: first, score: 0.2 },
            { label: second, score: 0.8 },
          ]
        }
        return [
          { label: first, score: 0.85 },
          { label: second, score: 0.15 },
        ]
      }
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "carla-alert-test-sequence",
          cameraId: "CARLA-ALERT-01",
          detections: [{ id: "det-alert-001", label: "person", confidence: 0.88 }],
          tracks: [{ id: "trk-alert-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    await page.goto("/")

    // A real CARLA-sourced detection opens a realtime alert popup automatically.
    const alert = page.locator(".cop-realtime-alert")
    await expect(alert).toBeVisible({ timeout: 10_000 })
    await expect(alert.getByText("CARLA-ALERT-01")).toBeVisible()
    await expect.poll(() => page.locator(".cop-track-block").count()).toBeGreaterThanOrEqual(1)

    // Closing it manually works.
    await page.getByRole("button", { name: "CARLA-ALERT-01 알림 닫기" }).click()
    await expect(alert).toHaveCount(0)

    // Clicking the resulting EVENT TIMELINE block opens the clip player modal.
    await page.locator(".cop-track-block").first().click()
    await expect(page.locator(".cop-clip-player")).toBeVisible()
    await page.getByRole("button", { name: "재생 닫기" }).click()
    await expect(page.locator(".cop-clip-player")).toHaveCount(0)

    // Hovering a block reveals its tooltip.
    await page.locator(".cop-track-block").first().hover()
    await expect(page.locator(".cop-track-tooltip").first()).toBeVisible()
  })

  test("추출된 인물 속성이 EVENT TIMELINE과 Codex 입력에 반영된다", async ({ page }) => {
    const onePixelPngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

    const carlaCamera = {
      id: "CARLA-ATTR-01",
      label: "E2E 속성 테스트",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl: onePixelPngDataUrl,
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [carlaCamera] }),
      })
    })

    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "person", score: 0.92, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
      window.__D4D_TEST_CLIP_CLASSIFIER__ = async (_source, candidateLabels) => {
        const first = candidateLabels[0]
        const second = candidateLabels[1]
        if (first === undefined || second === undefined) {
          return []
        }
        if (first.includes("hat")) {
          return [
            { label: first, score: 0.2 },
            { label: second, score: 0.8 },
          ]
        }
        return [
          { label: first, score: 0.85 },
          { label: second, score: 0.15 },
        ]
      }
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "attr-test-sequence",
          cameraId: "CARLA-ATTR-01",
          detections: [{ id: "det-attr-001", label: "person", confidence: 0.92 }],
          tracks: [{ id: "trk-attr-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    let postedSummary = ""
    await page.route("**/api/codex-agent", async (route) => {
      const payload = route.request().postDataJSON()
      postedSummary = payload?.evidence?.summary ?? ""
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          codexMode: "local-codex-adapter",
          decision: {
            title: "테스트 판단",
            summary: "테스트 응답",
            recommendedAction: "사람 확인 유지",
            checkpoint: "test-checkpoint",
          },
          citations: ["CARLA-ATTR-01"],
          adapterNotice: "테스트 응답",
        }),
      })
    })

    await page.goto("/")

    await expect
      .poll(() => page.locator(".cop-track-block").count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1)

    await page.locator(".cop-track-block").first().hover()
    const timelineTooltip = page.locator(".cop-track-tooltip").first()
    await expect(timelineTooltip.getByText(/배낭 소지/)).toBeVisible()
    await expect(timelineTooltip.getByText(/모자 없음/)).toBeVisible()

    // The auto Codex request for the selected attribute-enriched incident posts
    // the enriched summary; no manual button is needed.
    await expect.poll(() => postedSummary, { timeout: 10_000 }).toContain("배낭 소지")
    await expect.poll(() => postedSummary, { timeout: 10_000 }).toContain("모자 없음")
  })

  test("동일 속성이 두 카메라에서 잡히면 확신 구간 상관관계 알림과 합성 클립을 만든다", async ({
    page,
  }) => {
    const RED_FRAME =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4IyICAALUAQVZcNPCAAAAAElFTkSuQmCC"
    const RED_PNG = Buffer.from(RED_FRAME.split(",")[1] ?? "", "base64")

    const cameraA = {
      id: "CARLA-CORR-A",
      label: "상관관계 A",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl: RED_FRAME,
    }
    const cameraB = {
      id: "CARLA-CORR-B",
      label: "상관관계 B",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:02.000Z",
      lastFrameAt: "2026-07-03T00:00:03.000Z",
      latestFrameDataUrl: RED_FRAME,
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        await route.fulfill({ status: 200, contentType: "image/png", body: RED_PNG })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [cameraA, cameraB] }),
      })
    })

    const corrDetections: readonly D4dTestDetrDetection[] = [
      { label: "person", score: 0.9, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
    ]
    await page.route("**/detect", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(corrDetections),
      })
    })

    await page.addInitScript((detections: readonly D4dTestDetrDetection[]) => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => detections
      window.__D4D_TEST_CLIP_CLASSIFIER__ = async (_source, candidateLabels) => {
        const first = candidateLabels[0]
        const second = candidateLabels[1]
        if (first === undefined || second === undefined) {
          return []
        }
        return [
          { label: first, score: 1 },
          { label: second, score: 0 },
        ]
      }
    }, corrDetections)
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "corr-confirmed-sequence",
          cameraId: "CARLA-CORR",
          detections: [{ id: "det-corr-001", label: "person", confidence: 0.9 }],
          tracks: [{ id: "trk-corr-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    await page.goto("/")

    // A cross-camera full match (score 100) raises an amber correlation alert.
    const correlationAlert = page.locator(".cop-realtime-alert.kind-correlation")
    await expect(correlationAlert.first()).toBeVisible({ timeout: 15_000 })
    await expect(correlationAlert.first().getByText(/동일 인물 가능성 100%/)).toBeVisible()

    // The synthetic correlation clip lands on EVENT TIMELINE as a track block.
    await expect
      .poll(() => page.locator(".cop-track-block").count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2)
  })

  test("애매 구간 상관관계는 Codex를 자동 호출하고 알림 문구를 갱신한다", async ({ page }) => {
    const RED_FRAME =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4IyICAALUAQVZcNPCAAAAAElFTkSuQmCC"
    const BLUE_FRAME =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQEbkDAAFEAQUI0UFLAAAAAElFTkSuQmCC"
    const RED_PNG = Buffer.from(RED_FRAME.split(",")[1] ?? "", "base64")
    const BLUE_PNG = Buffer.from(BLUE_FRAME.split(",")[1] ?? "", "base64")

    const cameraA = {
      id: "CARLA-AMB-A",
      label: "애매 A",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:00.000Z",
      lastFrameAt: "2026-07-03T00:00:01.000Z",
      latestFrameDataUrl: RED_FRAME,
    }
    const cameraB = {
      id: "CARLA-AMB-B",
      label: "애매 B",
      source: "carla",
      status: "online",
      frameCount: 1,
      createdAt: "2026-07-03T00:00:02.000Z",
      lastFrameAt: "2026-07-03T00:00:03.000Z",
      latestFrameDataUrl: BLUE_FRAME,
    }

    await page.route("**/api/carla-cameras**", async (route) => {
      if (route.request().url().includes("/frame.jpg")) {
        // The dashboard resolves each camera's actual frame image via this
        // endpoint (not the raw latestFrameDataUrl in the JSON payload above),
        // so the RED/BLUE split must happen here, keyed by camera id.
        const isCameraB = route.request().url().includes("CARLA-AMB-B")
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: isCameraB ? BLUE_PNG : RED_PNG,
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ cameras: [cameraA, cameraB] }),
      })
    })

    await page.addInitScript(() => {
      window.__D4D_TEST_DETR_DETECTOR__ = async () => [
        { label: "person", score: 0.9, box: { xmin: 300, ymin: 92, xmax: 366, ymax: 258 } },
      ]
      window.__D4D_TEST_CLIP_CLASSIFIER__ = async (_source, candidateLabels) => {
        const first = candidateLabels[0]
        const second = candidateLabels[1]
        if (first === undefined || second === undefined) {
          return []
        }
        return [
          { label: first, score: 0.85 },
          { label: second, score: 0.15 },
        ]
      }
    })
    await page.route("**/api/vision-pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          provider: "transformers-detr",
          sequenceId: "corr-ambiguous-sequence",
          cameraId: "CARLA-AMB",
          detections: [{ id: "det-amb-001", label: "person", confidence: 0.9 }],
          tracks: [{ id: "trk-amb-001", status: "active_track" }],
          visualAnalysisAgent: { status: "triggered", summary: "테스트 탐지" },
          situationAnalysisAgent: { riskLevel: "watch", summary: "테스트 위험도" },
        }),
      })
    })

    let correlationCodexCalled = false
    await page.route("**/api/codex-agent", async (route) => {
      const payload = route.request().postDataJSON()
      if ((payload?.evidence?.responseOutcome ?? "") === "상관관계 자동 판단") {
        correlationCodexCalled = true
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          codexMode: "local-codex-adapter",
          decision: {
            title: "상관관계 판단",
            summary: "동일 인물 가능성 높음",
            recommendedAction: "사람 확인 유지",
            checkpoint: "correlation-review",
          },
          citations: ["CARLA-AMB-A", "CARLA-AMB-B"],
          adapterNotice: "테스트 응답",
        }),
      })
    })

    await page.goto("/")

    // A color-only mismatch (score 70) is ambiguous: a "판단 중" alert appears,
    // Codex is consulted directly, and the alert text is rewritten with the
    // Codex summary.
    const correlationAlert = page.locator(".cop-realtime-alert.kind-correlation")
    await expect(correlationAlert.first()).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => correlationCodexCalled, { timeout: 15_000 }).toBe(true)
    await expect(correlationAlert.getByText(/Codex 판단: 동일 인물 가능성 높음/)).toBeVisible({
      timeout: 15_000,
    })
  })
})
