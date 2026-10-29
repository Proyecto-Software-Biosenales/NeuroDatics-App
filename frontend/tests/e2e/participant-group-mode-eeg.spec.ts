import { expect, test, type Page } from "@playwright/test"

/**
 * «Promedio» in the EEG views that average (EEG offers no «Superposición», and the
 * topography no group mode at all). The API is simulated
 * (page.route) and strict: any request it does not know fails the test.
 */

const CODES = ["P01", "P02", "P03", "P04", "P05"]
const WITH_DATA = ["P01", "P02", "P03", "P05"]
const SCENARIO = "Escenario concreto"
const NO_DATA = "P04"
const ERROR_ONCE = "P05"
const SHOTS = process.env.GROUP_MODE_SHOTS ?? "../output/group-mode/eeg"
const EEG_CHANNELS = ["le", "f4", "c4", "p4", "p3", "c3", "f3"]
const TOPOGRAPHY = ["f3", "f4", "c3", "c4", "p3", "p4"]
const SPECTROGRAM_FREQUENCIES = [1, 5, 10, 15, 20, 25]

const project = {
  id: "project-group-eeg",
  name: "Proyecto Grupo EEG",
  status: "active",
  ingestion_generation: 4,
  sensors: [{ id: "group-eeg", sensor_type: "EEG" }],
}

const participants = CODES.map((code, index) => ({ participant_code: code, user_index: index + 1 }))
const indexOf = (code: string) => Math.max(0, CODES.indexOf(code))
const onsetOf = (code: string) => 30 + indexOf(code) * 5

/** The server's full-resolution «Media» of a participant's channel. */
const serverMean = (code: string, channel: string) => 10 + indexOf(code) + EEG_CHANNELS.indexOf(channel) / 10
/** Every channel of a participant has the same spectrum, so its channel mean is that spectrum. */
const psdLevel = (code: string, frequency: number) => -frequency / 4 + 2 * indexOf(code)

function eegBody(endpoint: string, code: string, params: URLSearchParams) {
  const i = indexOf(code)
  const requested = (params.get("channels") ?? "").split(",").filter(Boolean)
  const channels = requested.length ? requested : EEG_CHANNELS
  const common = { channels, available_channels: EEG_CHANNELS, sampling_rate_hz: 250, metadata: { version: "eeg-v2", warnings: [], hop_s: 1 } }
  if (endpoint === "timeseries") {
    const time = Array.from({ length: 81 + i * 10 }, (_, k) => onsetOf(code) + k * 0.1)
    const trace = (c: number, smooth: boolean) => time.map((t) => (smooth ? 0 : 3) + Math.sin(t + c + i) * 20)
    const stats = (channel: string) => ({ count: 1000 + i, mean: serverMean(code, channel), std: 5, median: 9, min: -30, max: 30, rms: 12 })
    return {
      ...common,
      time,
      raw: Object.fromEntries(channels.map((channel, c) => [channel, trace(c, false)])),
      smooth: Object.fromEntries(channels.map((channel, c) => [channel, trace(c, true)])),
      statistics: {
        raw: Object.fromEntries(channels.map((channel) => [channel, stats(channel)])),
        smooth: Object.fromEntries(channels.map((channel) => [channel, stats(channel)])),
      },
    }
  }
  if (endpoint === "psd") {
    const frequency = Array.from({ length: 40 }, (_, k) => k + 1)
    return { ...common, frequency, use_db: true, unit: "dB", power: Object.fromEntries(channels.map((channel) => [channel, frequency.map((f) => psdLevel(code, f))])) }
  }
  if (endpoint === "spectrogram") {
    const time = Array.from({ length: 12 }, (_, k) => onsetOf(code) + k)
    return {
      ...common, time, frequency: SPECTROGRAM_FREQUENCIES, unit: "dB", use_db: true, normalize: "none",
      color_domain: { min: -10 - i, max: 10 + i },
      power: Object.fromEntries(channels.map((channel, c) => [channel, SPECTROGRAM_FREQUENCIES.map((f) => time.map((t) => Math.sin(t + f + c) * (10 + i)))])),
    }
  }
  const topo = channels.filter((channel) => TOPOGRAPHY.includes(channel))
  const time = Array.from({ length: 10 }, (_, k) => onsetOf(code) + 1 + k * 2)
  return {
    ...common, channels: topo, available_channels: TOPOGRAPHY, time, unit: "uV^2", window_s: 2, overlap_ratio: 0.5, remove_dc: true,
    color_domain: { min: 0, max: 10 + i },
    positions: { f3: [-0.5, 0.5], f4: [0.5, 0.5], c3: [-0.5, 0], c4: [0.5, 0], p3: [-0.5, -0.5], p4: [0.5, -0.5] },
    power: Object.fromEntries(topo.map((channel, c) => [channel, time.map((_, k) => 1 + ((k + c + i) % 10))])),
  }
}

