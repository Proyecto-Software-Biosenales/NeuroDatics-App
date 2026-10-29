import { expect, test, type Locator, type Page } from "@playwright/test"

/**
 * "Comparar participantes": one card per participant, same chart and filters.
 * The API is simulated (page.route); latencies below are mock delays, not
 * measurements of the real backend.
 */

const TEST_USER_ID = "e2e-participant-comparison"
const PARTICIPANT_COUNT = 40
const CODES = Array.from({ length: PARTICIPANT_COUNT }, (_, index) => `P${String(index + 1).padStart(2, "0")}`)
const SCENARIO = "Escenario concreto"
const EEG_CHANNELS = ["le", "f4", "c4", "p4", "p3", "c3", "f3"]
const ERROR_ONCE = "P05"
const NO_DATA = "P06"

const project = {
  id: "project-alpha",
  name: "Proyecto Alfa",
  status: "active",
  ingestion_generation: 3,
  sensors: [
    { id: "alpha-eye", sensor_type: "EyeTracker" },
    { id: "alpha-gsr", sensor_type: "GSR" },
    { id: "alpha-eeg", sensor_type: "EEG" },
  ],
}

// Deliberately not in code order: the dialog sorts real codes naturally.
const participants = [...CODES].reverse().map((code, index) => ({ participant_code: code, user_index: index + 1 }))

const indexOf = (code: string) => CODES.indexOf(code)
const onsetOf = (code: string) => 100 + indexOf(code) * 10

/** P01 has 61 samples, P40 has 100: a card's count names its participant. */
function pupilFor(code: string, start: number | null, end: number | null) {
  const count = 61 + indexOf(code)
  const onset = onsetOf(code)
  const time = Array.from({ length: count }, (_, k) => onset + k * 0.25).filter(
    (value) => (start == null || value >= start) && (end == null || value <= end)
  )
  const left = time.map((value) => 3 + indexOf(code) * 0.02 + Math.sin(value) * 0.2)
  const right = time.map((value) => 3.1 + Math.cos(value) * 0.2)
  return { time, left, right, average: left, smooth_left: left, smooth_right: right }
}

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
)

