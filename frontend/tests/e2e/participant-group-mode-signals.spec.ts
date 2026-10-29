import { expect, test, type Page } from "@playwright/test"

/**
 * «Superposición» and «Promedio» in the punto de mirada, distancia and GSR
 * views. The API is simulated (page.route) and strict: any request it does not
 * know fails the test. Mocking helpers follow participant-group-mode.spec.ts.
 */

const CODES = ["P01", "P02", "P03", "P04"]
const SCENARIO = "Escenario concreto"
const NO_DATA = "P04"
const WITH_DATA = CODES.filter((code) => code !== NO_DATA)
const SHOTS = process.env.GROUP_MODE_SHOTS ?? "../output/group-mode/signals"
const FIX_SHOTS = "../output/group-mode/fix"

type Sensor = "EyeTracker" | "GSR"

const projectFor = (sensor: Sensor) => ({
  id: `project-group-${sensor.toLowerCase()}`,
  name: `Proyecto Grupo ${sensor}`,
  status: "active",
  ingestion_generation: 2,
  sensors: [{ id: `group-${sensor.toLowerCase()}`, sensor_type: sensor }],
})

const participants = CODES.map((code, index) => ({ participant_code: code, user_index: index + 1 }))
const indexOf = (code: string) => CODES.indexOf(code)
const onsetOf = (code: string) => 50 + indexOf(code) * 7
/** GSR counts from its first valid sample, 5 s before the scenario onset. */
const GSR_LEAD_S = 5
const samples = (code: string) => 61 + indexOf(code) * 10

/** Recording time from the scenario onset, so the group axis starts at 0 s. */
function recordingTimes(code: string) {
  return Array.from({ length: samples(code) }, (_, k) => onsetOf(code) + k * 0.25)
}

function gazeFor(code: string) {
  const i = indexOf(code)
  const time = recordingTimes(code)
  return {
    time,
    gx_clean: time.map((_, k) => 40 + i * 5 + Math.sin(k / 5) * 4),
    gy_clean: time.map((_, k) => 50 - i * 3 + Math.cos(k / 6) * 3),
  }
}

function distanceFor(code: string) {
  const i = indexOf(code)
  const time = recordingTimes(code)
  return { time, distance_cm: time.map((_, k) => 60 + i * 4 + Math.sin(k / 4) * 2) }
}

function gsrFor(code: string) {
  const i = indexOf(code)
  // GSR-relative seconds: the scenario starts GSR_LEAD_S after the first sample.
  const time = Array.from({ length: samples(code) }, (_, k) => GSR_LEAD_S + k * 0.25)
  const gsr_smooth = time.map((_, k) => 2 + i * 0.5 + Math.sin(k / 8) * 0.2)
  return { time, gsr_smooth, gsr: gsr_smooth.map((value, k) => value + (k % 2 ? 0.05 : -0.05)) }
}

/** The server's figures for each participant: distinct, round levels per signal. */
function statsFor(signal: "gaze" | "distance" | "gsr", code: string) {
  const i = indexOf(code)
  const block = (mean: number, spread: number) => ({
    mean, min: mean - spread, max: mean + spread, std: spread / 2, median: mean + spread / 10, baseline: mean - spread / 2,
  })
  if (signal === "gaze") {
    const x = block(40 + i * 5, 4)
    const y = block(50 - i * 3, 3)
    return Object.fromEntries([
      ...Object.entries(x).map(([key, value]) => [`gx_${key}`, value]),
      ...Object.entries(y).map(([key, value]) => [`gy_${key}`, value]),
    ])
  }
  if (signal === "distance") return block(60 + i * 4, 2)
  const smooth = block(2 + i * 0.5, 0.2)
  return { ...smooth, raw_mean: smooth.mean, raw_min: smooth.min - 0.05, raw_max: smooth.max + 0.05, raw_std: smooth.std, raw_median: smooth.median, raw_baseline: smooth.baseline }
}

/** Each participant's pupil, only for the dashboard's first (individual) view. */
function pupilFor(code: string) {
  const time = recordingTimes(code)
  const left = time.map(() => 3)
  const right = time.map(() => 3.2)
  return { time, left, right, average: left, smooth_left: left, smooth_right: right }
}

interface MockState {
  unhandled: string[]
  groupTraces: URLSearchParams[]
  statistics: URLSearchParams[]
  gazeAt: URLSearchParams[]
}

