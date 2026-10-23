import { expect, test, type Page } from "@playwright/test"

/**
 * «Superposición» and «Promedio» in the dilatación pupilar view. The API is
 * simulated (page.route) and strict: any request it does not know fails the test.
 */

const CODES = ["P01", "P02", "P03", "P04", "P05"]
const SCENARIO = "Escenario concreto"
const NO_DATA = "P04"
const ERROR_ONCE = "P05"
const SHOTS = "../output/group-mode"

const project = {
  id: "project-group",
  name: "Proyecto Grupo",
  status: "active",
  ingestion_generation: 2,
  sensors: [{ id: "group-eye", sensor_type: "EyeTracker" }],
}

const participants = CODES.map((code, index) => ({ participant_code: code, user_index: index + 1 }))
const indexOf = (code: string) => CODES.indexOf(code)
const onsetOf = (code: string) => 50 + indexOf(code) * 7

/** Each participant has its own onset, length and level; both eyes stay valid. */
function pupilFor(code: string) {
  const i = indexOf(code)
  const time = Array.from({ length: 61 + i * 10 }, (_, k) => onsetOf(code) + k * 0.25)
  const left = time.map((_, k) => 3 + i * 0.25 + Math.sin(k / 6 + i) * 0.3)
  const right = time.map((_, k) => 3.2 + i * 0.25 + Math.cos(k / 7 + i) * 0.25)
  return { time, left, right, average: left, smooth_left: left, smooth_right: right }
}

/** The view's «Media» for one participant with both eyes: mean of the per-sample eye mean. */
function participantMean(code: string) {
  const { left, right } = pupilFor(code)
  const values = left.map((value, k) => (value + right[k]) / 2)
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10000) / 10000
}

interface MockState {
  unhandled: string[]
  groupTraces: URLSearchParams[]
}

async function mockApi(page: Page, errors: string[]): Promise<MockState> {
  const state: MockState = { unhandled: [], groupTraces: [] }
  let errorServed = false
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "neurodatics-auth-session",
      JSON.stringify({
        user: { id: "e2e-group-mode", email: "group-e2e@neurodatics.test", name: "Group E2E", authSource: "google-oauth" },
        session: { accessToken: "group-e2e-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
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
        json: { scenario: SCENARIO, time_basis: "scenario_onset", onset_s: onsetOf(participant), end_s: onsetOf(participant) + 40, gsr_origin_s: null },
      })
    }
    if (path.endsWith("/analytics/timeseries/pupil")) {
      if (params.get("decimation") === "minmax_envelope") {
        state.groupTraces.push(params)
        if (participant === NO_DATA) return fulfill({ status: 404, json: { detail: "Participant data not found" } })
        if (participant === ERROR_ONCE && !errorServed) {
          errorServed = true
          return fulfill({ status: 500, json: { detail: "Fallo simulado del servidor" } })
        }
      }
      return fulfill({ json: pupilFor(participant || "P01") })
    }
    if (path.endsWith("/analytics/aois")) {
      return fulfill({
        json: { scenario: SCENARIO, scenario_file_id: "scenario-image", aois: [], transitions: [], total_fixations: 0, total_dwell_time_ms: 0, observed_aoi_dwell_time_ms: 0, observed_aoi_dwell_time_percent: 0 },
      })
    }
    if (path.endsWith("/analytics/fixations/sensitivity")) {
      return fulfill({ json: { default_min_fixation_duration_ms: 200, available_min_fixation_durations_ms: [100, 150, 200, 250, 300], points: [] } })
    }
    if (path.endsWith("/analytics/fixations/histogram")) {
      return fulfill({
        json: {
          bins: [{ rango_min: 100, rango_max: 200, label: "100-200", conteo: 3, porcentaje: 100, promedio_ms: 150 }],
          n_fixations: 3, total_duration_ms: 450, mean_duration_ms: 150, min_duration_ms: 120, max_duration_ms: 190,
        },
      })
    }
    if (path === "/api/settings/screen") return fulfill({ json: { screen: { width_px: 1280, height_px: 1024, width_cm: null, height_cm: null }, confirmed: true } })
    state.unhandled.push(`${route.request().method()} ${url.pathname}`)
    return fulfill({ status: 501, json: { detail: `Unhandled mock: ${url.pathname}` } })
  })
  return state
}

const participantSelect = (page: Page) => page.locator('[data-slot="select-trigger"]').nth(1)
const groupChart = (page: Page) => page.getByTestId("group-temporal-chart")

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