interface MockState {
  unhandled: string[]
  /** Card work: scenario timing and display-reduced traces. */
  cardRequests: Array<{ path: string; participant: string; params: URLSearchParams }>
  inFlight: number
  maxInFlight: number
  gazeAt: URLSearchParams[]
  delayMs: number
  aborted: number
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function installSession(page: Page) {
  await page.addInitScript(({ userId }) => {
    window.localStorage.setItem(
      "neurodatics-auth-session",
      JSON.stringify({
        user: { id: userId, email: "participants-e2e@neurodatics.test", name: "Participants E2E", authSource: "google-oauth" },
        session: { accessToken: "participants-e2e-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
      })
    )
  }, { userId: TEST_USER_ID })
}

/** `pupilSpike` gives that participant's card trace one 12 mm artefact sample. */
/**
 * `sequences`: each recording labels the scenario from 2 s after its onset, for
 * 10 s; without it no recording labels any (each card keeps its own time).
 */
async function mockApi(page: Page, options: { delayMs?: number; pupilSpike?: string; sequences?: boolean } = {}): Promise<MockState> {
  const state: MockState = { unhandled: [], cardRequests: [], inFlight: 0, maxInFlight: 0, gazeAt: [], delayMs: options.delayMs ?? 120, aborted: 0 }
  let errorServed = false
  page.on("requestfailed", (request) => {
    if (request.url().includes("/analytics/") && request.failure()?.errorText.includes("ABORTED")) state.aborted += 1
  })

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/\/$/, "")
    const params = url.searchParams
    const participant = params.get("participant_code") ?? ""
    const fulfill = async (response: Parameters<typeof route.fulfill>[0]) => {
      try {
        await route.fulfill(response)
      } catch {
        // The page aborted the request while the mock was waiting.
      }
    }

    if (path === "/api/projects") return fulfill({ json: [project] })
    if (path === `/api/projects/${project.id}`) return fulfill({ json: project })
    if (path.endsWith("/analytics/participants")) return fulfill({ json: participants })
    if (path.endsWith("/analytics/scenarios")) return fulfill({ json: [{ name: SCENARIO, type: "image", file_id: "scenario-image" }] })
    if (path.endsWith("/analytics/stimulus-sequence")) {
      const onset = onsetOf(participant)
      return fulfill({ json: { segments: options.sequences ? [{ scenario: SCENARIO, onset_s: onset + 2, end_s: onset + 12 }] : [] } })
    }

    const isCardWork =
      path.endsWith("/analytics/scenario-timing") ||
      (path.endsWith("/analytics/timeseries/pupil") && params.get("decimation") === "minmax_envelope")
    if (isCardWork) {
      state.cardRequests.push({ path, participant, params })
      state.inFlight += 1
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
      // Later participants answer first: responses arrive out of order.
      await delay(state.delayMs + (PARTICIPANT_COUNT - indexOf(participant)) * 3)
      state.inFlight -= 1
      if (path.endsWith("/scenario-timing")) {
        return fulfill({
          json: { scenario: SCENARIO, time_basis: "scenario_onset", onset_s: onsetOf(participant), end_s: onsetOf(participant) + 30, gsr_origin_s: null },
        })
      }
      if (participant === NO_DATA) return fulfill({ status: 404, json: { detail: "Participant data not found" } })
      if (participant === ERROR_ONCE && !errorServed) {
        errorServed = true
        return fulfill({ status: 500, json: { detail: "Fallo simulado del servidor" } })
      }
      const start = params.get("start_time_s")
      const end = params.get("end_time_s")
      const trace = pupilFor(participant, start == null ? null : Number(start), end == null ? null : Number(end))
      // Every left-pupil field shares one array.
      if (participant === options.pupilSpike && trace.left.length > 5) trace.left[5] = 12
      return fulfill({ json: trace })
    }
    if (path.endsWith("/analytics/timeseries/pupil")) return fulfill({ json: pupilFor(participant || "P01", null, null) })
    if (path.endsWith("/analytics/timeseries/eeg")) {
      state.cardRequests.push({ path, participant, params })
      const requested = (params.get("channels") ?? "").split(",").filter(Boolean)
      const channels = requested.length ? requested : EEG_CHANNELS
      const time = Array.from({ length: 41 + indexOf(participant || "P01") }, (_, k) => onsetOf(participant || "P01") + k * 0.1)
      const trace = Object.fromEntries(channels.map((channel, c) => [channel, time.map((value) => Math.sin(value + c) * 20)]))
      return fulfill({
        json: { time, channels, available_channels: EEG_CHANNELS, sampling_rate_hz: 250, metadata: { version: "eeg-v2", warnings: [] }, raw: trace, smooth: trace },
      })
    }
    if (path.endsWith("/analytics/psd/eeg")) {
      const frequency = Array.from({ length: 40 }, (_, k) => k + 1)
      return fulfill({
        json: { frequency, channels: EEG_CHANNELS, available_channels: EEG_CHANNELS, sampling_rate_hz: 250, use_db: true, unit: "dB", power: Object.fromEntries(EEG_CHANNELS.map((channel) => [channel, frequency.map((f) => -f / 4)])), metadata: { version: "eeg-v2", warnings: [] } },
      })
    }
    if (path.endsWith("/analytics/timeseries/gaze")) {
      state.cardRequests.push({ path, participant, params })
      const time = Array.from({ length: 21 + indexOf(participant || "P01") }, (_, k) => onsetOf(participant || "P01") + k * 0.5)
      return fulfill({ json: { time, gx_clean: time.map(() => 40), gy_clean: time.map(() => 60), warnings: [] } })
    }
    if (path.endsWith("/analytics/timeseries/distance")) return fulfill({ json: { time: [0, 1], distance_cm: [60, 61] } })
    if (path.endsWith("/analytics/comparison/charts")) return fulfill({ json: { charts: [] } })
    if (path.endsWith("/analytics/fixations/sensitivity")) {
      return fulfill({
        json: {
          default_min_fixation_duration_ms: 200,
          available_min_fixation_durations_ms: [100, 150, 200, 250, 300],
          points: [],
        },
      })
    }
    if (/\/analytics\/(fixations|heatmap|scanpath)/.test(path)) state.cardRequests.push({ path, participant, params })
    const i = indexOf(participant || "P01")
    if (path.endsWith("/analytics/scanpath")) {
      return fulfill({
        json: {
          objectives: [
            { id: 1, cx: 0.2 + i * 0.01, cy: 0.3, duration_s: 0.2, radius_norm: 0.3, t_start: 0, t_end: 0.2, n_points: 10 },
            { id: 2, cx: 0.6, cy: 0.5 + i * 0.005, duration_s: 0.6 + i * 0.02, radius_norm: 0.6, t_start: 0.3, t_end: 0.9, n_points: 30 },
          ],
          n_objectives: 2, total_distance_px: 300 + i, avg_duration_s: 0.4, total_duration_s: 0.8 + i * 0.02,
          radius_scale: { version: "absolute-area-v1", encoding: "area", cap_ms: 2000 }, scenario_file_id: "scenario-image",
        },
      })
    }
    if (path.endsWith("/analytics/fixations")) {
      return fulfill({
        json: {
          fixations: [{ x_norm: 0.4, y_norm: 0.5, time_s: 1, duration_s: 0.3 }],
          stats: { n_fixations: 10 + i, max_duration_s: 0.5, avg_duration_s: 0.25 },
          scenario_file_id: "scenario-image", cache_generation: 3, coordinate_transform: null,
        },
      })
    }
    if (path.endsWith("/analytics/heatmap")) return fulfill({ body: onePixelPng, contentType: "image/png" })
    const eegCommon = { channels: EEG_CHANNELS, available_channels: EEG_CHANNELS, sampling_rate_hz: 250, metadata: { version: "eeg-v2", warnings: [], hop_s: 1 } }
    if (path.endsWith("/analytics/spectrogram/eeg")) {
      const time = Array.from({ length: 12 }, (_, k) => onsetOf(participant || "P01") + k)
      return fulfill({
        json: {
          ...eegCommon, time, frequency: [1, 5, 10, 15, 20, 25], unit: "dB", use_db: true, normalize: "none",
          color_domain: { min: -10 - i, max: 10 + i },
          power: Object.fromEntries(EEG_CHANNELS.map((channel, c) => [channel, [1, 5, 10, 15, 20, 25].map((f) => time.map((t) => Math.sin(t + f + c) * (10 + i)))])),
        },
      })
    }
    if (path.endsWith("/analytics/topography/eeg")) {
      const time = Array.from({ length: 10 }, (_, k) => onsetOf(participant || "P01") + k * 2)
      const topo = ["f3", "f4", "c3", "c4", "p3", "p4"]
      return fulfill({
        json: {
          ...eegCommon, channels: topo, time, unit: "uV^2", window_s: 2, overlap_ratio: 0.5, remove_dc: true,
          color_domain: { min: 0, max: 10 + i },
          positions: { f3: [-0.5, 0.5], f4: [0.5, 0.5], c3: [-0.5, 0], c4: [0.5, 0], p3: [-0.5, -0.5], p4: [0.5, -0.5] },
          power: Object.fromEntries(topo.map((channel, c) => [channel, time.map((_, k) => (k + c + i) % 10)])),
        },
      })
    }
    if (path.endsWith("/analytics/gaze-at")) {
      state.gazeAt.push(params)
      const t = Number(params.get("t_s"))
      return fulfill({
        json: { requested_time_s: t, nearest_time_s: t, scenario: SCENARIO, gx: 40, gy: 55, scenario_file_id: "scenario-image", scenario_type: "image", scenario_time_s: t - onsetOf(participant) },
      })
    }
    if (path.endsWith("/analytics/aois")) {
      return fulfill({
        json: { scenario: SCENARIO, scenario_file_id: "scenario-image", aois: [], transitions: [], total_fixations: 0, total_dwell_time_ms: 0, observed_aoi_dwell_time_ms: 0, observed_aoi_dwell_time_percent: 0 },
      })
    }
    if (/\/files\/[^/]+\/(image|preview)$/.test(path)) return fulfill({ body: onePixelPng, contentType: "image/png" })
    if (path === "/api/settings/screen") return fulfill({ json: { screen: { width_px: 1280, height_px: 1024, width_cm: null, height_cm: null }, confirmed: true } })
    state.unhandled.push(`${route.request().method()} ${url.pathname}`)
    return fulfill({ status: 501, json: { detail: `Unhandled mock: ${url.pathname}` } })
  })
  return state
}

