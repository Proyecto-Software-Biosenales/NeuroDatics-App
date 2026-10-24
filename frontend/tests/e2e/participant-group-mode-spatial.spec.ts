import { expect, test, type Page } from "@playwright/test"

/**
 * «Superposición» and «Promedio» in the spatial views: mapa de calor, mapa de
 * recorridos and comparativa AOIs. The API is simulated (page.route) and
 * strict: any request it does not know fails the test.
 */

const CODES = ["P01", "P02", "P03", "P04", "P05"]
const WITH_DATA = ["P01", "P02", "P03", "P05"]
const SCENARIO = "Escenario concreto"
const NO_DATA = "P04"
const SHOTS = process.env.GROUP_SPATIAL_SHOTS ?? "../output/group-mode/spatial"

const project = {
  id: "project-group-spatial",
  name: "Proyecto Grupo Espacial",
  status: "active",
  ingestion_generation: 2,
  sensors: [{ id: "group-spatial-eye", sensor_type: "EyeTracker" }],
}

const participants = CODES.map((code, index) => ({ participant_code: code, user_index: index + 1 }))
const indexOf = (code: string) => CODES.indexOf(code)

/** Where the stimulus draws its three targets, normalized to the image. */
const TARGETS = [
  { x: 0.25, y: 0.3 },
  { x: 0.7, y: 0.6 },
  { x: 0.5, y: 0.8 },
]
const STIMULUS_W = 1600
const STIMULUS_H = 900

/** A wide stimulus with a grid and a ring on every target, so overlays can be checked by eye. */
const stimulusSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STIMULUS_W}" height="${STIMULUS_H}" viewBox="0 0 ${STIMULUS_W} ${STIMULUS_H}">
<rect width="100%" height="100%" fill="#f4f1ea"/>
${Array.from({ length: 9 }, (_, k) => `<line x1="${(k + 1) * 160}" y1="0" x2="${(k + 1) * 160}" y2="${STIMULUS_H}" stroke="#d6d0c4" stroke-width="2"/>`).join("")}
${Array.from({ length: 9 }, (_, k) => `<line x1="0" y1="${(k + 1) * 90}" x2="${STIMULUS_W}" y2="${(k + 1) * 90}" stroke="#d6d0c4" stroke-width="2"/>`).join("")}
${TARGETS.map((t) => `<circle cx="${t.x * STIMULUS_W}" cy="${t.y * STIMULUS_H}" r="46" fill="none" stroke="#333" stroke-width="6"/><circle cx="${t.x * STIMULUS_W}" cy="${t.y * STIMULUS_H}" r="6" fill="#333"/>`).join("")}
</svg>`

/** The «group» heatmap: one soft blob centred on each target. */
const groupHeatmapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${STIMULUS_W}" height="${STIMULUS_H}" viewBox="0 0 ${STIMULUS_W} ${STIMULUS_H}">
<defs><radialGradient id="g"><stop offset="0" stop-color="#ff2a00" stop-opacity="0.95"/><stop offset="0.6" stop-color="#ffd000" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd000" stop-opacity="0"/></radialGradient></defs>
${TARGETS.map((t) => `<circle cx="${t.x * STIMULUS_W}" cy="${t.y * STIMULUS_H}" r="120" fill="url(#g)"/>`).join("")}
</svg>`

/** Each participant fixates every target, slightly to the side and for a different time. */
function fixationsFor(code: string) {
  const i = indexOf(code)
  return TARGETS.map((target, j) => ({
    id: `${code}-${j}`,
    x_norm: target.x + (i - 2) * 0.012,
    y_norm: target.y,
    time_s: j,
    t_end_s: j + 0.2,
    duration_s: 0.15 + 0.1 * j + 0.05 * i,
  }))
}

function fixationStats(code: string) {
  const durations = fixationsFor(code).map((fixation) => fixation.duration_s)
  return {
    n_fixations: durations.length + indexOf(code),
    max_duration_s: Math.max(...durations),
    avg_duration_s: durations.reduce((sum, value) => sum + value, 0) / durations.length,
  }
}