interface MockState {
  unhandled: string[]
  /** Requests the group modes made (card point budget). */
  group: Array<{ endpoint: string; params: URLSearchParams }>
}

async function mockApi(page: Page, errors: string[]): Promise<MockState> {
  const state: MockState = { unhandled: [], group: [] }
  let errorServed = false
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "neurodatics-auth-session",
      JSON.stringify({
        user: { id: "e2e-group-eeg", email: "group-eeg@neurodatics.test", name: "Group EEG", authSource: "google-oauth" },
        session: { accessToken: "group-eeg-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
      })
    )
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
        // The page aborted the request.
      }
    }
    if (path === "/api/projects") return fulfill({ json: [project] })
    if (path === `/api/projects/${project.id}`) return fulfill({ json: project })
    if (path.endsWith("/analytics/participants")) return fulfill({ json: participants })
    if (path.endsWith("/analytics/scenarios")) return fulfill({ json: [{ name: SCENARIO, type: "image", file_id: "scenario-image" }] })
    if (path.endsWith("/analytics/scenario-timing")) {
      return fulfill({
        json: { scenario: SCENARIO, time_basis: "scenario_onset", onset_s: onsetOf(participant), end_s: onsetOf(participant) + 20, gsr_origin_s: null },
      })
    }
    if (path.endsWith("/analytics/stimulus-sequence")) {
      // Each recording labels the scenario from 1 s after its onset, for 6 s.
      return fulfill({ json: { segments: [{ scenario: SCENARIO, onset_s: onsetOf(participant) + 1, end_s: onsetOf(participant) + 7 }] } })
    }
    const eeg = path.match(/\/analytics\/(timeseries|psd|spectrogram|topography)\/eeg$/)
    if (eeg) {
      const endpoint = eeg[1]
      // The individual view of P01 only ever reads P01; the group modes read everyone
      // (the EEG trace at the card budget of 1,600 points).
      const isGroup = endpoint !== "timeseries" || params.get("max_points") === "1600"
      if (isGroup && participant) {
        state.group.push({ endpoint, params })
        if (participant === NO_DATA) return fulfill({ status: 404, json: { detail: "Participant data not found" } })
        if (participant === ERROR_ONCE && !errorServed) {
          errorServed = true
          return fulfill({ status: 500, json: { detail: "Fallo simulado del servidor" } })
        }
      }
      return fulfill({ json: eegBody(endpoint, participant || "P01", params) })
    }
    if (path.endsWith("/analytics/gaze-at")) {
      return fulfill({ json: { requested_time_s: 0, nearest_time_s: 0, scenario: SCENARIO, gx: null, gy: null, scenario_file_id: null, scenario_type: null, scenario_time_s: 0 } })
    }
    if (path.endsWith("/analytics/aois")) {
      return fulfill({
        json: { scenario: SCENARIO, scenario_file_id: "scenario-image", aois: [], transitions: [], total_fixations: 0, total_dwell_time_ms: 0, observed_aoi_dwell_time_ms: 0, observed_aoi_dwell_time_percent: 0 },
      })
    }
    if (path === "/api/settings/screen") return fulfill({ json: { screen: { width_px: 1280, height_px: 1024, width_cm: null, height_cm: null }, confirmed: true } })
    state.unhandled.push(`${route.request().method()} ${url.pathname}`)
    return fulfill({ status: 501, json: { detail: `Unhandled mock: ${url.pathname}` } })
  })
  return state
}