async function openPupilView(page: Page) {
  await page.goto("/dashboard")
  const scenarioTrigger = page.locator('[data-slot="select-trigger"]').first()
  await scenarioTrigger.click()
  await page.getByRole("option", { name: SCENARIO, exact: true }).click()
  await expect(scenarioTrigger).toContainText(SCENARIO)
  await expect(page.getByRole("button", { name: "Comparar participantes" }).first()).toBeEnabled()
}

const dialogOf = (page: Page) => page.getByTestId("participant-comparison-dialog")
const cardOf = (page: Page, code: string) => dialogOf(page).locator(`[data-participant="${code}"]`)
const cardChart = (card: Locator) => card.getByRole("img", { name: /observaciones/ })

async function openComparison(page: Page) {
  const trigger = page.getByRole("button", { name: "Comparar participantes" }).first()
  await trigger.click()
  await expect(dialogOf(page)).toBeVisible()
  return trigger
}

test.beforeEach(async ({ page }) => {
  await installSession(page)
})

test("loads visible cards through a bounded queue, keeps each participant isolated and restores the view", async ({ page }) => {
  const state = await mockApi(page)
  await openPupilView(page)
  const main = page.locator("main.analytics-shell")
  await main.evaluate((element) => { element.scrollTop = 40 })
  const scrollBefore = await main.evaluate((element) => element.scrollTop)

  // Closed dialog: no comparison work at all.
  await page.waitForTimeout(300)
  expect(state.cardRequests).toHaveLength(0)
  await expect(page.getByTestId("participant-comparison-card")).toHaveCount(0)

  const openedAt = Date.now()
  const trigger = await openComparison(page)
  const dialog = dialogOf(page)
  await expect(dialog.getByRole("heading", { name: "Comparar participantes · Dilatación pupilar" })).toBeVisible()
  await expect(dialog.getByTestId("participant-comparison-counter")).toHaveText("40 de 40 participantes")
  await expect(dialog).toContainText(`Escenario: ${SCENARIO}`)
  await expect(cardChart(cardOf(page, "P01"))).toHaveAttribute("aria-label", /61 observaciones; eje horizontal en segundos desde el inicio del estímulo/)
  const coldFirstCardMs = Date.now() - openedAt

  // Stable natural order with real codes; the source view is marked.
  const order = await dialog.getByTestId("participant-comparison-card").evaluateAll((cards) => cards.slice(0, 3).map((card) => card.getAttribute("data-participant")))
  expect(order).toEqual(["P01", "P02", "P03"])
  // The dashboard selects the first participant the API lists: P40.
  await expect(cardOf(page, "P40")).toContainText("Vista de origen")
  await expect(cardOf(page, "P01")).not.toContainText("Vista de origen")

  // All selected is not all mounted.
  const mountedAtOpen = await dialog.locator('[data-card-state="mounted"]').count()
  expect(mountedAtOpen).toBeGreaterThan(0)
  expect(mountedAtOpen).toBeLessThan(PARTICIPANT_COUNT)

  // Partial failures: one error with retry, one participant without data.
  // Cards are stacked one per row, so these sit below the first screen.
  await cardOf(page, NO_DATA).scrollIntoViewIfNeeded()
  await expect(cardOf(page, ERROR_ONCE).getByTestId("card-error")).toContainText("Fallo simulado del servidor")
  await expect(cardOf(page, NO_DATA).getByTestId("card-empty")).toContainText("No hay datos registrados")
  await expect(cardChart(cardOf(page, "P04"))).toHaveAttribute("aria-label", /64 observaciones/)
  await cardOf(page, ERROR_ONCE).getByRole("button", { name: "Reintentar" }).click()
  await expect(cardChart(cardOf(page, ERROR_ONCE))).toHaveAttribute("aria-label", /65 observaciones/)

  // Scroll to the end: far cards unmount, keeping their height.
  const scroller = dialog.getByTestId("participant-comparison-scroll")
  const heightBefore = await scroller.evaluate((element) => element.scrollHeight)
  const scrollStartedAt = Date.now()
  for (let step = 0; step < 12; step += 1) {
    await scroller.evaluate((element) => element.scrollBy(0, element.clientHeight * 0.9))
    await page.waitForTimeout(60)
  }
  await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await expect(cardChart(cardOf(page, "P40"))).toHaveAttribute("aria-label", /100 observaciones/)
  const scrollToLastMs = Date.now() - scrollStartedAt
  await expect(cardOf(page, "P01")).toHaveAttribute("data-card-state", "placeholder")
  expect(await scroller.evaluate((element) => element.scrollHeight)).toBe(heightBefore)
  const mountedAtEnd = await dialog.locator('[data-card-state="mounted"]').count()
  expect(mountedAtEnd).toBeLessThan(PARTICIPANT_COUNT)

  // Out-of-order answers never cross cards: every loaded chart counts its own samples.
  for (const code of ["P37", "P38", "P39", "P40"]) {
    await cardOf(page, code).scrollIntoViewIfNeeded()
    await expect(cardChart(cardOf(page, code))).toHaveAttribute("aria-label", new RegExp(`${61 + indexOf(code)} observaciones`))
  }

  // Concurrency never exceeded four and no participant was requested twice.
  expect(state.maxInFlight).toBeLessThanOrEqual(4)
  const traces = state.cardRequests.filter((request) => request.path.endsWith("/timeseries/pupil"))
  const counts = new Map<string, number>()
  for (const request of traces) counts.set(request.participant, (counts.get(request.participant) ?? 0) + 1)
  for (const [code, count] of counts) expect(count, code).toBe(code === ERROR_ONCE ? 2 : 1)
  for (const request of traces) {
    expect(request.params.get("max_points")).toBe("2000")
    expect(request.params.get("scenario")).toBe(SCENARIO)
  }

  // Escape closes, focus returns to the button and the view keeps its scroll.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(await main.evaluate((element) => element.scrollTop)).toBe(scrollBefore)
  await expect(page.locator('[data-slot="select-trigger"]').first()).toContainText(SCENARIO)
  const afterClose = state.cardRequests.length
  await page.waitForTimeout(400)
  expect(state.cardRequests.length).toBe(afterClose)
  await expect(page.getByTestId("participant-comparison-card")).toHaveCount(0)

  // Reopening reuses the bounded cache: the first cards need no new requests.
  const reopenedAt = Date.now()
  await openComparison(page)
  await expect(cardChart(cardOf(page, "P01"))).toHaveAttribute("aria-label", /61 observaciones/)
  const warmFirstCardMs = Date.now() - reopenedAt
  await page.waitForTimeout(300)
  const newTraces = state.cardRequests.slice(afterClose).filter((request) => request.path.endsWith("/timeseries/pupil"))
  expect(newTraces).toHaveLength(0)
  await dialog.getByRole("button", { name: "Cerrar comparación" }).click()
  await expect(dialog).toBeHidden()

  expect(state.unhandled).toEqual([])
  test.info().annotations.push({
    type: "medición simulada",
    description: `40 participantes, dilatación pupilar, latencia simulada ${state.delayMs}–${state.delayMs + 120} ms: primera tarjeta en frío ${coldFirstCardMs} ms, desplazamiento hasta P40 ${scrollToLastMs} ms, reapertura en caliente ${warmFirstCardMs} ms, máximo ${state.maxInFlight} consultas simultáneas, ${mountedAtOpen}/${mountedAtEnd} tarjetas montadas (apertura/final).`,
  })
  console.log(test.info().annotations.at(-1)?.description)
})