/** A 4×3 PNG: the stimulus frame behind the group's gaze points. */
const STIMULUS_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAADklEQVR4nGNoQAIMODkAXzYSAY5zHKsAAAAASUVORK5CYII=",
  "base64"
)
/** Where each participant looks at any instant: a distinct point per participant. */
const gazePointOf = (code: string) => ({ gx: 20 + indexOf(code) * 20, gy: 30 + indexOf(code) * 10 })

/** The scenario each recording labels: from 1 s after the onset, for 10 s. */
const stimulusSegments = (code: string) => [{ scenario: SCENARIO, onset_s: onsetOf(code) + 1, end_s: onsetOf(code) + 11 }]

/** With `sequences`, the recordings label their scenarios; without them each keeps its own time. */
async function mockApi(page: Page, errors: string[], sensor: Sensor, { sequences = false } = {}): Promise<MockState> {
  const project = projectFor(sensor)
  const state: MockState = { unhandled: [], groupTraces: [], statistics: [], gazeAt: [] }
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "neurodatics-auth-session",
      JSON.stringify({
        user: { id: "e2e-group-signals", email: "group-signals@neurodatics.test", name: "Group Signals", authSource: "google-oauth" },
        session: { accessToken: "group-signals-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
      })
    )
  })
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/\/$/, "")
    const params = url.searchParams
    const participant = params.get("participant_code") || "P01"
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
      const onset = onsetOf(participant)
      return fulfill({
        json: { scenario: SCENARIO, time_basis: "scenario_onset", onset_s: onset, end_s: onset + 40, gsr_origin_s: onset - GSR_LEAD_S },
      })
    }
    if (path.endsWith("/analytics/stimulus-sequence")) {
      return fulfill({ json: { segments: sequences ? stimulusSegments(participant) : [] } })
    }
    const timeseries = path.match(/\/analytics\/timeseries\/(pupil|gaze|distance|gsr)$/)?.[1]
    if (timeseries) {
      if (params.get("decimation") === "minmax_envelope") {
        state.groupTraces.push(params)
        if (participant === NO_DATA) return fulfill({ status: 404, json: { detail: "Participant data not found" } })
      }
      const data =
        timeseries === "gaze" ? gazeFor(participant)
          : timeseries === "distance" ? distanceFor(participant)
            : timeseries === "gsr" ? gsrFor(participant)
              : pupilFor(participant)
      return fulfill({ json: data })
    }
    const statistics = path.match(/\/analytics\/statistics\/(gaze|distance|gsr)$/)?.[1] as "gaze" | "distance" | "gsr" | undefined
    if (statistics) {
      state.statistics.push(params)
      return fulfill({ json: statsFor(statistics, participant) })
    }
    if (path.endsWith("/analytics/gaze-at")) {
      state.gazeAt.push(params)
      const time = Number(params.get("t_s"))
      return fulfill({
        json: { requested_time_s: time, nearest_time_s: time, scenario: SCENARIO, scenario_type: "image", scenario_file_id: "scenario-image", ...gazePointOf(participant) },
      })
    }
    if (path.endsWith("/files/scenario-image/preview")) return fulfill({ contentType: "image/png", body: STIMULUS_PNG })
    if (path.endsWith("/analytics/aois")) {
      return fulfill({
        json: { scenario: SCENARIO, scenario_file_id: "scenario-image", aois: [], transitions: [], total_fixations: 0, total_dwell_time_ms: 0, observed_aoi_dwell_time_ms: 0, observed_aoi_dwell_time_percent: 0 },
      })
    }
    if (path.endsWith("/analytics/fixations/sensitivity")) {
      return fulfill({ json: { default_min_fixation_duration_ms: 200, available_min_fixation_durations_ms: [100, 150, 200, 250, 300], points: [] } })
    }
    if (path === "/api/settings/screen") return fulfill({ json: { screen: { width_px: 1280, height_px: 1024, width_cm: null, height_cm: null }, confirmed: true } })
    state.unhandled.push(`${route.request().method()} ${url.pathname}`)
    return fulfill({ status: 501, json: { detail: `Unhandled mock: ${url.pathname}` } })
  })
  return state
}

const participantSelect = (page: Page) => page.locator('[data-slot="select-trigger"]').nth(1)
const groupChart = (page: Page) => page.getByTestId("group-temporal-chart")
/** The time window control (recording seconds): only in the individual view. */
const timeWindowButton = (page: Page) => page.getByRole("button", { name: /^Ventana temporal:/ })
const statsCard = (page: Page) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Estadísticas" }) })

