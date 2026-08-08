import { expect, test, type Locator, type Page } from "@playwright/test"

const TEST_USER_ID = "e2e-comparison-user"
const STORAGE_KEY_PREFIX = "neurodatics-comparison-views-v1"

const projects = [
  {
    id: "project-alpha",
    name: "Proyecto Alfa",
    status: "active",
    sensors: [
      { id: "alpha-eye", sensor_type: "EyeTracker" },
      { id: "alpha-gsr", sensor_type: "GSR" },
      { id: "alpha-eeg", sensor_type: "EEG" },
    ],
  },
  {
    id: "project-beta",
    name: "Proyecto Beta",
    status: "active",
    sensors: [{ id: "beta-eye", sensor_type: "EyeTracker" }],
  },
]

const participants = [
  { participant_code: "P01", user_index: 1 },
  { participant_code: "P02", user_index: 2 },
]

const scenarios = [
  { name: "Escenario concreto", type: "image", file_id: "scenario-image" },
  { name: "Escenario alterno", type: "image", file_id: "scenario-image-2" },
]

const time = Array.from({ length: 80 }, (_, index) => index * 0.25)
const pupilLeft = time.map((value) => 3.2 + Math.sin(value / 2) * 0.25)
const pupilRight = time.map((value) => 3.1 + Math.cos(value / 2) * 0.2)

const pupilTimeseries = {
  time,
  left: pupilLeft,
  right: pupilRight,
  average: time.map((_, index) => (pupilLeft[index] + pupilRight[index]) / 2),
  smooth_left: pupilLeft,
  smooth_right: pupilRight,
}

const gazeTimeseries = {
  time,
  gx_clean: time.map((value) => 45 + Math.sin(value / 3) * 15),
  gy_clean: time.map((value) => 52 + Math.cos(value / 3) * 12),
}

const instructionGaze = {
  requested_time_s: 10,
  nearest_time_s: 10,
  scenario: "Instrucción 01.png",
  gx: 37.5,
  gy: 62.5,
  scenario_file_id: null,
  scenario_type: null,
  scenario_time_s: 10,
}

const emptyAoiMetrics = {
  scenario: "Escenario concreto",
  scenario_file_id: null,
  aois: [],
  transitions: [],
  total_fixations: 0,
  total_dwell_time_ms: 0,
  observed_aoi_dwell_time_ms: 0,
  observed_aoi_dwell_time_percent: 0,
}

const distanceTimeseries = {
  time,
  distance_cm: time.map((value) => 61 + Math.sin(value / 4) * 3),
}

const correlationSignals = [
  {
    id: "pupil_avg_mm",
    label: "Dilatación pupilar promedio",
    unit: "mm",
    available: true,
    valid_bins: 80,
    coverage: 1,
    source_columns: ["pupil_left", "pupil_right"],
    unavailable_reason: null,
  },
  {
    id: "gaze_x_pct",
    label: "Posición de mirada X",
    unit: "%",
    available: true,
    valid_bins: 80,
    coverage: 1,
    source_columns: ["gaze_x"],
    unavailable_reason: null,
  },
  {
    id: "gaze_y_pct",
    label: "Posición de mirada Y",
    unit: "%",
    available: true,
    valid_bins: 80,
    coverage: 1,
    source_columns: ["gaze_y"],
    unavailable_reason: null,
  },
  {
    id: "distance_cm",
    label: "Distancia al dispositivo",
    unit: "cm",
    available: true,
    valid_bins: 80,
    coverage: 1,
    source_columns: ["distance"],
    unavailable_reason: null,
  },
] as const

const correlations = {
  participant_code: "P01",
  scenario: "Escenario concreto",
  method: "pearson",
  time_basis: "scenario_relative",
  bin_size_s: 0.25,
  min_pair_samples: 3,
  duration_s: 20,
  total_bins: 80,
  signals: correlationSignals,
  matrix: correlationSignals.map((row, rowIndex) =>
    correlationSignals.map((column, columnIndex) => ({
      signal_x: row.id,
      signal_y: column.id,
      coefficient:
        rowIndex === columnIndex
          ? 1
          : Math.round((0.18 + (rowIndex + columnIndex) * 0.11) * 1000) / 1000,
      n_samples: 80,
      coverage: 1,
      status: "ok",
    }))
  ),
}

function projectStorageKey(projectId: string) {
  return `${STORAGE_KEY_PREFIX}:${TEST_USER_ID}:${projectId}`
}

async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(
    ({ userId }) => {
      window.localStorage.setItem(
        "neurodatics-auth-session",
        JSON.stringify({
          user: {
            id: userId,
            email: "comparison-e2e@neurodatics.test",
            name: "Comparison E2E",
            authSource: "google-oauth",
          },
          session: {
            accessToken: "comparison-e2e-token",
            tokenType: "bearer",
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        })
      )
    },
    { userId: TEST_USER_ID }
  )
}

