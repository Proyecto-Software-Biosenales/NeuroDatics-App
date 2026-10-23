import { expect, test, type Locator, type Page } from "@playwright/test"

/**
 * «Ajustar» on every line chart whose vertical axis starts at zero: GSR,
 * distance, gaze and the EEG power spectrum (the pupil has its own test in
 * participant-comparison.spec.ts). The API is simulated.
 */

const EEG_CHANNELS = ["f3", "f4"]
const frequency = Array.from({ length: 40 }, (_, k) => k + 1)

async function mockApi(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem("neurodatics-auth-session", JSON.stringify({
      user: { id: "fit-axis-test", email: "fit@test.invalid", name: "Fit Test", authSource: "google-oauth" },
      session: { accessToken: "fit-axis-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
    }))
  })
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/\/$/, "")
    const time = [0, 1, 2, 3]
    if (path === "/api/projects") {
      await route.fulfill({ json: [{ id: "fit-project", name: "Fit Project", sensors: [
        { sensor_type: "EyeTracker" }, { sensor_type: "GSR" }, { sensor_type: "EEG" },
      ] }] })
    } else if (path.endsWith("/analytics/participants")) {
      await route.fulfill({ json: [{ participant_code: "P01", name: null, document: "P01" }] })
    } else if (path.endsWith("/analytics/timeseries/gsr")) {
      await route.fulfill({ json: { time, gsr: [3.2, 3.5, 3.9, 3.4], gsr_smooth: [3.3, 3.5, 3.7, 3.5] } })
    } else if (path.endsWith("/analytics/timeseries/distance")) {
      await route.fulfill({ json: { time, distance_cm: [58.4, 61, 64.9, 60] } })
    } else if (path.endsWith("/analytics/timeseries/gaze")) {
      await route.fulfill({ json: { time, gx_clean: [40, 44, 50, 46], gy_clean: [52, 60, 55, 50], warnings: [] } })
    } else if (path.endsWith("/analytics/timeseries/pupil")) {
      await route.fulfill({ json: { time: [], left: [], right: [], smooth_left: [], smooth_right: [] } })
    } else if (path.endsWith("/analytics/timeseries/eeg")) {
      const trace = Object.fromEntries(EEG_CHANNELS.map((channel) => [channel, time.map((t) => Math.sin(t) * 20)]))
      await route.fulfill({ json: {
        time, channels: EEG_CHANNELS, available_channels: EEG_CHANNELS, sampling_rate_hz: 250,
        metadata: { version: "eeg-v2", warnings: [] }, raw: trace, smooth: trace,
      } })
    } else if (path.endsWith("/analytics/psd/eeg")) {
      await route.fulfill({ json: {
        frequency, channels: EEG_CHANNELS, available_channels: EEG_CHANNELS, sampling_rate_hz: 250, use_db: true, unit: "dB",
        power: Object.fromEntries(EEG_CHANNELS.map((channel, c) => [channel, frequency.map((f) => 10 + 3.5 * Math.cos(f / 3 + c))])),
        metadata: { version: "eeg-v2", warnings: [] },
      } })
    } else if (path.includes("/analytics/statistics/")) {
      await route.fulfill({ json: {
        mean: 3.5, min: 3.3, max: 3.7, median: 3.5, std: 0.1, baseline: 3.4,
        gx_mean: 45, gx_min: 40, gx_max: 50, gx_std: 3, gx_median: 45, gx_baseline: 44,
        gy_mean: 54, gy_min: 50, gy_max: 60, gy_std: 3, gy_median: 54, gy_baseline: 53, warnings: [],
      } })
    } else if (path.endsWith("/analytics/aois")) {
      await route.fulfill({ json: { aois: [] } })
    } else if (path === "/api/settings/screen") {
      await route.fulfill({ json: { screen: { width_px: 1280, height_px: 1024, width_cm: null, height_cm: null }, confirmed: true } })
    } else {
      await route.fulfill({ json: [] })
    }
  })
}

const chartCard = (page: Page, heading: string) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
const yTicks = (card: Locator) => () =>
  card.locator(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value").allTextContents()

async function checkFit(page: Page, heading: string, fitted: string[], shot: string) {
  const card = chartCard(page, heading)
  await expect(card.locator(".analytics-chart-plot-frame")).toBeVisible()
  // The default scale reaches down to zero.
  await expect.poll(async () => (await yTicks(card)())[0]).toBe("0")
  const fit = card.getByRole("button", { name: "Ajustar", exact: true })
  await expect(fit).toHaveAttribute("aria-pressed", "false")
  await fit.click()
  await expect(fit).toHaveAttribute("aria-pressed", "true")
  await expect.poll(yTicks(card)).toEqual(fitted)
  // The toggle is as tall as the window control beside it.
  const heights = await Promise.all([
    card.getByRole("group", { name: "Ajustar" }),
    card.getByRole("button", { name: /^Ventana temporal/ }),
  ].map(async (control) => (await control.boundingBox())!.height))
  expect(new Set(heights).size).toBe(1)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(1600)
  await page.screenshot({ path: `../output/ajustar/${shot}.png` })
  await fit.click()
  await expect.poll(async () => (await yTicks(card)())[0]).toBe("0")
}

for (const [width, height] of [[1536, 730], [390, 844]]) {
  test(`Ajustar fits the vertical axis of GSR, distance, gaze and PSD at ${width}px`, async ({ page }) => {
    const errors: string[] = []
    await page.setViewportSize({ width, height })
    await mockApi(page, errors)
    await page.goto("/dashboard")
    const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

    await page.getByRole("tab", { name: "Distancia al dispositivo", exact: true }).click()
    await checkFit(page, "Distancia al dispositivo", ["60", "62", "64"], `distance-${width}`)
    expect(await noHorizontalScroll()).toBe(true)

    await page.getByRole("tab", { name: "Punto de mirada", exact: true }).click()
    // Both axes set the scale, as both pupils do.
    await checkFit(page, "Punto de mirada", ["40", "45", "50", "55", "60"], `gaze-${width}`)
    expect(await noHorizontalScroll()).toBe(true)

    await page.getByRole("button", { name: "Sensor galvánico" }).first().click()
    await checkFit(page, "Respuesta galvánica", ["3.2", "3.4", "3.6", "3.8"], `gsr-${width}`)
    expect(await noHorizontalScroll()).toBe(true)

    await page.getByRole("button", { name: "Electroencefalógrafo" }).first().click()
    await page.getByRole("tab", { name: "Densidad espectral", exact: true }).click()
    await checkFit(page, "Densidad espectral de potencia", ["8", "10", "12"], `psd-${width}`)
    expect(await noHorizontalScroll()).toBe(true)

    expect(errors).toEqual([])
  })
}
