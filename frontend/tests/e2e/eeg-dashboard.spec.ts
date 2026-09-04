import { expect, test } from "@playwright/test"

test("EEG views preserve channels, signal mode and independent time windows", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem("neurodatics-auth-session", JSON.stringify({
      user: { id: "eeg-ui-test", email: "eeg@test.invalid", name: "EEG Test", authSource: "google-oauth" },
      session: { accessToken: "eeg-test-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
    }))
  })
  const allChannels = ["f3", "f4", "c3", "c4"]
  const requested: string[] = []
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace(/\/$/, "")
    requested.push(path)
    const channels = (url.searchParams.get("channels")?.split(",") ?? allChannels).filter((channel) => allChannels.includes(channel))
    const common = { channels, available_channels: allChannels, sampling_rate_hz: 10 }
    const power = Object.fromEntries(channels.map((channel, index) => [channel, [index + 1, index + 3, index + 2]]))
    if (path === "/api/projects") {
      await route.fulfill({ json: [{ id: "eeg-project", name: "EEG Project", sensors: [{ id: "eeg-sensor", sensor_type: "EEG" }] }] })
    } else if (path.endsWith("/analytics/participants")) {
      await route.fulfill({ json: [{ participant_code: "P01", user_index: 1 }] })
    } else if (path.endsWith("/analytics/scenarios")) {
      await route.fulfill({ json: [] })
    } else if (path.endsWith("/analytics/timeseries/eeg")) {
      await route.fulfill({ json: { ...common, time: [0, 1, 2], raw: power, smooth: power } })
    } else if (path.endsWith("/analytics/psd/eeg")) {
      await route.fulfill({ json: { ...common, frequency: [0, 5, 10], power, use_db: true, unit: "dB" } })
    } else if (path.endsWith("/analytics/spectrogram/eeg")) {
      await route.fulfill({ json: {
        ...common, time: [0, 1, 2], frequency: [0, 5, 10], unit: "dB", use_db: true,
        normalize: "freq_demean", color_domain: { min: 0, max: 8 },
        power: Object.fromEntries(channels.map((channel) => [channel, [[1, 3, 2], [2, 4, 3], [3, 5, 4]]])),
      } })
    } else if (path.endsWith("/analytics/topography/eeg")) {
      await route.fulfill({ json: {
        ...common, time: [0, 1, 2], power, unit: "uV^2", window_s: 0.33, overlap_ratio: 0, remove_dc: true,
        color_domain: { min: 0, max: 8 }, positions: { f3: [-0.5, 0.5], f4: [0.5, 0.5], c3: [-0.5, 0], c4: [0.5, 0] },
      } })
    } else if (path.endsWith("/analytics/gaze-at")) {
      const time = Number(url.searchParams.get("time_s") ?? 0)
      await route.fulfill({ json: { requested_time_s: time, nearest_time_s: time, scenario: "Instruction", gx: null, gy: null, scenario_file_id: null, scenario_type: null, scenario_time_s: time } })
    } else {
      await route.fulfill({ status: 501, json: { detail: `Unexpected EEG test request: ${path}` } })
    }
  })

  await page.goto("/dashboard")
  await page.getByRole("button", { name: "Expandir proyecto", exact: true }).click()
  await page.getByRole("button", { name: "Electroencefalógrafo", exact: true }).click()
  await expect(page.getByText("Estadísticas EEG por canal", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "F3", exact: true })).toBeEnabled()
  await page.getByRole("button", { name: "Cruda", exact: true }).click()
  await page.getByRole("button", { name: "F3", exact: true }).click()
  await page.getByLabel("Inicio", { exact: true }).fill("0.5")
  await page.getByLabel("Fin", { exact: true }).fill("1.5")
  await page.getByRole("button", { name: "Aplicar", exact: true }).click()
  await expect(page.getByText("Ventana activa", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Densidad espectral", exact: true }).click()
  await expect(page.getByText("Densidad espectral de potencia", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue("")
  await expect(page.getByRole("button", { name: "F3", exact: true })).toHaveClass(/border-border/)
  await page.getByLabel("Inicio", { exact: true }).fill("0.25")
  await page.getByLabel("Fin", { exact: true }).fill("1.75")
  await page.getByRole("button", { name: "Aplicar", exact: true }).click()

  await page.getByRole("button", { name: "Espectrograma de frecuencias", exact: true }).click()
  await expect(page.locator("canvas")).toHaveCount(3)
  await page.locator("canvas").first().click({ position: { x: 20, y: 20 } })
  await expect.poll(() => requested.some((path) => path.endsWith("/analytics/gaze-at"))).toBe(true)

  await page.getByRole("button", { name: "Topografía EEG", exact: true }).click()
  await expect(page.getByText("Potencia por electrodo", { exact: true })).toBeVisible()
  await page.getByRole("slider").fill("1")
  await expect(page.getByText("Ventana 2 / 3", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "EEG por canal", exact: true }).click()
  await expect(page.getByRole("button", { name: "Cruda", exact: true })).toHaveClass(/bg-foreground/)
  await expect(page.getByRole("button", { name: "F3", exact: true })).toHaveClass(/border-border/)
  await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue("0.5")
  await expect(page.getByLabel("Fin", { exact: true })).toHaveValue("1.5")
  await expect(page.getByText("Ventana activa", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Densidad espectral", exact: true }).click()
  await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue("0.25")
  await expect(page.getByLabel("Fin", { exact: true })).toHaveValue("1.75")
  expect(errors).toEqual([])
})