async function mockDashboardApi(page: Page, gazeAtResponse = instructionGaze) {
  const unhandledRequests: string[] = []

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/\/$/, "")

    if (path === "/api/projects") {
      await route.fulfill({ json: projects })
      return
    }
    if (/\/analytics\/participants$/.test(path)) {
      await route.fulfill({ json: participants })
      return
    }
    if (/\/analytics\/scenarios$/.test(path)) {
      await route.fulfill({ json: scenarios })
      return
    }
    if (/\/analytics\/timeseries\/pupil$/.test(path)) {
      await route.fulfill({ json: pupilTimeseries })
      return
    }
    if (/\/analytics\/timeseries\/gaze$/.test(path)) {
      await route.fulfill({ json: gazeTimeseries })
      return
    }
    if (/\/analytics\/timeseries\/distance$/.test(path)) {
      await route.fulfill({ json: distanceTimeseries })
      return
    }
    if (/\/analytics\/gaze-at$/.test(path)) {
      await route.fulfill({ json: gazeAtResponse })
      return
    }
    if (/\/analytics\/aois$/.test(path)) {
      await route.fulfill({ json: emptyAoiMetrics })
      return
    }
    if (/\/analytics\/correlations$/.test(path)) {
      await route.fulfill({ json: correlations })
      return
    }

    unhandledRequests.push(`${route.request().method()} ${url.pathname}`)
    await route.fulfill({
      status: 501,
      json: { detail: `Unhandled Playwright mock: ${url.pathname}` },
    })
  })

  return unhandledRequests
}

async function openProjectComparison(page: Page, projectName: string) {
  const projectButton = page.getByRole("button", {
    name: projectName,
    exact: true,
  })
  await expect(projectButton).toBeVisible()

  const project = projectButton.locator("xpath=../..")
  const comparisonButton = project.getByRole("button", {
    name: "Comparativas",
    exact: true,
  })

  if ((await comparisonButton.count()) === 0) {
    await project.getByRole("button", { name: "Expandir proyecto" }).click()
  }

  await comparisonButton.click()
  await expect(
    page.getByRole("heading", { name: "Comparativas", exact: true })
  ).toBeVisible()
}

async function selectScenario(page: Page, scenarioName = "Escenario concreto") {
  const scenarioTrigger = page.locator('[data-slot="combobox-trigger"]').first()
  await scenarioTrigger.click()
  await page.getByRole("option", { name: scenarioName, exact: true }).click()
  await expect(scenarioTrigger).toContainText(scenarioName)
}

async function openComparisonDashboard(
  page: Page,
  projectName = "Proyecto Alfa",
  concreteScenario = true
) {
  await page.goto("/dashboard")
  await openProjectComparison(page, projectName)
  if (concreteScenario) await selectScenario(page)

  const charts = page.locator('[role="img"][aria-label*="observaciones"]')
  await expect(charts).toHaveCount(3)
  if (concreteScenario) {
    await expect(
      page.getByRole("table", {
        name: /Matriz de correlaciones de Pearson para Escenario concreto/,
      })
    ).toBeVisible()
  }
}

async function expectCompactGenericImage(image: Locator) {
  const box = await image.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeLessThanOrEqual(561)
  expect(box!.height).toBeLessThanOrEqual(316)
  expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1)
}

test.beforeEach(async ({ page }) => {
  await installAuthenticatedSession(page)
})

test("renders a generic stimulus in the single-sensor view for a fileless moment", async ({
  page,
}) => {
  const stimulusFileRequests: string[] = []
  page.on("request", (request) => {
    if (/\/files\/[^/]+\/(?:preview|image)(?:\?|$)/.test(request.url())) {
      stimulusFileRequests.push(request.url())
    }
  })
  const unhandledRequests = await mockDashboardApi(page, {
    ...instructionGaze,
    gx: 0,
    gy: 0,
  })

  await page.goto("/dashboard")
  await page.getByRole("button", { name: "Proyecto Alfa", exact: true }).click()

  const minimumCard = page.getByRole("button", { name: /Mínimo/ })
  await expect(minimumCard).toBeVisible()
  await minimumCard.click()

  const genericImage = page.getByRole("img", {
    name: "Pantalla genérica: INSTRUCCIONES",
  })
  await expect(genericImage).toBeVisible()
  await expectCompactGenericImage(genericImage)
  await expect(genericImage.locator("rect").first()).toHaveAttribute(
    "fill",
    "#000000"
  )

  const gazeMarker = genericImage.getByTestId("missing-stimulus-gaze-marker")
  await expect(gazeMarker).toBeVisible()
  await expect(gazeMarker).toHaveAttribute("data-gaze-marker", "cyan")
  await expect(gazeMarker).toHaveAttribute("data-gaze-x", "0")
  await expect(gazeMarker).toHaveAttribute("data-gaze-y", "0")

  const stimulusBlock = genericImage.locator("xpath=..")
  await expect(stimulusBlock).toContainText("t = 10.00s")
  await expect(stimulusBlock).toContainText("Posición de mirada: (0.0, 0.0)")
  await expect(page.getByText(/no hay estímulo visual asociado/)).toHaveCount(0)
  expect(stimulusFileRequests).toEqual([])
  expect(unhandledRequests).toEqual([])
})