test("selector searches, selects and clears, and deselection cancels pending work", async ({ page }) => {
  const state = await mockApi(page, { delayMs: 1500 })
  await openPupilView(page)
  await openComparison(page)
  const dialog = dialogOf(page)
  await expect.poll(() => state.inFlight).toBeGreaterThan(0)

  await dialog.getByRole("button", { name: /Participantes: 40 de 40 seleccionados/ }).click()
  const picker = page.getByRole("dialog", { name: "Seleccionar participantes" })
  await picker.getByRole("searchbox").fill("p1")
  await expect(picker.getByRole("checkbox")).toHaveCount(10)
  await picker.getByRole("button", { name: "Quitar selección" }).click()
  await expect(picker.getByTestId("participant-selection-count")).toHaveText("30 de 40 seleccionados")
  await picker.getByRole("searchbox").fill("")
  await picker.getByRole("button", { name: "Quitar selección" }).click()
  await expect(picker.getByTestId("participant-selection-count")).toHaveText("0 de 40 seleccionados")
  await expect(dialog).toContainText("No hay participantes seleccionados")
  await expect(dialog.getByTestId("participant-comparison-card")).toHaveCount(0)
  // Deselecting every card aborted the requests that were still running.
  await expect.poll(() => state.aborted).toBeGreaterThan(0)

  await picker.getByRole("button", { name: "Seleccionar todos" }).click()
  await expect(picker.getByTestId("participant-selection-count")).toHaveText("40 de 40 seleccionados")
  await picker.getByRole("checkbox", { name: "Participante P02" }).click()
  await page.keyboard.press("Escape")
  await expect(picker).toBeHidden()
  await expect(dialog.getByTestId("participant-comparison-counter")).toHaveText("39 de 40 participantes")
  await expect(cardOf(page, "P02")).toHaveCount(0)

  // Closing mid-load aborts what is running and starts nothing new.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  const settledRequests = state.cardRequests.length
  await page.waitForTimeout(2000)
  expect(state.cardRequests.length).toBe(settledRequests)
  expect(state.unhandled).toEqual([])
})