function scanpathFor(code: string) {
  const fixations = fixationsFor(code)
  return {
    objectives: fixations.map((fixation, k) => ({
      id: k + 1,
      cx: fixation.x_norm,
      cy: fixation.y_norm,
      duration_s: fixation.duration_s,
      radius_norm: 0.5,
      t_start: fixation.time_s,
      t_end: fixation.t_end_s,
      n_points: 10,
    })),
    n_objectives: fixations.length,
    total_distance_px: 900 + indexOf(code) * 10,
    avg_duration_s: fixationStats(code).avg_duration_s,
    total_duration_s: fixations.reduce((sum, fixation) => sum + fixation.duration_s, 0),
    radius_scale: { version: "absolute-area-v1", encoding: "area", cap_ms: 2000 },
    scenario_file_id: "scenario-image",
  }
}

const AOI_SHAPES = [
  { id: "aoi-a", name: "Logo", color: "#2563eb", x: 15, y: 20 },
  { id: "aoi-b", name: "Producto", color: "#16a34a", x: 60, y: 50 },
  { id: "aoi-c", name: "Precio", color: "#db2777", x: 40, y: 70 },
]

/** Share of fixation time in each AOI: participant i spends 40+5i % in «Logo». */
const dwellOf = (code: string, aoi: number) => {
  const i = indexOf(code)
  return [40 + 5 * i, 30 - 3 * i, 10 + i][aoi]
}

function aoisFor(code: string) {
  const i = indexOf(code)
  const aois = AOI_SHAPES.map((shape, k) => ({
    id: shape.id,
    name: shape.name,
    color: shape.color,
    shape_type: "rect",
    shape: { x: shape.x, y: shape.y, width: 20, height: 20, points: [] },
    fixation_count: 2 + k + i,
    total_dwell_time_ms: dwellOf(code, k) * 30,
    total_dwell_time_percent: dwellOf(code, k),
    avg_fixation_duration_ms: 200 + 10 * i,
    ttff_ms: 100,
    hit_rate_percent: 20,
    fixations_to_target: 1,
    pupil_sample_count: 10,
    avg_pupil_mm: 3.5,
    pupil_delta_from_baseline_mm: 0.1,
    pupil_delta_percent: 2 + i,
    distance_sample_count: 10,
    avg_distance_cm: 60,
    distance_delta_from_baseline_cm: 1,
    distance_delta_percent: 1,
  }))
  const observed = aois.reduce((sum, aoi) => sum + aoi.total_dwell_time_percent, 0)
  return {
    scenario: SCENARIO,
    scenario_file_id: "scenario-image",
    aois,
    transitions: [],
    events: [],
    total_fixations: 12 + i,
    total_dwell_time_ms: 3000,
    observed_aoi_dwell_time_ms: observed * 30,
    observed_aoi_dwell_time_percent: observed,
  }
}

const series = (count: number, value: (k: number) => number) => Array.from({ length: count }, (_, k) => value(k))

interface MockState {
  unhandled: string[]
  /** Participant of every per-participant heatmap image request. */
  heatmapImages: string[]
  groupHeatmaps: URLSearchParams[]
}