test("renders a generic stimulus and gaze point when the selected moment has no file", async ({
  page,
}) => {
  const stimulusFileRequests: string[] = []
  page.on("request", (request) => {
    if (/\/files\/[^/]+\/(?:preview|image)(?:\?|$)/.test(request.url())) {
      stimulusFileRequests.push(request.url())
    }
  })
  const unhandledRequests = await mockDashboardApi(page)
  await openComparisonDashboard(page)

  const pupilChart = page.getByRole("img", {
    name: /Diámetro \(mm\).*Haz clic en un punto/,
  })
  const chartBox = await pupilChart.boundingBox()
  expect(chartBox).not.toBeNull()
  const chartPosition = {
    x: chartBox!.width / 2,
    y: chartBox!.height / 2,
  }
  await pupilChart.hover({ position: chartPosition })
  const activePoint = pupilChart.locator(".recharts-active-dot").first()
  await expect(activePoint).toBeVisible()
  await activePoint.click()

  const pointHeading = page.getByRole("heading", {
    name: "Punto sobre estímulo",
  })
  await expect(pointHeading).toBeVisible()
  const pointPanel = pointHeading.locator("xpath=../../..")
  await expect(
    pointPanel.getByRole("img", {
      name: "Pantalla genérica: INSTRUCCIONES",
    })
  ).toBeVisible()
  await expectCompactGenericImage(
    pointPanel.getByRole("img", {
      name: "Pantalla genérica: INSTRUCCIONES",
    })
  )
  const gazeMarker = pointPanel.getByTestId("missing-stimulus-gaze-marker")
  await expect(gazeMarker).toBeVisible()
  await expect(gazeMarker).toHaveAttribute("data-gaze-marker", "rose")
  await expect(gazeMarker).toHaveAttribute("data-gaze-x", "37.5")
  await expect(gazeMarker).toHaveAttribute("data-gaze-y", "62.5")
  await expect(pointPanel).toContainText("Tiempo: 10.00 s")
  await expect(pointPanel).toContainText("X: 37.5%")
  await expect(pointPanel).toContainText("Y: 62.5%")
  await expect(pointPanel).not.toContainText(
    "no hay estímulo visual asociado a este escenario"
  )

  const aoiToggle = pointPanel.getByRole("button", { name: "Ocultar AOIs" })
  const pointToggle = pointPanel.getByRole("button", {
    name: "Ocultar punto de fijación",
  })
  await expect(aoiToggle).toBeDisabled()
  await expect(pointToggle).toBeEnabled()
  await expect(pointToggle).toHaveAttribute("aria-pressed", "true")
  await pointToggle.click()
  await expect(gazeMarker).toHaveCount(0)
  await expect(
    pointPanel.getByRole("button", { name: "Mostrar punto de fijación" })
  ).toHaveAttribute("aria-pressed", "false")
  expect(stimulusFileRequests).toEqual([])
  expect(unhandledRequests).toEqual([])
})

test("keeps the document fixed while the comparison shell consumes extra scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  const unhandledRequests = await mockDashboardApi(page)
  await openComparisonDashboard(page)

  const shell = page.locator("main.analytics-shell")
  const table = page.getByRole("table", {
    name: /Matriz de correlaciones de Pearson para Escenario concreto/,
  })
  const charts = page.locator('[role="img"][aria-label*="observaciones"]')

  const centered = await table.evaluate((element) => {
    const tableRect = element.getBoundingClientRect()
    const containerRect = element.parentElement!.getBoundingClientRect()
    return {
      leftGap: tableRect.left - containerRect.left,
      rightGap: containerRect.right - tableRect.right,
    }
  })
  expect(centered.leftGap).toBeGreaterThan(20)
  expect(Math.abs(centered.leftGap - centered.rightGap)).toBeLessThanOrEqual(2)

  const beforeGeometry = await charts.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    })
  )

  await shell.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await shell.hover({ position: { x: 20, y: 20 } })
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, 1_200)
  }

  await expect(table).toBeInViewport()
  const afterGeometry = await charts.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    })
  )
  expect(afterGeometry).toEqual(beforeGeometry)

  const layout = await shell.evaluate((element) => ({
    bodyScrollHeight: document.body.scrollHeight,
    documentScrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    shellBottom: element.getBoundingClientRect().bottom,
    shellClientHeight: element.clientHeight,
    shellScrollHeight: element.scrollHeight,
    shellScrollTop: element.scrollTop,
    windowScrollY: window.scrollY,
  }))

  expect(layout.windowScrollY).toBe(0)
  expect(layout.documentScrollHeight).toBeLessThanOrEqual(
    layout.innerHeight + 1
  )
  expect(layout.bodyScrollHeight).toBeLessThanOrEqual(layout.innerHeight + 1)
  expect(Math.abs(layout.shellBottom - layout.innerHeight)).toBeLessThanOrEqual(
    1
  )
  expect(
    layout.shellScrollTop + layout.shellClientHeight
  ).toBeGreaterThanOrEqual(layout.shellScrollHeight - 1)
  expect(unhandledRequests).toEqual([])
})

