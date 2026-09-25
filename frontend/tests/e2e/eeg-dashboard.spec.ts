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
    const common = { channels, available_channels: allChannels, sampling_rate_hz: 10, metadata: { version: "eeg-v2", warnings: ["Muestras EEG ausentes: revisar el registro."], hop_s: 1 } }
    const power = Object.fromEntries(channels.map((channel, index) => [channel, [index + 1, index + 3, index + 2]]))
    if (path === "/api/projects") {
      await route.fulfill({ json: [{ id: "eeg-project", name: "EEG Project", sensors: [{ id: "eeg-sensor", sensor_type: "EEG" }] }] })
    } else if (path.endsWith("/analytics/participants")) {
      await route.fulfill({ json: [{ participant_code: "P01", user_index: 1 }] })
    } else if (path.endsWith("/analytics/scenarios")) {
      await route.fulfill({ json: [] })
    } else if (path.endsWith("/analytics/timeseries/eeg")) {
      await route.fulfill({ json: { ...common, time: [0, 1, 2], raw: power, smooth: power, statistics: { raw: Object.fromEntries(channels.map((c) => [c, {count:1200,mean:2,std:1,median:2,min:1,max:3,rms:2.2}])), smooth: {} } } })
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
  await expect(page.getByRole("button", { name: "Contraer proyecto", exact: true })).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("button", { name: "Electroencefalógrafo", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Estadísticas EEG por canal", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Canales EEG").getByRole("button", { name: "F3", exact: true })).toBeEnabled()
  await expect(page.getByRole("button", { name: "Cruda", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Muestras EEG ausentes: revisar el registro.", {exact:true})).toBeVisible()
  await expect(page.getByRole("cell", {name:"1200",exact:true}).first()).toBeVisible()
  await expect(page.getByRole("columnheader", {name:"Base",exact:true})).toHaveCount(0)
  // Quality warnings close the page instead of pushing the charts down.
  expect(await page.getByRole("status").filter({ hasText: "Calidad y alcance de EEG" }).evaluate((element) =>
    Boolean(element.parentElement?.lastElementChild === element)
  )).toBe(true)
  // A chip beside the chart counts them and jumps there; ordinary data is not
  // reported as a clipped axis.
  await expect(page.getByRole("button", { name: /Eje recortado/ })).toHaveCount(0)
  await page.getByRole("button", { name: "1 aviso de calidad", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Calidad y alcance de EEG" })).toBeInViewport()
  await expect(page.getByRole("status").filter({ hasText: "Calidad y alcance de EEG" })).toBeFocused()
  await page.getByLabel("Canales EEG").getByRole("button", { name: "F3", exact: true }).click()
  const timeWindow = page.getByRole("button", { name: /^Ventana temporal:/ })
  await timeWindow.click()
  await page.getByLabel("Inicio", { exact: true }).fill("0.5")
  await page.getByLabel("Fin", { exact: true }).fill("1.5")
  await page.getByRole("button", { name: "Aplicar", exact: true }).click()
  await expect(page.getByText("Ventana activa", { exact: true })).toBeVisible()

  await page.getByRole("tab", { name: "Densidad espectral", exact: true }).click()
  await expect(page.getByText("Densidad espectral de potencia", { exact: true })).toBeVisible()
  await timeWindow.click()
  await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue("")
  await expect(page.getByLabel("Canales EEG").getByRole("button", { name: "F3", exact: true })).toHaveAttribute("aria-pressed", "false")
  await page.getByLabel("Inicio", { exact: true }).fill("0.25")
  await page.getByLabel("Fin", { exact: true }).fill("1.75")
  await page.getByRole("button", { name: "Aplicar", exact: true }).click()

  await page.getByRole("tab", { name: "Espectrograma de frecuencias", exact: true }).click()
  await expect(page.locator("canvas")).toHaveCount(3)
  await page.locator("canvas").first().click({ position: { x: 20, y: 20 } })
  await expect.poll(() => requested.some((path) => path.endsWith("/analytics/gaze-at"))).toBe(true)
  // Dragging past the left edge zooms every channel to the first two windows.
  const gazeRequests = () => requested.filter((path) => path.endsWith("/analytics/gaze-at")).length
  const gazeBeforeDrag = gazeRequests()
  const canvasBox = (await page.locator("canvas").first().boundingBox())!
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.6, canvasBox.y + 40)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.3, canvasBox.y + 40, { steps: 5 })
  await page.mouse.move(canvasBox.x - 20, canvasBox.y + 40, { steps: 5 })
  await page.mouse.up()
  const zoomReset = page.getByRole("button", { name: "Volver a la vista completa", exact: true })
  await expect(zoomReset).toHaveCount(3)
  await expect(page.getByText("1.0s", { exact: true })).toHaveCount(3)
  expect(gazeRequests()).toBe(gazeBeforeDrag)
  await zoomReset.first().click()
  await expect(zoomReset).toHaveCount(0)
  await expect(page.getByText("2.0s", { exact: true })).toHaveCount(3)

  await page.getByRole("tab", { name: "Topografía EEG", exact: true }).click()
  await expect(page.getByText("Potencia por electrodo", { exact: true })).toBeVisible()
  await page.getByRole("slider", { name: "Ventana temporal de topografía" }).focus()
  await page.keyboard.press("Home")
  await page.keyboard.press("ArrowRight")
  await expect(page.getByText("Ventana 2 / 3", { exact: true })).toBeVisible()

  await page.getByRole("tab", { name: "EEG por canal", exact: true }).click()
  await expect(page.getByRole("button", { name: "Cruda", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByLabel("Canales EEG").getByRole("button", { name: "F3", exact: true })).toHaveAttribute("aria-pressed", "false")
  await expect(page.getByText("Ventana activa", { exact: true })).toBeVisible()
  await timeWindow.click()
  await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue("0.5")
  await expect(page.getByLabel("Fin", { exact: true })).toHaveValue("1.5")
  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "Densidad espectral", exact: true }).click()
  await timeWindow.click()
  await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue("0.25")
  await expect(page.getByLabel("Fin", { exact: true })).toHaveValue("1.75")
  expect(errors).toEqual([])
})
