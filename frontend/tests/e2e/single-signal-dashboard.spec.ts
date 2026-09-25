import { expect, test } from "@playwright/test"

for (const signal of ["gsr", "distance"] as const) {
  test(`${signal} preserves windows, extrema, chart selection and empty states`, async ({ page }) => {
    const errors: string[] = []
    const requests: URL[] = []
    let releaseEmpty!: () => void
    const emptyResponse = new Promise<void>(resolve => { releaseEmpty = resolve })
    page.on("pageerror", error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem("neurodatics-auth-session", JSON.stringify({
        user: { id: "signal-test", email: "signal@test.invalid", name: "Signal Test", authSource: "google-oauth" },
        session: { accessToken: "signal-test-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
      }))
    })
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url())
      const path = url.pathname.replace(/\/$/, "")
      requests.push(url)
      if (path === "/api/projects") {
        await route.fulfill({ json: [{ id: "signal-project", name: "Signal Project", sensors: [{ sensor_type: signal === "gsr" ? "GSR" : "EyeTracker" }] }] })
      } else if (path.endsWith("/analytics/participants")) {
        await route.fulfill({ json: [{ participant_code: "P01" }, { participant_code: "P02" }] })
      } else if (path.endsWith("/analytics/scenarios")) {
        await route.fulfill({ json: [] })
      } else if (path.includes("/analytics/timeseries/")) {
        if (url.searchParams.get("participant_code") === "P02") await emptyResponse
        const time = url.searchParams.get("participant_code") === "P02" ? [] : [0, 1, 2, 3].filter(value =>
          (!url.searchParams.has("start_time_s") || value >= Number(url.searchParams.get("start_time_s"))) &&
          (!url.searchParams.has("end_time_s") || value <= Number(url.searchParams.get("end_time_s")))
        )
        await route.fulfill({ json: {
          time, gsr: time.map(t => [30, 90, 20, 10][t]), gsr_smooth: time.map(t => [3, 1, 6, 1][t]),
          distance_cm: time.map(t => [60, 40, 80, 40][t]),
          left: time.map(() => 3), right: time.map(() => 4), smooth_left: time.map(() => 3), smooth_right: time.map(() => 4),
        } })
      } else if (path.includes("/analytics/statistics/")) {
        await route.fulfill({ json: {
          mean: signal === "gsr" ? 2.75 : 55, min: signal === "gsr" ? 1 : 40, max: signal === "gsr" ? 6 : 80,
          median: 3, std: 2, baseline: 2, raw_mean: 37.5, raw_min: 10, raw_max: 90,
        } })
      } else if (path.endsWith("/analytics/gaze-at")) {
        const time = Number(url.searchParams.get("t_s"))
        await route.fulfill({ json: { requested_time_s: time, nearest_time_s: time, scenario: "Instruction", gx: 20, gy: 30, scenario_file_id: null } })
      } else if (path.endsWith("/analytics/aois")) {
        await route.fulfill({ json: { aois: [] } })
      } else {
        errors.push(`Unexpected request: ${path}`)
        await route.fulfill({ status: 501, json: {} })
      }
    })
    const signalRequests = () => requests.filter(url => url.pathname.endsWith(`/timeseries/${signal}`) || url.pathname.endsWith(`/statistics/${signal}`))
    const gazeRequests = () => requests.filter(url => url.pathname.endsWith("/gaze-at"))
    await page.goto("/dashboard")
    if (signal === "distance") await page.getByRole("tab", { name: "Distancia dispositivo", exact: true }).click()
    await expect(page.getByRole("heading", { name: signal === "gsr" ? "Respuesta galvánica" : "Distancia dispositivo", exact: true })).toBeVisible()
    const minimum = page.getByRole("button", { name: /^Mínimo:/ })
    const maximum = page.getByRole("button", { name: /^Máximo:/ })
    await expect(minimum).toBeEnabled()
    await expect(page.locator(".analytics-chart-plot-frame")).toBeVisible()
    // Next development StrictMode replays mount effects. Compare subsequent
    // interactions against the completed initial requests, including that replay.
    const initialRequestCount = signalRequests().length
    expect(initialRequestCount).toBeGreaterThanOrEqual(2)
    const timeTicks = await page.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value").allTextContents()
    const statistics = page.getByRole("row").filter({ has: page.getByRole("cell", { name: signal === "gsr" ? "GSR" : "Distancia", exact: true }) }).getByRole("cell")
    await expect(statistics.nth(1)).toHaveText("4")
    await expect(statistics.nth(2)).toHaveText(`2.0000 ${signal === "gsr" ? "µS" : "cm"}`)
    await expect(statistics.nth(7)).toHaveText(signal === "gsr" ? "+200.0%" : "+3900.0%")

    // Tied minima retain the first sample; GSR extrema always use the smooth signal.
    if (signal === "gsr") {
      await page.getByRole("button", { name: "Cruda", exact: true }).click()
      await expect(page.getByLabel("Leyenda de la grafica")).toHaveText("GSR cruda")
    }
    await minimum.click()
    await expect(minimum).toHaveAttribute("aria-pressed", "true")
    await expect.poll(() => gazeRequests().at(-1)?.searchParams.get("t_s")).toBe("1")
    await expect(page.getByRole("button", { name: "Limpiar selección", exact: true })).toBeVisible()
    await minimum.click()
    await expect(minimum).toHaveAttribute("aria-pressed", "false")
    expect(gazeRequests()).toHaveLength(1)
    // Distance retains its last gaze snapshot when only the KPI marker is toggled off.
    if (signal === "distance") await expect(page.getByRole("button", { name: "Limpiar selección", exact: true })).toBeVisible()
    await maximum.click()
    await expect.poll(() => gazeRequests().at(-1)?.searchParams.get("t_s")).toBe("2")
    await page.getByRole("button", { name: "Limpiar selección", exact: true }).click()
    await expect(maximum).toHaveAttribute("aria-pressed", "false")
    await expect(page.getByRole("button", { name: "Limpiar selección", exact: true })).toHaveCount(0)
    const plot = page.locator(".recharts-wrapper")
    await plot.hover({ position: { x: 200, y: 120 } })
    await expect(page.locator(".recharts-tooltip-wrapper")).toContainText(signal === "gsr" ? "GSR cruda" : "Distancia ojo-pantalla")
    await plot.click({ position: { x: 200, y: 120 } })
    await expect.poll(() => gazeRequests().length).toBe(3)
    await expect(page.getByRole("button", { name: "Limpiar selección", exact: true })).toBeVisible()
    expect(await page.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value").allTextContents()).toEqual(timeTicks)
    expect(signalRequests()).toHaveLength(initialRequestCount)

    // The window inputs live in a dropdown that only opens on demand.
    const timeWindow = page.getByRole("button", { name: /^Ventana temporal:/ })
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveCount(0)
    await timeWindow.click()
    await page.getByLabel("Inicio", { exact: true }).fill("2")
    await page.getByLabel("Fin", { exact: true }).fill("1")
    await page.getByRole("button", { name: "Aplicar", exact: true }).click()
    await expect(page.getByText("El segundo final debe ser mayor que el segundo inicial.")).toBeVisible()
    expect(signalRequests()).toHaveLength(initialRequestCount)
    await page.getByLabel("Inicio", { exact: true }).fill("0.5")
    await page.getByLabel("Fin", { exact: true }).fill("2.5")
    await page.getByRole("button", { name: "Aplicar", exact: true }).click()
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveCount(0)
    await expect.poll(() => signalRequests().length).toBe(initialRequestCount + 2)
    for (const url of signalRequests().slice(-2)) {
      expect(url.searchParams.get("start_time_s")).toBe("0.5")
      expect(url.searchParams.get("end_time_s")).toBe("2.5")
    }
    await expect(page.getByText("Ventana activa", { exact: true })).toBeVisible()
    await expect(statistics.nth(1)).toHaveText("2")
    await expect(page.getByRole("button", { name: "Limpiar selección", exact: true })).toHaveCount(0)
    if (signal === "gsr") await expect(page.getByRole("button", { name: "Cruda", exact: true })).toHaveAttribute("aria-pressed", "true")
    await maximum.click()
    await expect(page.getByRole("button", { name: "Limpiar selección", exact: true })).toBeVisible()
    await timeWindow.click()
    await page.getByRole("button", { name: "Restablecer", exact: true }).click()
    await expect.poll(() => signalRequests().length).toBe(initialRequestCount + 4)
    await timeWindow.click()
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue("")
    await expect(page.getByLabel("Fin", { exact: true })).toHaveValue("")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("button", { name: "Limpiar selección", exact: true })).toHaveCount(0)
    for (const url of signalRequests().slice(-2)) {
      expect(url.searchParams.has("start_time_s")).toBe(false)
      expect(url.searchParams.has("end_time_s")).toBe(false)
    }

    // Dragging across the plot applies that range as the window; the X restores the full view.
    const gazeBeforeDrag = gazeRequests().length
    const box = (await plot.boundingBox())!
    const dragY = box.y + 120
    await page.mouse.move(box.x + box.width * 0.3, dragY)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, dragY, { steps: 6 })
    await page.mouse.move(box.x + box.width * 0.9, dragY, { steps: 6 })
    await expect(page.locator(".analytics-chart-zoom-band")).toBeVisible()
    await page.mouse.up()
    await expect(page.locator(".analytics-chart-zoom-band")).toHaveCount(0)
    await expect.poll(() => signalRequests().length).toBe(initialRequestCount + 6)
    for (const url of signalRequests().slice(-2)) {
      const start = Number(url.searchParams.get("start_time_s"))
      const end = Number(url.searchParams.get("end_time_s"))
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeGreaterThan(start)
    }
    // The release that ends a drag is not a point selection.
    expect(gazeRequests()).toHaveLength(gazeBeforeDrag)
    await expect(page.getByText("Ventana activa", { exact: true })).toBeVisible()
    await timeWindow.click()
    await expect(page.getByLabel("Fin", { exact: true })).not.toHaveValue("")
    await page.keyboard.press("Escape")

    // One zoom offers only the X; zooming inside it adds the arrow back to that first zoom.
    const zoomBack = page.getByRole("button", { name: "Volver al zoom anterior", exact: true })
    await expect(zoomBack).toHaveCount(0)
    const firstZoom = signalRequests().at(-1)!
    const firstStart = firstZoom.searchParams.get("start_time_s")
    const firstEnd = firstZoom.searchParams.get("end_time_s")
    const zoomedBox = (await plot.boundingBox())!
    await page.mouse.move(zoomedBox.x + zoomedBox.width * 0.55, dragY)
    await page.mouse.down()
    await page.mouse.move(zoomedBox.x + zoomedBox.width * 0.75, dragY, { steps: 6 })
    await page.mouse.move(zoomedBox.x + zoomedBox.width * 0.97, dragY, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => signalRequests().length).toBe(initialRequestCount + 8)
    const secondZoom = signalRequests().at(-1)!
    expect(Number(secondZoom.searchParams.get("start_time_s"))).toBeGreaterThanOrEqual(Number(firstStart))
    expect(Number(secondZoom.searchParams.get("end_time_s"))).toBeLessThanOrEqual(Number(firstEnd))
    expect([secondZoom.searchParams.get("start_time_s"), secondZoom.searchParams.get("end_time_s")]).not.toEqual([firstStart, firstEnd])
    await expect(zoomBack).toBeVisible()
    await expect(page.getByRole("button", { name: "Volver a la vista completa", exact: true })).toBeVisible()
    await zoomBack.click()
    await expect.poll(() => signalRequests().length).toBe(initialRequestCount + 10)
    for (const url of signalRequests().slice(-2)) {
      expect(url.searchParams.get("start_time_s")).toBe(firstStart)
      expect(url.searchParams.get("end_time_s")).toBe(firstEnd)
    }
    await expect(zoomBack).toHaveCount(0)
    await timeWindow.click()
    await expect(page.getByLabel("Inicio", { exact: true })).toHaveValue(firstStart!)
    await expect(page.getByLabel("Fin", { exact: true })).toHaveValue(firstEnd!)
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "Volver a la vista completa", exact: true }).click()
    await expect.poll(() => signalRequests().length).toBe(initialRequestCount + 12)
    for (const url of signalRequests().slice(-2)) {
      expect(url.searchParams.has("start_time_s")).toBe(false)
      expect(url.searchParams.has("end_time_s")).toBe(false)
    }
    await expect(page.getByRole("button", { name: "Volver a la vista completa", exact: true })).toHaveCount(0)
    await expect(page.getByText("Todo el experimento", { exact: true })).toBeVisible()
    // Switching participant remounts the tab and handles an empty response without a plot.
    await page.getByRole("combobox").filter({ hasText: "P01" }).click()
    await page.getByRole("option", { name: "Sujeto P02", exact: true }).click()
    await timeWindow.click()
    await expect(page.getByRole("button", { name: "Aplicar", exact: true })).toBeDisabled()
    await page.keyboard.press("Escape")
    await expect(page.locator('.analytics-state-frame[data-slot="skeleton"]')).toBeVisible()
    releaseEmpty()
    await expect(page.getByText(signal === "gsr" ? "No hay datos de GSR para los filtros seleccionados." : "No hay datos de distancia para los filtros seleccionados.")).toBeVisible()
    await expect(page.locator(".analytics-chart-plot-frame")).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^Mínimo:/ })).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