test("a click pins the stimulus point for that participant and a drag zooms only its card", async ({ page }) => {
  const state = await mockApi(page, { delayMs: 20 })
  await openPupilView(page)
  await openComparison(page)
  const dialog = dialogOf(page)
  const second = cardOf(page, "P02")
  const chart = cardChart(second)
  await expect(chart).toHaveAttribute("aria-label", /62 observaciones/)
  // No nested comparisons from inside the dialog.
  await expect(dialog.getByRole("button", { name: "Comparar participantes" })).toHaveCount(0)

  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
  await second.locator(".recharts-active-dot").first().click()
  const aside = dialog.getByRole("complementary", { name: "Punto sobre estímulo" })
  await expect(aside).toContainText("Participante P02")
  await expect(aside).toContainText("desde el inicio del estímulo")
  await expect(aside.getByRole("heading", { name: "Punto sobre estímulo" })).toBeVisible()
  await expect.poll(() => state.gazeAt.length).toBeGreaterThan(0)
  const gaze = state.gazeAt.at(-1)!
  expect(gaze.get("participant_code")).toBe("P02")
  // The gaze lookup uses P02's own recording time, not the aligned axis.
  expect(Number(gaze.get("t_s"))).toBeGreaterThanOrEqual(onsetOf("P02"))
  // The same stimulus instant is marked on another participant's card.
  await expect(cardOf(page, "P03").locator(".recharts-reference-line")).not.toHaveCount(0)

  const lookups = state.gazeAt.length
  const third = cardOf(page, "P03")
  await cardChart(third).scrollIntoViewIfNeeded()
  const thirdBox = (await cardChart(third).boundingBox())!
  await page.mouse.move(thirdBox.x + thirdBox.width * 0.3, thirdBox.y + thirdBox.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(thirdBox.x + thirdBox.width * 0.6, thirdBox.y + thirdBox.height * 0.4, { steps: 6 })
  await page.mouse.up()
  await expect(third.getByRole("button", { name: "Volver a la vista completa" })).toBeVisible()
  await expect(cardOf(page, "P04").getByRole("button", { name: "Volver a la vista completa" })).toHaveCount(0)
  await page.waitForTimeout(200)
  expect(state.gazeAt.length).toBe(lookups)
  expect(state.unhandled).toEqual([])
})

test("with every scenario the pinned recording second is marked on the other cards", async ({ page }) => {
  const state = await mockApi(page, { delayMs: 20 })
  await page.goto("/dashboard")
  await openComparison(page)
  const dialog = dialogOf(page)
  const second = cardOf(page, "P02")
  const chart = cardChart(second)
  await expect(chart).toHaveAttribute("aria-label", /observaciones/)
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  // Early in P02's recording (from 110 s): a second P01's recording (100-115 s) also holds.
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.4)
  await second.locator(".recharts-active-dot").first().click()
  const aside = dialog.getByRole("complementary", { name: "Punto sobre estímulo" })
  await expect(aside).toContainText("mismo segundo de grabación en todas las tarjetas")
  await expect(cardOf(page, "P01").locator(".recharts-reference-line")).not.toHaveCount(0)
  expect(state.unhandled).toEqual([])
})