async function mockApi(page: Page, errors: string[]): Promise<MockState> {
  const state: MockState = { unhandled: [], heatmapImages: [], groupHeatmaps: [] }
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "neurodatics-auth-session",
      JSON.stringify({
        user: { id: "e2e-group-spatial", email: "group-spatial@neurodatics.test", name: "Group Spatial E2E", authSource: "google-oauth" },
        session: { accessToken: "group-spatial-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
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
    const notFound = () => fulfill({ status: 404, json: { detail: "Participant data not found" } })
    if (path === "/api/projects") return fulfill({ json: [project] })
    if (path === `/api/projects/${project.id}`) return fulfill({ json: project })
    if (path.endsWith("/analytics/participants")) return fulfill({ json: participants })
    if (path.endsWith("/analytics/scenarios")) return fulfill({ json: [{ name: SCENARIO, type: "image", file_id: "scenario-image" }] })
    if (/\/files\/[^/]+\/(image|preview)$/.test(path)) return fulfill({ body: stimulusSvg, contentType: "image/svg+xml" })
    if (path.endsWith("/analytics/heatmap/group")) {
      state.groupHeatmaps.push(params)
      const codes = params.getAll("participant_codes")
      const used = codes.filter((code) => code !== NO_DATA)
      if (used.length === 0) {
        return fulfill({ status: 404, json: { detail: "Ninguno de los participantes elegidos tiene fijaciones en este escenario" } })
      }
      return fulfill({
        body: groupHeatmapSvg,
        contentType: "image/svg+xml",
        headers: {
          "X-Group-Participants": used.join(","),
          "X-Group-Participants-Skipped": codes.filter((code) => code === NO_DATA).join(","),
          "X-Stimulus-Transform-Status": "applied",
          "X-Stimulus-Coordinate-Space": "stimulus",
          "X-Stimulus-Transform-Version": "none",
          "X-Stimulus-Transform-Fingerprint": "none",
          "X-Stimulus-Transform-Warnings": "",
        },
      })
    }
    if (path.endsWith("/analytics/heatmap")) {
      state.heatmapImages.push(participant)
      return fulfill({ body: groupHeatmapSvg, contentType: "image/svg+xml" })
    }
    if (path.endsWith("/analytics/fixations/sensitivity")) {
      return fulfill({ json: { default_min_fixation_duration_ms: 200, available_min_fixation_durations_ms: [100, 150, 200, 250, 300], points: [] } })
    }
    if (path.endsWith("/analytics/fixations")) {
      if (participant === NO_DATA) return notFound()
      return fulfill({
        json: {
          fixations: fixationsFor(participant),
          stats: fixationStats(participant),
          scenario_file_id: "scenario-image",
          cache_generation: 2,
          coordinate_transform: null,
        },
      })
    }
    if (path.endsWith("/analytics/scanpath")) {
      if (participant === NO_DATA) return notFound()
      return fulfill({ json: scanpathFor(participant) })
    }
    if (path.endsWith("/analytics/aois")) {
      if (participant === NO_DATA) return notFound()
      return fulfill({ json: aoisFor(participant || "P01") })
    }
    if (path.endsWith("/analytics/scenario-timing")) {
      return fulfill({ json: { scenario: SCENARIO, time_basis: "scenario_onset", onset_s: 10, end_s: 40, gsr_origin_s: null } })
    }
    if (path.endsWith("/analytics/timeseries/pupil")) {
      const left = series(40, (k) => 3 + Math.sin(k / 5) * 0.2)
      return fulfill({ json: { time: series(40, (k) => 10 + k * 0.5), left, right: left, average: left, smooth_left: left, smooth_right: left } })
    }
    if (path.endsWith("/analytics/timeseries/gaze")) {
      const values = series(40, (k) => 30 + k)
      return fulfill({ json: { time: series(40, (k) => 10 + k * 0.5), gx: values, gy: values, gx_clean: values, gy_clean: values } })
    }
    if (path.endsWith("/analytics/timeseries/distance")) {
      return fulfill({ json: { time: series(40, (k) => 10 + k * 0.5), distance_cm: series(40, () => 60) } })
    }
    if (path === "/api/settings/screen") return fulfill({ json: { screen: { width_px: 1280, height_px: 1024, width_cm: null, height_cm: null }, confirmed: true } })
    state.unhandled.push(`${route.request().method()} ${url.pathname}`)
    return fulfill({ status: 501, json: { detail: `Unhandled mock: ${url.pathname}` } })
  })
  return state
}

const participantSelect = (page: Page) => page.locator('[data-slot="select-trigger"]').nth(1)

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

async function openView(page: Page, tab: "Mapa de calor" | "Mapa de recorridos" | "Comparativa AOIs") {
  await page.getByRole("tab", { name: tab }).click()
  await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true")
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

/**
 * Where the stimulus is painted inside `container` (object-contain), measured
 * in the page, and the screen position of each `selector` match's centre.
 */
async function paintedBox(page: Page, container: string) {
  return page.evaluate((selector) => {
    const img = document.querySelector(`${selector} img[alt="Escenario"]`) as HTMLImageElement
    const rect = img.getBoundingClientRect()
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
    const width = img.naturalWidth * scale
    const height = img.naturalHeight * scale
    return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height }
  }, container)
}

async function centres(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })
  )
}

const close = (actual: number, expected: number, tolerance = 1.5) =>
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance)