async function chooseScenario(page: Page, name: string) {
  const trigger = page.locator('[data-slot="select-trigger"]').first()
  await trigger.click()
  await page.getByRole("option", { name, exact: true }).click()
  await expect(trigger).toContainText(name)
}

async function chooseGroupMode(page: Page, label: "Superposición" | "Promedio") {
  await participantSelect(page).click()
  await expect(page.getByRole("listbox").getByText("Varios participantes")).toBeVisible()
  await page.getByRole("option", { name: label, exact: true }).click()
  await expect(participantSelect(page)).toContainText(label)
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement!
    const bar = document.querySelector("main.analytics-shell")?.previousElementSibling as HTMLElement | null
    return {
      document: root.scrollWidth - root.clientWidth,
      filters: bar ? bar.scrollWidth - bar.clientWidth : 0,
    }
  })
  expect(overflow.document).toBeLessThanOrEqual(0)
  expect(overflow.filters).toBeLessThanOrEqual(0)
}

/** «Promedio» KPI text: the mean over participants of each one's figure, as KpiCard prints it. */
function averageText(values: number[], decimals: number) {
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(decimals).replace(".", ",")
}

/** Every group request read the whole scenario: traces at the card budget, statistics without a window. */
function expectWholeScenario(state: MockState) {
  expect(state.groupTraces.length).toBeGreaterThan(0)
  for (const params of state.groupTraces) {
    expect(params.get("scenario")).toBe(SCENARIO)
    expect(params.get("max_points")).toBe("2000")
    expect(params.has("start_time_s")).toBe(false)
  }
  // The individual view asked for «Todos los escenarios» before the scenario was chosen.
  const scenarioStatistics = state.statistics.filter((params) => params.get("scenario") === SCENARIO)
  const codes = new Set(scenarioStatistics.map((params) => params.get("participant_code")))
  for (const code of WITH_DATA) expect(codes.has(code)).toBe(true)
  // The participant without data never asks for figures.
  expect(codes.has(NO_DATA)).toBe(false)
  for (const params of scenarioStatistics) {
    expect(params.has("start_time_s")).toBe(false)
    expect(params.has("end_time_s")).toBe(false)
  }
}