test("with every scenario and labelled stimuli, every card lines up by stimulus", async ({ page }) => {
  const state = await mockApi(page, { delayMs: 20, sequences: true })
  await page.goto("/dashboard")
  await openComparison(page)
  const dialog = dialogOf(page)
  await expect(dialog).toContainText("cada estímulo empieza en el mismo segundo en todas las tarjetas")
  // Only the 10 s of the stimulus are drawn (41 samples every 0.25 s), counted from its start.
  for (const code of ["P01", "P02"]) {
    await expect(cardChart(cardOf(page, code))).toHaveAttribute("aria-label", /41 observaciones; eje horizontal en segundos desde el inicio del primer estímulo/)
  }
  const ticks = (code: string) => cardOf(page, code).locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value")
  await expect(ticks("P01").first()).toHaveText(/^0(\.0+)?$/)
  // The common scale shares the stimulus axis.
  expect(await ticks("P01").last().textContent()).toBe(await ticks("P02").last().textContent())

  const second = cardOf(page, "P02")
  const chart = cardChart(second)
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
  // Both pupils' dots sit at that instant; the one drawn last is on top.
  await second.locator(".recharts-active-dot").last().click()
  const aside = dialog.getByRole("complementary", { name: "Punto sobre estímulo" })
  await expect(aside).toContainText("desde el inicio del primer estímulo")
  await expect(aside).toContainText("mismo instante del estímulo en todas las tarjetas")
  // The gaze is looked up at P02's own recording second of that stimulus.
  await expect.poll(() => state.gazeAt.length).toBeGreaterThan(0)
  const gaze = state.gazeAt.at(-1)!
  expect(gaze.get("participant_code")).toBe("P02")
  expect(Number(gaze.get("t_s"))).toBeGreaterThanOrEqual(onsetOf("P02") + 2)
  expect(Number(gaze.get("t_s"))).toBeLessThanOrEqual(onsetOf("P02") + 12)
  await expect(cardOf(page, "P01").locator(".recharts-reference-line")).not.toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath("participant-comparison-by-stimulus.png") })
  expect(state.unhandled).toEqual([])
})

test("renders on a narrow screen without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { delayMs: 20 })
  await openPupilView(page)
  await openComparison(page)
  const dialog = dialogOf(page)
  await expect(cardChart(cardOf(page, "P01"))).toHaveAttribute("aria-label", /61 observaciones/)
  const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: test.info().outputPath("participant-comparison-narrow.png") })
})

test("desktop screenshot of the participant grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockApi(page, { delayMs: 20 })
  await openPupilView(page)
  await openComparison(page)
  await expect(cardChart(cardOf(page, "P02"))).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("participant-comparison-desktop.png") })
  // The notes live after the last card.
  const notes = dialogOf(page).getByRole("region", { name: "Información de la comparación" })
  await notes.scrollIntoViewIfNeeded()
  await expect(notes).toContainText("Escenario:")
  await expect(dialogOf(page).getByTestId("participant-comparison-scale-note")).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("participant-comparison-desktop-notes.png") })
})

test("the common scale runs from the lowest to the highest value of every card, so no line is cut", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 730 })
  await mockApi(page, { delayMs: 20, pupilSpike: "P02" })
  await openPupilView(page)
  await openComparison(page)
  const dialog = dialogOf(page)
  const topTick = async (code: string) => {
    const ticks = await cardOf(page, code).locator(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value").allTextContents()
    return ticks.length ? Math.max(...ticks.map(Number)) : Number.NaN
  }
  await expect(cardChart(cardOf(page, "P01"))).toBeVisible()
  await expect(cardChart(cardOf(page, "P02"))).toBeVisible()
  // Pupils span about 2.8-4 mm; P02's 12 mm sample sets the top of every card.
  await expect.poll(() => topTick("P01")).toBeGreaterThanOrEqual(12)
  await expect.poll(() => topTick("P02")).toBeGreaterThanOrEqual(12)
  expect(await topTick("P01")).toBe(await topTick("P02"))
  const notes = dialog.getByRole("region", { name: "Información de la comparación" })
  await expect(notes.getByTestId("participant-comparison-scale-note")).toContainText("del valor más bajo al más alto, así ninguna línea se corta")
  await page.mouse.move(0, 0)
  await page.screenshot({ path: test.info().outputPath("participant-comparison-common-scale.png") })

  // Own scales: the artefact's card reaches it, the others keep theirs.
  await dialog.getByRole("button", { name: "Escalas propias", exact: true }).click()
  await expect.poll(() => topTick("P02")).toBeGreaterThanOrEqual(12)
  await expect.poll(() => topTick("P01")).toBeLessThan(5)
  await expect(notes.getByTestId("participant-comparison-scale-note")).not.toContainText("del valor más bajo al más alto, así ninguna línea se corta")
})