const participantSelect = (page: Page) => page.locator('[data-slot="select-trigger"]').nth(1)
const statsCard = (page: Page) => page.locator('[data-slot="card"]').filter({ has: page.getByText("Estadísticas", { exact: true }) })

async function open(page: Page) {
  await page.goto("/dashboard")
  await expect(page.getByRole("tab", { name: "EEG por canal" })).toBeVisible()
  const trigger = page.locator('[data-slot="select-trigger"]').first()
  await trigger.click()
  await page.getByRole("option", { name: SCENARIO, exact: true }).click()
  await expect(trigger).toContainText(SCENARIO)
}

async function chooseScenario(page: Page, name: string) {
  const trigger = page.locator('[data-slot="select-trigger"]').first()
  await trigger.click()
  await page.getByRole("option", { name, exact: true }).click()
  await expect(trigger).toContainText(name)
}

async function chooseGroupMode(page: Page, label: "Superposición" | "Promedio") {
  await participantSelect(page).click()
  await page.getByRole("option", { name: label, exact: true }).click()
  await expect(participantSelect(page)).toContainText(label)
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement!
    const bar = document.querySelector("main.analytics-shell")?.previousElementSibling as HTMLElement | null
    return { document: root.scrollWidth - root.clientWidth, filters: bar ? bar.scrollWidth - bar.clientWidth : 0 }
  })
  expect(overflow.document).toBeLessThanOrEqual(0)
  expect(overflow.filters).toBeLessThanOrEqual(0)
}

const linearMeanDb = (levels: number[]) => 10 * Math.log10(levels.reduce((sum, level) => sum + 10 ** (level / 10), 0) / levels.length)