test("gaze shows one axis per participant in overlay and average", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors, "EyeTracker")
  await page.goto("/dashboard")
  await page.getByRole("tab", { name: "Punto de mirada" }).click()
  await chooseScenario(page, SCENARIO)
  await chooseGroupMode(page, "Superposición")

  const chart = groupChart(page)
  await expect(chart).toHaveAttribute("data-mode", "overlay")
  await expect(chart).toHaveAttribute("data-series", String(WITH_DATA.length))
  await expect(page.getByRole("button", { name: "1 sin datos" })).toBeVisible()
  // Recording-bound controls and the gaze panel are gone; one axis at a time.
  await expect(timeWindowButton(page)).toHaveCount(0)
  // The group stimulus card replaces the individual one: a click on the chart fills it.
  await expect(page.getByTestId("group-stimulus")).toContainText("Haz clic en la gráfica")
  await expect(page.getByRole("button", { name: "Ambos ejes" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Eje X", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first()).toHaveText("0")

  // One row per participant, the server's X figures for each one.
  const table = statsCard(page)
  await expect(table.getByRole("row")).toHaveCount(1 + 1 + CODES.length)
  // «Superposición» also leads with the «Promedio» row of the chosen participants.
  await expect(table.getByRole("row").nth(1)).toContainText("Promedio (")
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(`${(45).toFixed(4)}%`)
  await page.screenshot({ path: `${SHOTS}/gaze-overlay-1536.png` })

  await page.getByRole("button", { name: "Eje Y", exact: true }).click()
  await expect(chart).toHaveAttribute("data-mode", "overlay")
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(`${(47).toFixed(4)}%`)

  await chooseGroupMode(page, "Promedio")
  await expect(chart).toHaveAttribute("data-mode", "average")
  await expect(chart.locator(".recharts-area-area")).toHaveCount(1)
  const kpis = page.getByTestId("group-kpis")
  await expect(kpis).toContainText(averageText(WITH_DATA.map((code) => 50 - indexOf(code) * 3), 2))
  await expect(kpis).toContainText(`Promedio de ${WITH_DATA.length} participantes`)
  await expect(table.getByRole("row").nth(1)).toContainText(`Promedio (${WITH_DATA.length} participantes)`)
  await page.screenshot({ path: `${SHOTS}/gaze-average-1536.png` })
  expectWholeScenario(state)
  await noHorizontalScroll(page)

  // Back to one participant: both axes and the time window return.
  await participantSelect(page).click()
  await page.getByRole("option", { name: "Participante P01", exact: true }).click()
  await expect(groupChart(page)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Ambos ejes" })).toBeVisible()
  await expect(timeWindowButton(page)).toBeVisible()

  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("distance overlays and averages every participant with its own figures", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors, "EyeTracker")
  await page.goto("/dashboard")
  await page.getByRole("tab", { name: "Distancia al dispositivo" }).click()
  await chooseScenario(page, SCENARIO)
  await chooseGroupMode(page, "Superposición")

  const chart = groupChart(page)
  await expect(chart).toHaveAttribute("data-mode", "overlay")
  await expect(chart).toHaveAttribute("data-series", String(WITH_DATA.length))
  await expect(timeWindowButton(page)).toHaveCount(0)
  // The group stimulus card replaces the individual one: a click on the chart fills it.
  await expect(page.getByTestId("group-stimulus")).toContainText("Haz clic en la gráfica")
  await expect(page.getByRole("button", { name: "Ajustar" })).toBeVisible()
  const table = statsCard(page)
  await expect(table.getByRole("row")).toHaveCount(1 + 1 + CODES.length)
  // «Superposición» also leads with the «Promedio» row of the chosen participants.
  await expect(table.getByRole("row").nth(1)).toContainText("Promedio (")
  await expect(table.getByRole("row", { name: /Participante P03/ })).toContainText(`${(68).toFixed(4)} cm`)
  // Each participant keeps its colour from the project's list.
  const strokes = await chart.locator(".recharts-line-curve").evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke")))
  expect(strokes).toEqual(["var(--group-series-1)", "var(--group-series-2)", "var(--group-series-3)"])
  await page.screenshot({ path: `${SHOTS}/distance-overlay-1536.png` })

  await chooseGroupMode(page, "Promedio")
  await expect(chart).toHaveAttribute("data-mode", "average")
  const kpis = page.getByTestId("group-kpis")
  await expect(kpis).toContainText(averageText(WITH_DATA.map((code) => 60 + indexOf(code) * 4), 2))
  await expect(table.getByRole("row").nth(1)).toContainText(`Promedio (${WITH_DATA.length} participantes)`)
  await page.getByRole("button", { name: "Cómo se calcula" }).last().hover()
  await expect(page.getByRole("tooltip").first()).toContainText("señal completa")
  await page.screenshot({ path: `${SHOTS}/distance-average-1536.png` })
  await table.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/distance-average-1536-table.png` })
  expectWholeScenario(state)
  await noHorizontalScroll(page)

  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("GSR aligns each participant on the scenario onset in overlay and average", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors, "GSR")
  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Respuesta galvánica", exact: true })).toBeVisible()
  await chooseScenario(page, SCENARIO)
  await chooseGroupMode(page, "Superposición")

  const chart = groupChart(page)
  await expect(chart).toHaveAttribute("data-mode", "overlay")
  await expect(chart).toHaveAttribute("data-series", String(WITH_DATA.length))
  // GSR counts from its first sample; the group axis counts from the scenario onset.
  await expect(chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first()).toHaveText("0")
  await expect(page.getByRole("button", { name: "Ambas", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Suavizada", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(timeWindowButton(page)).toHaveCount(0)
  await page.getByRole("button", { name: "Tiempo alineado" }).hover()
  await expect(page.getByRole("tooltip").first()).toContainText("primera muestra de GSR")
  const table = statsCard(page)
  await expect(table.getByRole("row")).toHaveCount(1 + 1 + CODES.length)
  // «Superposición» also leads with the «Promedio» row of the chosen participants.
  await expect(table.getByRole("row").nth(1)).toContainText("Promedio (")
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(`${(2.5).toFixed(4)} µS`)
  await page.screenshot({ path: `${SHOTS}/gsr-overlay-1536.png` })

  // The raw signal is drawn; the figures stay on the smoothed one, as in the individual view.
  await page.getByRole("button", { name: "Cruda", exact: true }).click()
  await expect(chart).toHaveAttribute("data-series", String(WITH_DATA.length))
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(`${(2.5).toFixed(4)} µS`)

  await chooseGroupMode(page, "Promedio")
  await expect(chart).toHaveAttribute("data-mode", "average")
  await expect(chart.locator(".recharts-area-area")).toHaveCount(1)
  await expect(chart.locator(".recharts-area-area")).toHaveAttribute("fill", "#6366F1")
  const kpis = page.getByTestId("group-kpis")
  await expect(kpis).toContainText(averageText(WITH_DATA.map((code) => 2 + indexOf(code) * 0.5), 4))
  await expect(table.getByRole("row").nth(1)).toContainText(`Promedio (${WITH_DATA.length} participantes)`)
  await page.screenshot({ path: `${SHOTS}/gsr-average-1536.png` })
  expectWholeScenario(state)
  await noHorizontalScroll(page)

  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("a click on the group chart shows every participant's gaze over the stimulus", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors, "GSR")
  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Respuesta galvánica", exact: true })).toBeVisible()
  await chooseScenario(page, SCENARIO)

  for (const mode of ["Superposición", "Promedio"] as const) {
    await chooseGroupMode(page, mode)
    const chart = groupChart(page)
    await expect(chart).toHaveAttribute("data-series", String(WITH_DATA.length))
    const card = page.getByTestId("group-stimulus")
    await expect(card).toContainText("Haz clic en la gráfica")
    // The averaged cards sit above the chart in both modes.
    await expect(page.getByTestId("group-kpis")).toContainText(`Promedio de ${WITH_DATA.length} participantes`)

    const asked = state.gazeAt.length
    const plot = chart.locator(".recharts-wrapper")
    const box = (await plot.boundingBox())!
    await plot.hover({ position: { x: box.width * 0.5, y: box.height * 0.4 } })
    await plot.click({ position: { x: box.width * 0.5, y: box.height * 0.4 } })
    await expect(chart).toHaveAttribute("data-selected-time", /\d/)
    const selected = Number(await chart.getAttribute("data-selected-time"))

    // Each participant is asked at the same instant of the scenario, in its own recording's seconds.
    await expect.poll(() => state.gazeAt.length - asked).toBe(WITH_DATA.length)
    for (const params of state.gazeAt.slice(asked)) {
      const code = params.get("participant_code")!
      expect(WITH_DATA).toContain(code)
      expect(params.get("scenario")).toBe(SCENARIO)
      expect(Number(params.get("t_s"))).toBeCloseTo(onsetOf(code) + selected, 6)
    }
    const points = card.getByTestId("group-gaze-points").locator("[data-participant]")
    await expect(points).toHaveCount(WITH_DATA.length)
    await expect(points.first()).toHaveAttribute("aria-label", /: \(20, 30\)$/)
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${FIX_SHOTS}/gsr-${mode === "Promedio" ? "average" : "overlay"}-stimulus-1536.png` })

    await card.getByRole("button", { name: "Limpiar selección", exact: true }).click()
    await expect(card).toContainText("Haz clic en la gráfica")
    await expect(chart).not.toHaveAttribute("data-selected-time", /./)
  }

  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("GSR with «Todos los escenarios» lines participants up by stimulus", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors, "GSR", { sequences: true })
  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Respuesta galvánica", exact: true })).toBeVisible()
  await expect(page.locator('[data-slot="select-trigger"]').first()).toContainText("Todos los escenarios")

  for (const mode of ["Superposición", "Promedio"] as const) {
    await chooseGroupMode(page, mode)
    const chart = groupChart(page)
    await expect(chart).toHaveAttribute("data-series", String(WITH_DATA.length))
    await expect(page.getByText("Tiempo desde el inicio del primer estímulo (s)")).toBeVisible()
    await expect(page.getByRole("button", { name: "Alineado por estímulo" })).toBeVisible()
    await expect(chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first()).toHaveText(/^0(\.0+)?$/)

    // A click asks each participant at the same second of the stimulus, in its own recording.
    const asked = state.gazeAt.length
    const plot = chart.locator(".recharts-wrapper")
    const box = (await plot.boundingBox())!
    await plot.hover({ position: { x: box.width * 0.5, y: box.height * 0.4 } })
    await plot.click({ position: { x: box.width * 0.5, y: box.height * 0.4 } })
    await expect(chart).toHaveAttribute("data-selected-time", /\d/)
    const selected = Number(await chart.getAttribute("data-selected-time"))
    await expect.poll(() => state.gazeAt.length - asked).toBe(WITH_DATA.length)
    for (const params of state.gazeAt.slice(asked)) {
      const code = params.get("participant_code")!
      expect(params.get("scenario")).toBe(SCENARIO)
      expect(Number(params.get("t_s"))).toBeCloseTo(onsetOf(code) + 1 + selected, 6)
    }
    await expect(page.getByTestId("group-stimulus").getByTestId("group-gaze-points").locator("[data-participant]")).toHaveCount(WITH_DATA.length)
    await page.screenshot({ path: `${FIX_SHOTS}/gsr-${mode === "Promedio" ? "average" : "overlay"}-by-stimulus-1536.png` })
    await page.getByTestId("group-stimulus").getByRole("button", { name: "Limpiar selección", exact: true }).click()
  }

  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("GSR with «Todos los escenarios» on recordings without scenarios keeps each participant on its own GSR time", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors, "GSR")
  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Respuesta galvánica", exact: true })).toBeVisible()
  await expect(page.locator('[data-slot="select-trigger"]').first()).toContainText("Todos los escenarios")
  await chooseGroupMode(page, "Superposición")

  const chart = groupChart(page)
  await expect(chart).toHaveAttribute("data-mode", "overlay")
  await expect(chart).toHaveAttribute("data-series", String(WITH_DATA.length))
  // No common onset: the axis is the individual view's, from each first GSR sample.
  await expect(page.getByText("Tiempo desde la primera muestra de GSR (s)")).toBeVisible()
  await expect(chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first()).toHaveText(String(GSR_LEAD_S))
  await page.getByRole("button", { name: "Tiempo de grabación" }).hover()
  await expect(page.getByRole("tooltip").first()).toContainText("estímulos distintos")
  await page.mouse.move(0, 0)
  for (const params of state.groupTraces) expect(params.get("scenario")).toBe("all")
  const table = statsCard(page)
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(`${(2.5).toFixed(4)} µS`)
  await page.screenshot({ path: `${FIX_SHOTS}/gsr-overlay-all-1536.png` })

  await chooseGroupMode(page, "Promedio")
  await expect(chart).toHaveAttribute("data-mode", "average")
  await expect(chart.locator(".recharts-area-area")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Tiempo de grabación" })).toBeVisible()
  await expect(page.getByTestId("group-kpis")).toContainText(averageText(WITH_DATA.map((code) => 2 + indexOf(code) * 0.5), 4))
  // The GSR-onset caveat belongs to a concrete scenario only.
  await page.getByRole("button", { name: "Cómo se calcula" }).first().hover()
  await expect(page.getByRole("tooltip").first()).not.toContainText("A diferencia de la vista de un participante")
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `${FIX_SHOTS}/gsr-average-all-1536.png` })
  await noHorizontalScroll(page)

  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("phone width keeps the signal group views inside the screen", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await mockApi(page, errors, "EyeTracker")
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)
  for (const [tab, name] of [["Punto de mirada", "gaze"], ["Distancia al dispositivo", "distance"]] as const) {
    await page.getByRole("tab", { name: tab }).click()
    await chooseGroupMode(page, "Promedio")
    await expect(groupChart(page)).toHaveAttribute("data-series", String(WITH_DATA.length))
    await noHorizontalScroll(page)
    await groupChart(page).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/${name}-average-390.png` })
    await chooseGroupMode(page, "Superposición")
    await expect(groupChart(page)).toHaveAttribute("data-mode", "overlay")
    await noHorizontalScroll(page)
    await groupChart(page).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/${name}-overlay-390.png` })
    await statsCard(page).scrollIntoViewIfNeeded()
    await noHorizontalScroll(page)
  }
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("phone width keeps the GSR group view inside the screen", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await mockApi(page, errors, "GSR")
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)
  await chooseGroupMode(page, "Promedio")
  await expect(groupChart(page)).toHaveAttribute("data-series", String(WITH_DATA.length))
  await noHorizontalScroll(page)
  await page.screenshot({ path: `${SHOTS}/gsr-average-390-top.png` })
  await groupChart(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/gsr-average-390.png` })
  await chooseGroupMode(page, "Superposición")
  await expect(groupChart(page)).toHaveAttribute("data-mode", "overlay")
  await noHorizontalScroll(page)
  await groupChart(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/gsr-overlay-390.png` })
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})