const figuresTable = (page: Page) => page.getByTestId("group-figures")

test("heatmap overlay draws every participant's fixations on the stimulus, without per-participant images", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)
  await openView(page, "Mapa de calor")
  await chooseGroupMode(page, "Superposición")
  // The page-level minimum duration stays available.
  await expect(page.getByRole("combobox", { name: "Duración mínima de fijación" })).toBeVisible()

  const layer = page.getByTestId("group-fixations")
  await expect(layer.locator("g[data-participant]")).toHaveCount(WITH_DATA.length)
  await expect(layer.locator('g[data-participant="P01"] circle')).toHaveCount(3)
  await expect(layer.locator('g[data-participant="P03"] circle').first()).toHaveAttribute("fill", "var(--group-series-3)")
  await expect(layer.locator('g[data-participant="P02"] circle title').first()).toHaveText("Participante P02: fijación de 200 ms")
  // Longer fixations draw larger points.
  const radii = await layer.locator('g[data-participant="P01"] circle').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("r"))))
  expect(radii[0]).toBeLessThan(radii[2])
  await expect(page.getByRole("button", { name: "1 sin datos" })).toBeVisible()
  await expect(page.getByTestId("group-kpis")).toHaveCount(0)

  // Each point sits on the painted stimulus, where the fixation was.
  const box = await paintedBox(page, '[data-testid="heatmap-stimulus"]')
  const points = await centres(page, '[data-testid="group-fixations"] g[data-participant="P01"] circle')
  fixationsFor("P01").forEach((fixation, k) => {
    close(points[k].x, box.left + fixation.x_norm * box.width)
    close(points[k].y, box.top + fixation.y_norm * box.height)
  })

  // One row per participant, with the same figures as the individual cards.
  const table = figuresTable(page)
  await expect(table.getByRole("row")).toHaveCount(1 + CODES.length)
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(String(fixationStats("P02").n_fixations))
  await expect(table.getByRole("row", { name: /Participante P04/ })).toContainText("—")

  // The individual view may have asked for its own image; nobody else's was requested.
  expect(state.heatmapImages.every((code) => code === "P01")).toBe(true)
  expect(state.groupHeatmaps).toHaveLength(0)
  await page.screenshot({ path: `${SHOTS}/heatmap-overlay-1536.png` })
  await page.locator('[data-testid="group-fixations"] g[data-participant="P05"] circle').nth(1).hover()
  await page.screenshot({ path: `${SHOTS}/heatmap-overlay-1536-hover.png` })
  await table.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/heatmap-overlay-1536-table.png` })

  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("heatmap average draws the group map over the stimulus and follows the minimum duration", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)
  await openView(page, "Mapa de calor")
  await chooseGroupMode(page, "Promedio")

  const overlay = page.getByTestId("group-heatmap-overlay")
  await expect(overlay).toBeVisible()
  const request = state.groupHeatmaps.at(-1)!
  expect(request.getAll("participant_codes")).toEqual(CODES)
  expect(request.get("scenario")).toBe(SCENARIO)
  expect(request.get("min_fixation_duration_ms")).toBe("200")
  expect(request.get("generation")).toBe("2")
  await expect(page.getByRole("button", { name: "1 sin fijaciones" })).toBeVisible()
  // The map's chip names who has no fixations; the generic one would repeat it.
  await expect(page.getByRole("button", { name: "1 sin datos" })).toHaveCount(0)

  // The group map covers exactly the painted stimulus.
  const box = await paintedBox(page, '[data-testid="heatmap-stimulus"]')
  const rect = await overlay.boundingBox()
  close(rect!.x, box.left)
  close(rect!.y, box.top)
  close(rect!.width, box.width)
  close(rect!.height, box.height)

  // KPI cards and the first table row are the mean of each participant's figure.
  const kpis = page.getByTestId("group-kpis")
  const meanCount = WITH_DATA.reduce((sum, code) => sum + fixationStats(code).n_fixations, 0) / WITH_DATA.length
  await expect(kpis).toContainText(meanCount.toFixed(1).replace(".", ","))
  await expect(kpis).toContainText("Promedio de 4 participantes")
  await expect(figuresTable(page).getByRole("row").nth(1)).toContainText("Promedio (4 participantes)")
  await page.screenshot({ path: `${SHOTS}/heatmap-average-1536.png` })
  await page.getByRole("button", { name: "1 sin fijaciones" }).hover()
  await expect(page.getByRole("tooltip").first()).toContainText("Participante P04")
  await page.screenshot({ path: `${SHOTS}/heatmap-average-1536-chip.png` })

  // The page-level minimum duration reaches the group map.
  const minimum = page.getByRole("combobox", { name: "Duración mínima de fijación" })
  await minimum.click()
  await page.getByRole("option", { name: "300 ms" }).click()
  await expect.poll(() => state.groupHeatmaps.at(-1)?.get("min_fixation_duration_ms")).toBe("300")
  await expect(overlay).toBeVisible()

  // Only participants without fixations: the server's message takes the map's place.
  await page.getByRole("button", { name: /Participantes: 5 de 5/ }).click()
  const popover = page.getByRole("dialog", { name: "Seleccionar participantes" })
  for (const code of WITH_DATA) await popover.getByRole("checkbox", { name: `Participante ${code}` }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByText("Ninguno de los participantes elegidos tiene fijaciones en este escenario")).toBeVisible()

  expect(state.heatmapImages.every((code) => code === "P01")).toBe(true)
  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("scanpath overlay draws one path per participant; average is not offered", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)
  await openView(page, "Mapa de recorridos")
  await chooseGroupMode(page, "Superposición")

  const paths = page.getByTestId("group-scanpath")
  await expect(paths).toHaveCount(WITH_DATA.length)
  await expect(paths.nth(1)).toHaveAttribute("data-participant", "P02")
  await expect(paths.nth(1).locator("line").first()).toHaveAttribute("stroke", "var(--group-series-2)")
  await expect(page.getByTestId("group-scanpath-P02-1").locator("circle")).toHaveAttribute("fill", "var(--group-series-2)")
  await expect(page.getByTestId("group-scanpath-P02-1")).toHaveAttribute("aria-label", /^Participante P02\. Fijación 1:/)
  // The playback slider follows one recording: gone in a group mode.
  await expect(page.getByRole("slider", { name: "Fijaciones visibles" })).toHaveCount(0)

  const box = await paintedBox(page, '[data-testid="scanpath-stimulus"]')
  const nodes = await centres(page, '[data-testid^="group-scanpath-P05-"] circle')
  scanpathFor("P05").objectives.forEach((objective, k) => {
    close(nodes[k].x, box.left + objective.cx * box.width)
    close(nodes[k].y, box.top + objective.cy * box.height)
  })

  const table = figuresTable(page)
  await expect(table.getByRole("row")).toHaveCount(1 + CODES.length)
  await expect(table.getByRole("row", { name: /Participante P03/ })).toContainText(`${scanpathFor("P03").total_distance_px}`)
  await page.screenshot({ path: `${SHOTS}/scanpath-overlay-1536.png` })
  await page.getByTestId("group-scanpath-P05-2").hover()
  await page.screenshot({ path: `${SHOTS}/scanpath-overlay-1536-hover.png` })

  await chooseGroupMode(page, "Promedio")
  await expect(page.getByTestId("group-unsupported")).toContainText("Los recorridos no se pueden promediar")
  await expect(figuresTable(page)).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/scanpath-average-1536.png` })

  await chooseGroupMode(page, "Superposición")
  await chooseScenario(page, "Todos los escenarios")
  await expect(page.getByTestId("group-unsupported")).toContainText("Selecciona un escenario concreto")

  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("AOI overlay groups one bar per participant; average shows the mean of each AOI", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 1536, height: 730 })
  const state = await mockApi(page, errors)
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)
  await openView(page, "Comparativa AOIs")
  await chooseGroupMode(page, "Superposición")

  const chart = page.getByTestId("aoi-group-chart")
  await expect(chart).toHaveAttribute("data-mode", "overlay")
  await expect(chart).toHaveAttribute("data-series", String(WITH_DATA.length))
  await expect(chart.locator(".recharts-bar-rectangle")).toHaveCount(WITH_DATA.length * AOI_SHAPES.length)
  const fills = await chart.locator(".recharts-bar").evaluateAll((bars) => bars.map((bar) => bar.querySelector("path")?.getAttribute("fill")))
  expect(fills).toEqual(["var(--group-series-1)", "var(--group-series-2)", "var(--group-series-3)", "var(--group-series-5)"])
  // Recording-bound cards (sequence, transitions…) stay out of a group mode.
  await expect(page.getByText("Métricas por AOI")).toHaveCount(0)
  const table = figuresTable(page)
  await expect(table.getByRole("columnheader", { name: "Logo" })).toBeVisible()
  await expect(table.getByRole("row", { name: /Participante P02/ })).toContainText(`${dwellOf("P02", 0).toFixed(1).replace(".", ",")}`)
  await page.screenshot({ path: `${SHOTS}/aoi-overlay-1536.png` })
  await chart.scrollIntoViewIfNeeded()
  await chart.locator(".recharts-bar-rectangle").nth(1).hover()
  await page.screenshot({ path: `${SHOTS}/aoi-overlay-1536-chart.png` })

  await chooseGroupMode(page, "Promedio")
  await expect(chart).toHaveAttribute("data-mode", "average")
  await expect(chart.locator(".recharts-bar-rectangle")).toHaveCount(AOI_SHAPES.length)
  const meanLogo = WITH_DATA.reduce((sum, code) => sum + dwellOf(code, 0), 0) / WITH_DATA.length
  const kpis = page.getByTestId("group-kpis")
  await expect(kpis).toContainText("Promedio de 4 participantes")
  await expect(kpis).toContainText("Logo")
  await expect(kpis).toContainText(meanLogo.toFixed(1).replace(".", ","))
  const metrics = page.getByTestId("aoi-group-metrics")
  const logo = metrics.getByRole("row", { name: /Logo/ })
  await expect(logo).toContainText(`${meanLogo.toFixed(1).replace(".", ",")} %`)
  await expect(logo.getByRole("cell").last()).toHaveText("4")
  await page.screenshot({ path: `${SHOTS}/aoi-average-1536.png` })
  await metrics.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/aoi-average-1536-table.png` })

  await noHorizontalScroll(page)
  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})

test("phone width keeps every spatial group view inside the screen", async ({ page }) => {
  const errors: string[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await mockApi(page, errors)
  await page.goto("/dashboard")
  await chooseScenario(page, SCENARIO)

  await openView(page, "Mapa de calor")
  await chooseGroupMode(page, "Superposición")
  await expect(page.getByTestId("group-fixations").locator("g[data-participant]")).toHaveCount(WITH_DATA.length)
  const box = await paintedBox(page, '[data-testid="heatmap-stimulus"]')
  const points = await centres(page, '[data-testid="group-fixations"] g[data-participant="P01"] circle')
  close(points[1].x, box.left + fixationsFor("P01")[1].x_norm * box.width)
  await noHorizontalScroll(page)
  await page.getByTestId("heatmap-stimulus").scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/heatmap-overlay-390.png` })

  await chooseGroupMode(page, "Promedio")
  await expect(page.getByTestId("group-heatmap-overlay")).toBeVisible()
  await noHorizontalScroll(page)
  await page.getByTestId("heatmap-stimulus").scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/heatmap-average-390.png` })

  await openView(page, "Comparativa AOIs")
  await expect(page.getByTestId("aoi-group-chart")).toHaveAttribute("data-mode", "average")
  await noHorizontalScroll(page)
  await page.getByTestId("aoi-group-chart").scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/aoi-average-390.png` })

  await chooseGroupMode(page, "Superposición")
  await openView(page, "Mapa de recorridos")
  await expect(page.getByTestId("group-scanpath")).toHaveCount(WITH_DATA.length)
  await noHorizontalScroll(page)
  await page.getByTestId("scanpath-stimulus").scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/scanpath-overlay-390.png` })

  await openView(page, "Comparativa AOIs")
  await expect(page.getByTestId("aoi-group-chart")).toHaveAttribute("data-mode", "overlay")
  await noHorizontalScroll(page)
  await figuresTable(page).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/aoi-overlay-390-table.png` })

  expect(state.unhandled).toEqual([])
  expect(errors).toEqual([])
})