test("contains the correlation matrix horizontal scroll on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 })
  const unhandledRequests = await mockDashboardApi(page)
  await openComparisonDashboard(page)

  const table = page.getByRole("table", {
    name: /Matriz de correlaciones de Pearson para Escenario concreto/,
  })
  const container = table.locator("xpath=..")
  const firstColumn = table.locator("thead th").first()

  const overflow = await container.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)

  await container.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect
    .poll(() => container.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0)

  const stickyPosition = await firstColumn.evaluate((element) => {
    const columnRect = element.getBoundingClientRect()
    const containerRect =
      element.parentElement!.parentElement!.parentElement!.parentElement!.getBoundingClientRect()
    return {
      columnLeft: columnRect.left,
      containerLeft: containerRect.left,
      position: window.getComputedStyle(element).position,
    }
  })
  expect(stickyPosition.position).toBe("sticky")
  expect(
    Math.abs(stickyPosition.columnLeft - stickyPosition.containerLeft)
  ).toBeLessThanOrEqual(2)

  const horizontalLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    windowScrollX: window.scrollX,
  }))
  expect(horizontalLayout.windowScrollX).toBe(0)
  expect(horizontalLayout.documentWidth).toBeLessThanOrEqual(
    horizontalLayout.innerWidth + 1
  )
  expect(unhandledRequests).toEqual([])
})

test("restores applied views per user and project across filters, navigation, and reload", async ({
  page,
}) => {
  const unhandledRequests = await mockDashboardApi(page)
  await openComparisonDashboard(page)

  await page.getByRole("button", { name: /Gráficas a comparar/ }).click()
  await page.getByRole("checkbox", { name: "Distancia al dispositivo" }).click()
  await page.getByRole("button", { name: "Aplicar selección" }).click()

  await expect(
    page.locator('button[aria-controls="comparison-panel-pupil"]')
  ).toBeVisible()
  await expect(
    page.locator('button[aria-controls="comparison-panel-gaze"]')
  ).toBeVisible()
  await expect(
    page.locator('button[aria-controls="comparison-panel-distance"]')
  ).toHaveCount(0)

  const alphaKey = projectStorageKey("project-alpha")
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = window.localStorage.getItem(key)
        return raw ? JSON.parse(raw) : null
      }, alphaKey)
    )
    .toMatchObject({ version: 1, selectedIds: ["pupil", "gaze"] })

  const participantTrigger = page
    .locator('[data-slot="combobox-trigger"]')
    .nth(1)
  await participantTrigger.click()
  await page.getByRole("option", { name: "Sujeto P02", exact: true }).click()
  await expect(
    page.locator('button[aria-controls="comparison-panel-distance"]')
  ).toHaveCount(0)

  await selectScenario(page, "Escenario alterno")
  await expect(
    page.locator('button[aria-controls="comparison-panel-distance"]')
  ).toHaveCount(0)

  await page.getByRole("link", { name: "Reportes", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Reportes", exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: "Dashboard", exact: true }).click()
  await openProjectComparison(page, "Proyecto Alfa")
  await expect(
    page.locator('button[aria-controls="comparison-panel-distance"]')
  ).toHaveCount(0)

  await page.reload()
  await openProjectComparison(page, "Proyecto Alfa")
  await expect(
    page.locator('button[aria-controls="comparison-panel-distance"]')
  ).toHaveCount(0)

  await openProjectComparison(page, "Proyecto Beta")
  await expect(
    page.locator('button[aria-controls="comparison-panel-distance"]')
  ).toBeVisible()
  expect(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      projectStorageKey("project-beta")
    )
  ).toBeNull()

  await openProjectComparison(page, "Proyecto Alfa")
  await expect(
    page.locator('button[aria-controls="comparison-panel-distance"]')
  ).toHaveCount(0)
  expect(unhandledRequests).toEqual([])
})