test("EEG keeps the source signal mode and channels; Comparativas panels open the grid; spatial maps explain their scenario restriction", async ({ page }) => {
  const state = await mockApi(page, { delayMs: 20 })
  await page.goto("/dashboard")
  await page.getByRole("button", { name: "Electroencefalógrafo" }).click()
  await page.getByRole("button", { name: "Cruda", exact: true }).first().click()
  await page.getByRole("button", { name: "Comparar participantes" }).first().click()
  const dialog = dialogOf(page)
  await expect(dialog.getByRole("heading", { name: "Comparar participantes · EEG por canal" })).toBeVisible()
  await expect(cardOf(page, "P01").getByRole("img", { name: /Amplitud \(µV\)\. 41 observaciones/ })).toBeVisible()
  // "Todos los escenarios": no common instant, and the notice says so.
  await expect(dialog).toContainText("cada tarjeta usa el eje temporal de su propia grabación")
  const eeg = state.cardRequests.filter((request) => request.path.endsWith("/timeseries/eeg") && request.params.get("max_points") === "1600")
  expect(eeg.length).toBeGreaterThan(0)
  for (const request of eeg) {
    expect(request.params.get("decimation")).toBe("minmax_envelope")
    expect(request.params.get("smooth_window_s")).toBe("0.2")
    expect(request.params.get("channels")).toBe(EEG_CHANNELS.join(","))
  }
  // Raw mode: one trace per channel, no smoothed lines in the legend.
  await expect(cardOf(page, "P01").getByRole("group", { name: "Leyenda de la gráfica" })).toHaveText(/LE.*F3/)
  await expect(cardOf(page, "P01").getByRole("group", { name: "Leyenda de la gráfica" })).not.toContainText("suavizada")
  await dialog.getByRole("button", { name: "Cerrar comparación" }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Comparativas", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Comparativas", exact: true })).toBeVisible()
  const gazePanelButton = page.locator('button[aria-controls="comparison-panel-gaze"]').locator("xpath=..").getByRole("button", { name: "Comparar participantes" })
  await gazePanelButton.click()
  await expect(dialog.getByRole("heading", { name: "Comparar participantes · Punto de mirada" })).toBeVisible()
  await expect(cardOf(page, "P02").getByRole("img", { name: /Posición \(%\)\. 22 observaciones/ })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(gazePanelButton).toBeFocused()

  await page.getByRole("button", { name: /Gráficas a comparar/ }).click()
  await page.getByRole("button", { name: "Limpiar", exact: true }).click()
  await page.getByRole("checkbox", { name: "Mapa de calor" }).click()
  await page.getByRole("button", { name: "Aplicar selección" }).click()
  await page.locator('button[aria-controls="comparison-panel-heatmap"]').locator("xpath=..").getByRole("button", { name: "Comparar participantes" }).click()
  await expect(dialog).toContainText("se calcula sobre la imagen de un estímulo concreto")
  await expect(dialog.getByTestId("participant-comparison-card")).toHaveCount(0)
  expect(state.cardRequests.filter((request) => /fixations|heatmap/.test(request.path))).toHaveLength(0)
})