test("EEG por canal: «Promedio» draws every selected channel averaged over participants, with the server's figures", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await open(page)

  // EEG offers only «Promedio»: an overlay of several channels per participant would not read.
  await participantSelect(page).click()
  await expect(page.getByRole("option", { name: "Superposición", exact: true })).toHaveCount(0)
  await page.getByRole("option", { name: "Promedio", exact: true }).click()
  await expect(participantSelect(page)).toContainText("Promedio")

  const card = page.locator("#eeg-timeseries-chart")
  await expect(page.getByRole("button", { name: "1 sin datos" })).toBeVisible()
  await page.getByRole("button", { name: "Reintentar 1 sin cargar" }).click()
  await expect(page.getByRole("button", { name: "Reintentar 1 sin cargar" })).toHaveCount(0)
  await expect(page.getByText("Promedio de 4 participantes en cada canal", { exact: false })).toBeVisible()
  // One line per channel in the channel's own colour, never a participant's.
  const strokes = () => card.locator(".recharts-line-curve").evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke") ?? ""))
  await expect.poll(async () => (await strokes()).length).toBe(7)
  expect(new Set(await strokes()).size).toBe(7)
  expect((await strokes()).some((stroke) => stroke.includes("--group-"))).toBe(false)
  await expect(page.getByTestId("group-temporal-chart")).toHaveCount(0)
  // Recording-bound controls are gone; the view's own selectors stay.
  await expect(page.getByRole("button", { name: "Aplicar" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Montaje" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Ambas" })).toBeVisible()
  await expect(page.getByText("Estadísticas de:", { exact: true })).toBeVisible()
  await expect(page.getByText("Estadísticas EEG por canal")).toHaveCount(0)
  for (const request of state.group.filter((item) => item.endpoint === "timeseries")) {
    expect(request.params.get("scenario")).toBe(SCENARIO)
    expect(request.params.has("start_time_s")).toBe(false)
  }
  await expect(card.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first()).toHaveText(/^0(\.0+)?$/)
  await expect(card.getByText("Tiempo desde el inicio del escenario (s)")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/timeseries-average-1536.png` })

  // The cards and the table give each participant's own full-resolution figure for the chosen channel.
  const table = statsCard(page)
  await expect(table.getByRole("row")).toHaveCount(1 + 1 + 5)
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(serverMean("P02", "le").toFixed(4))
  await page.getByRole("button", { name: "C4", exact: true }).last().click()
  await expect(page.getByRole("button", { name: "C4", exact: true }).last()).toHaveAttribute("aria-pressed", "true")
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(serverMean("P02", "c4").toFixed(4))
  const expected = WITH_DATA.reduce((sum, code) => sum + serverMean(code, "c4"), 0) / WITH_DATA.length
  const kpis = page.getByTestId("group-kpis")
  await expect(kpis).toContainText(expected.toFixed(4).replace(".", ","))
  await expect(kpis).toContainText("Promedio de 4 participantes")
  await expect(table.getByRole("row").nth(1)).toContainText("Promedio (4 participantes)")
  await expect(table.getByRole("row").nth(1)).toContainText(expected.toFixed(4))
  await page.getByRole("button", { name: "Cómo se calcula" }).first().hover()
  await expect(page.getByRole("tooltip").first()).toContainText("Cada canal se promedia por separado")
  await page.mouse.move(0, 0)

  // A channel chip toggled off leaves the average; the montage draws the rest in lanes.
  await page.getByLabel("Canales EEG").getByRole("button", { name: "F3", exact: true }).click()
  await expect.poll(async () => (await strokes()).length).toBe(6)
  await page.getByRole("button", { name: "Montaje" }).click()
  await expect.poll(async () => (await strokes()).length).toBe(6)
  await page.screenshot({ path: `${SHOTS}/timeseries-average-montage-1536.png` })
  await table.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/timeseries-average-1536-table.png` })

  // «Todos los escenarios» lines the recordings up by stimulus.
  await chooseScenario(page, "Todos los escenarios")
  await expect(card.getByText("Tiempo desde el inicio del primer estímulo (s)")).toBeVisible()
  await expect(page.getByRole("button", { name: "Alineado por estímulo" })).toBeVisible()
  // Another scenario starts the view afresh, with every channel, as in the individual view.
  await expect.poll(async () => (await strokes()).length).toBe(7)
  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("Densidad espectral: the mean taken in linear power, in its own colour", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await open(page)
  await page.getByRole("tab", { name: "Densidad espectral" }).click()

  await chooseGroupMode(page, "Promedio")
  const chart = page.getByTestId("group-psd-chart")
  await expect(chart).toHaveAttribute("data-mode", "average")
  await expect(chart).toHaveAttribute("data-series", "3")
  await page.getByRole("button", { name: "Reintentar 1 sin cargar" }).click()
  await expect(chart).toHaveAttribute("data-series", "4")
  await expect(page.getByRole("button", { name: "Aplicar" })).toHaveCount(0)
  await expect(page.getByLabel("Excluir ventanas con artefacto")).toBeVisible()
  await expect(page.getByRole("button", { name: "Ajustar" })).toBeVisible()
  await expect(chart.locator(".recharts-area-area")).toHaveCount(1)
  // The mean and its band take the view's violet, not a neutral grey.
  await expect(chart.locator(".recharts-line-curve")).toHaveAttribute("stroke", "#8B5CF6")
  await expect(chart.locator(".recharts-area-area")).toHaveAttribute("fill", "#8B5CF6")
  // «Nivel pico» averages each participant's peak (at 1 Hz) in linear power, not in dB.
  const peak = linearMeanDb(WITH_DATA.map((code) => psdLevel(code, 1)))
  const dbMean = WITH_DATA.reduce((sum, code) => sum + psdLevel(code, 1), 0) / WITH_DATA.length
  expect(Math.abs(peak - dbMean)).toBeGreaterThan(0.5)
  const average = statsCard(page).getByRole("row").nth(1)
  await expect(average).toContainText("Promedio (4 participantes)")
  await expect(average).toContainText(`${peak.toFixed(4)} dB`)
  await expect(average).toContainText("1.00 Hz")
  await expect(page.getByTestId("group-kpis")).toContainText(peak.toFixed(4).replace(".", ","))
  await page.screenshot({ path: `${SHOTS}/psd-average-1536.png` })
  await statsCard(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/psd-average-1536-table.png` })

  // The PSD needs no concrete scenario.
  await chooseScenario(page, "Todos los escenarios")
  await expect(page.getByTestId("group-unsupported")).toHaveCount(0)
  await expect(chart).toHaveAttribute("data-mode", "average")
  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("Espectrograma: average only, drawn with the view's own renderer; Topografía offers no group mode", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await open(page)
  await page.getByRole("tab", { name: "Espectrograma de frecuencias" }).click()

  await chooseGroupMode(page, "Promedio")
  await expect(page.getByTestId("group-unsupported")).toHaveCount(0)
  await page.getByRole("button", { name: "Reintentar 1 sin cargar" }).click()
  await expect(page.getByRole("button", { name: "Reintentar 1 sin cargar" })).toHaveCount(0)
  // One averaged panel per channel, on the stimulus-time axis.
  await expect(page.locator("main canvas")).toHaveCount(7)
  await expect(page.getByText("Escala de color por canal")).toBeVisible()
  await expect(page.getByRole("button", { name: "Aplicar" })).toHaveCount(0)
  await expect(page.getByText("Haz clic en un espectrograma")).toHaveCount(0)
  await expect(page.getByTestId("group-kpis")).toContainText("Promedio de 4 participantes")
  await expect(statsCard(page).getByRole("row").nth(1)).toContainText("Promedio (4 participantes)")
  await page.screenshot({ path: `${SHOTS}/spectrogram-average-1536.png` })
  await page.getByRole("button", { name: "Cómo se calcula" }).first().hover()
  await expect(page.getByRole("tooltip").first()).toContainText("potencia lineal")
  await page.screenshot({ path: `${SHOTS}/spectrogram-average-1536-chip.png` })

  // The topography is seen one participant at a time: opening it leaves «Promedio».
  await page.getByRole("tab", { name: "Topografía EEG" }).click()
  await expect(participantSelect(page)).not.toContainText("Promedio")
  await expect(page.getByTestId("group-kpis")).toHaveCount(0)
  await expect(page.getByRole("slider", { name: "Ventana temporal de topografía" })).toBeVisible()
  await participantSelect(page).click()
  await expect(page.getByRole("option").first()).toBeVisible()
  await expect(page.getByRole("option", { name: "Promedio", exact: true })).toHaveCount(0)
  await expect(page.getByText("Varios participantes")).toHaveCount(0)
  await page.keyboard.press("Escape")

  // The spectrogram takes «Todos los escenarios», its windows lined up by stimulus.
  await chooseScenario(page, "Todos los escenarios")
  await page.getByRole("tab", { name: "Espectrograma de frecuencias" }).click()
  await chooseGroupMode(page, "Promedio")
  await expect(page.locator("main canvas")).toHaveCount(7)
  await expect(page.getByRole("button", { name: "Alineado por estímulo" })).toBeVisible()
  await expect(page.getByText("desde el inicio del primer estímulo")).toBeVisible()
  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("phone width keeps every EEG group view inside the screen", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await mockApi(page, errors)
  await open(page)
  await chooseGroupMode(page, "Promedio")
  const lines = page.locator("#eeg-timeseries-chart .recharts-line-curve")
  await expect(lines.first()).toBeVisible()
  await noHorizontalScroll(page)
  await lines.first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/timeseries-average-390.png` })

  await page.getByRole("tab", { name: "Densidad espectral" }).click()
  await expect(page.getByTestId("group-psd-chart")).toHaveAttribute("data-mode", "average")
  await noHorizontalScroll(page)
  await page.getByTestId("group-psd-chart").scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/psd-average-390.png` })

  await page.getByRole("tab", { name: "Espectrograma de frecuencias" }).click()
  await expect(page.locator("main canvas")).toHaveCount(7)
  await noHorizontalScroll(page)
  await page.locator("main canvas").first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/spectrogram-average-390.png` })
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})