test("overlay draws every chosen participant and keeps the view's own controls", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)
  await expect(page.getByRole("button", { name: "Comparar participantes" })).toBeVisible()

  await chooseGroupMode(page, "Superposición")
  const picker = page.getByRole("button", { name: "Participantes: 5 de 5 seleccionados" })
  await expect(picker).toBeVisible()
  await expect(page.getByRole("button", { name: "Comparar participantes" })).toHaveCount(0)
  // Recording-bound controls and the gaze panel are gone; eye selection stays.
  await expect(page.getByRole("button", { name: "Aplicar" })).toHaveCount(0)
  await expect(page.getByText("Punto de fijación sobre estímulo visual")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Ambas pupilas" })).toBeVisible()

  const chart = groupChart(page)
  await expect(chart).toHaveAttribute("data-mode", "overlay")
  await expect(chart).toHaveAttribute("data-series", "3")
  await expect(page.getByRole("button", { name: "1 sin datos" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Reintentar 1 sin cargar" })).toBeVisible()
  await expect(page.getByText("Tiempo desde el inicio del escenario (s)")).toBeVisible()
  // Every request read the whole scenario at the card budget.
  for (const params of state.groupTraces) {
    expect(params.get("scenario")).toBe(SCENARIO)
    expect(params.get("max_points")).toBe("2000")
    expect(params.has("start_time_s")).toBe(false)
  }
  // Aligned on the onset: the axis starts at 0 s whatever each recording's clock.
  await expect(chart.locator(".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value").first()).toHaveText("0")
  await page.screenshot({ path: `${SHOTS}/overlay-1536.png` })

  await page.getByRole("button", { name: "Reintentar 1 sin cargar" }).click()
  await expect(chart).toHaveAttribute("data-series", "4")
  await expect(page.getByRole("button", { name: "Reintentar 1 sin cargar" })).toHaveCount(0)

  // One table row per participant, with an empty row for the one without data.
  const table = page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Estadísticas" }) })
  await expect(table.getByRole("row")).toHaveCount(1 + 5)
  await expect(table.getByRole("row", { name: /Participante P01/ })).toContainText(participantMean("P01").toFixed(4))

  // Deselecting a participant removes its line; its colour stays with the others.
  await picker.click()
  const popover = page.getByRole("dialog", { name: "Seleccionar participantes" })
  await popover.getByRole("checkbox", { name: "Participante P02" }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Participantes: 4 de 5 seleccionados" })).toBeVisible()
  await expect(chart).toHaveAttribute("data-series", "3")
  const strokes = await chart.locator(".recharts-line-curve").evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke")))
  expect(strokes).toEqual(["var(--group-series-1)", "var(--group-series-3)", "var(--group-series-5)"])

  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("average shows the mean curve, averaged figures and leaves group mode on demand", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)

  // «Todos los escenarios» has no common onset.
  await chooseGroupMode(page, "Promedio")
  await chooseScenario(page, "Todos los escenarios")
  await expect(page.getByTestId("group-unsupported")).toContainText("Selecciona un escenario concreto")
  await chooseScenario(page, SCENARIO)

  const chart = groupChart(page)
  await expect(chart).toHaveAttribute("data-mode", "average")
  // The failure served under the first scenario is asked again on return.
  await expect(chart).toHaveAttribute("data-series", "4")
  await expect(chart.locator(".recharts-area-area")).toHaveCount(1)

  // «Media» is the mean of each participant's own mean (P04 has no data).
  const withData = ["P01", "P02", "P03", "P05"]
  const expected = withData.reduce((sum, code) => sum + participantMean(code), 0) / withData.length
  const kpis = page.getByTestId("group-kpis")
  await expect(kpis).toContainText(expected.toFixed(2).replace(".", ","))
  await expect(kpis).toContainText("Promedio de 4 participantes")
  const table = page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Estadísticas" }) })
  await expect(table.getByRole("row").nth(1)).toContainText("Promedio (4 participantes)")
  await page.screenshot({ path: `${SHOTS}/average-1536.png` })
  await page.getByRole("button", { name: "Cómo se calcula" }).first().hover()
  await expect(page.getByRole("tooltip").first()).toContainText("izquierda y derecha")
  await page.screenshot({ path: `${SHOTS}/average-1536-chip.png` })
  await table.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/average-1536-table.png` })

  // Changing the eye keeps the mode; the selection survives a tab change.
  await page.getByRole("button", { name: "Izquierda" }).click()
  await expect(chart).toHaveAttribute("data-mode", "average")
  await page.getByRole("tab", { name: "Histograma de fijaciones" }).click()
  await expect(page.getByTestId("group-unsupported")).toContainText("un participante a la vez")
  await page.getByRole("tab", { name: "Dilatación pupilar" }).click()
  await expect(groupChart(page)).toHaveAttribute("data-mode", "average")

  // «Ver un participante» returns to the individual view.
  await page.getByRole("tab", { name: "Histograma de fijaciones" }).click()
  await page.getByRole("button", { name: "Ver un participante" }).click()
  await expect(page.getByTestId("group-unsupported")).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Participantes: \d+ de 5/ })).toHaveCount(0)
  await expect(participantSelect(page)).toContainText("P01")

  // Choosing a participant in the select also leaves the group mode.
  await page.getByRole("tab", { name: "Dilatación pupilar" }).click()
  await chooseGroupMode(page, "Superposición")
  await participantSelect(page).click()
  await page.getByRole("option", { name: "Participante P03", exact: true }).click()
  await expect(groupChart(page)).toHaveCount(0)
  await expect(participantSelect(page)).toContainText("P03")
  await expect(page.getByRole("button", { name: "Comparar participantes" })).toBeVisible()

  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("phone width keeps the filters bar and the group chart inside the screen", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await mockApi(page, errors)
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)
  await chooseGroupMode(page, "Promedio")
  await expect(groupChart(page)).toHaveAttribute("data-series", "3")
  await noHorizontalScroll(page)
  await page.screenshot({ path: `${SHOTS}/average-390-top.png` })
  await groupChart(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/average-390.png` })
  await chooseGroupMode(page, "Superposición")
  await expect(groupChart(page)).toHaveAttribute("data-mode", "overlay")
  await noHorizontalScroll(page)
  await page.screenshot({ path: `${SHOTS}/overlay-390-top.png` })
  await groupChart(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/overlay-390.png` })
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})