test("spatial and EEG frequency views render per participant without runtime errors", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const state = await mockApi(page, { delayMs: 20 })
  await page.goto("/dashboard")
  const scenarioTrigger = page.locator('[data-slot="select-trigger"]').first()
  await scenarioTrigger.click()
  await page.getByRole("option", { name: SCENARIO, exact: true }).click()
  const dialog = dialogOf(page)

  await page.getByRole("button", { name: "Comparativas", exact: true }).click()
  await page.getByRole("button", { name: /Gráficas a comparar/ }).click()
  await page.getByRole("button", { name: "Limpiar", exact: true }).click()
  await page.getByRole("checkbox", { name: "Mapa de recorridos" }).click()
  await page.getByRole("checkbox", { name: "Mapa de calor" }).click()
  await page.getByRole("button", { name: "Aplicar selección" }).click()
  for (const [id, text] of [["scanpath", "Tiempo fijado"], ["heatmap", "Fijaciones"]] as const) {
    await page.locator(`button[aria-controls="comparison-panel-${id}"]`).locator("xpath=..").getByRole("button", { name: "Comparar participantes" }).click()
    await expect(cardOf(page, "P02")).toContainText(text)
    await expect(cardOf(page, "P02").locator("img").first()).toBeVisible()
    // Fixation-derived charts offer the threshold next to the participant picker.
    const threshold = dialog.getByRole("combobox", { name: "Duración mínima de fijación" })
    await expect(threshold).toBeEnabled()
    await expect(threshold).toContainText("200 ms")
    if (id === "scanpath") {
      // Same look as the "Mapa de recorridos" tab, not the Comparativas red.
      await expect(cardOf(page, "P02").locator('[data-testid="scanpath-fixation-1"] circle')).toHaveAttribute("fill", "rgba(26, 115, 232, 0.9)")
      const before = state.cardRequests.length
      await threshold.click()
      await page.getByRole("option", { name: "100 ms", exact: true }).click()
      await expect(threshold).toContainText("100 ms")
      await expect.poll(() =>
        state.cardRequests.slice(before).some((request) => request.path.endsWith("/analytics/scanpath") && request.params.get("min_fixation_duration_ms") === "100")
      ).toBe(true)
      await expect(dialog).toContainText("Duración mínima de fijación: 100 ms")
    }
    await page.screenshot({ path: test.info().outputPath(`participant-comparison-${id}.png`) })
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  }

  await page.getByRole("button", { name: "Electroencefalógrafo" }).click()
  await page.getByRole("tab", { name: "Espectrograma de frecuencias" }).click()
  await page.getByRole("button", { name: "Comparar participantes" }).first().click()
  await expect(dialog.getByRole("heading", { name: /Espectrograma de frecuencias/ })).toBeVisible()
  await expect(cardOf(page, "P02").locator("canvas")).toHaveCount(7)
  await page.screenshot({ path: test.info().outputPath("participant-comparison-spectrogram.png") })
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()

  await page.getByRole("tab", { name: "Topografía EEG" }).click()
  await page.getByRole("button", { name: "Comparar participantes" }).first().click()
  await expect(cardOf(page, "P02").locator("canvas")).toHaveCount(1)
  await expect(cardOf(page, "P02")).toContainText("desde el inicio del estímulo")
  await page.screenshot({ path: test.info().outputPath("participant-comparison-topography.png") })
  expect(errors).toEqual([])
})

test("the pupil axis starts at zero, Ajustar fits it, and the button sits in the filters bar", async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1536, height: 730 })
  await openPupilView(page)
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Dilatación pupilar" }) })
  const yTicks = () => card.locator(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value").allTextContents()

  // The source participant spans 2.9-3.98 mm across both pupils.
  await expect.poll(yTicks).toEqual(["0", "1", "2", "3", "4", "5"])
  const fit = card.getByRole("button", { name: "Ajustar" })
  await expect(fit).toHaveAttribute("aria-pressed", "false")
  await fit.click()
  await expect(fit).toHaveAttribute("aria-pressed", "true")
  await expect.poll(yTicks).toEqual(["3.00", "3.25", "3.50", "3.75", "4.00"])
  // Screenshot once the lines finish redrawing, with the pointer off the button.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(1600)
  await page.screenshot({ path: test.info().outputPath("pupil-axis-fitted.png") })
  // Both pupils set the scale, so switching pupils never moves it.
  await card.getByRole("button", { name: "Izquierda", exact: true }).click()
  await expect.poll(yTicks).toEqual(["3.00", "3.25", "3.50", "3.75", "4.00"])
  await fit.click()
  await expect.poll(yTicks).toEqual(["0", "1", "2", "3", "4", "5"])

  // The header controls share one height.
  const heights = await Promise.all([
    card.getByRole("group", { name: "Ajustar" }),
    card.getByRole("group", { name: "Modo de visualización" }),
    card.getByRole("button", { name: /^Ventana temporal/ }),
  ].map(async (control) => (await control.boundingBox())!.height))
  expect(new Set(heights).size).toBe(1)

  // One compare button, right after the participant select and as tall as it.
  const compare = page.getByTestId("compare-participants-button")
  await expect(compare).toHaveCount(1)
  await expect(card.getByTestId("compare-participants-button")).toHaveCount(0)
  const participantBox = (await page.locator('[data-slot="select-trigger"]').nth(1).boundingBox())!
  const compareBox = (await compare.boundingBox())!
  expect(compareBox.height).toBe(participantBox.height)
  expect(compareBox.y).toBe(participantBox.y)
  expect(compareBox.x).toBeGreaterThan(participantBox.x + participantBox.width)
  expect(compareBox.x - (participantBox.x + participantBox.width)).toBeLessThan(16)
  await page.screenshot({ path: test.info().outputPath("pupil-axis-and-filters.png") })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(compare).toBeVisible()
  const main = page.locator("main.analytics-shell")
  expect(await main.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: test.info().outputPath("pupil-axis-390.png") })
})
