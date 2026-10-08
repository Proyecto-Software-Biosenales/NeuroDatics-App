import { expect, test } from "@playwright/test"

const views = [
  { endpoint: "timeseries", label: "EEG por canal", extra: "f3", empty: "No hay datos de EEG para los filtros seleccionados." },
  { endpoint: "psd", label: "Densidad espectral", extra: "le", empty: "No hay datos suficientes para calcular la PSD." },
  { endpoint: "spectrogram", label: "Espectrograma de frecuencias", extra: "p4", empty: "No hay datos suficientes para calcular el espectrograma." },
  { endpoint: "topography", label: "Topografía EEG", extra: "p3", empty: "No hay datos suficientes para calcular la topografía EEG." },
]

for (const view of views) {
  test(`${view.endpoint} requests only its active endpoint on channel, participant and scenario changes`, async ({ page }) => {
    const errors: string[] = []
    const requests: URL[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem("neurodatics-auth-session", JSON.stringify({
      user: { id: "active-eeg", email: "active@test.invalid", name: "Active EEG", authSource: "google-oauth" },
      session: { accessToken: "synthetic", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
    })))
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname.replace(/\/$/, "")
      if (path === "/api/projects") return route.fulfill({ json: [{ id: "active", name: "Active EEG", sensors: [{ sensor_type: "EEG" }] }] })
      if (path === "/api/projects/active") return route.fulfill({ json: { id: "active" } })
      if (path.endsWith("/participants")) return route.fulfill({ json: [{ participant_code: "P01", user_index: 1 }, { participant_code: "P02", user_index: 2 }] })
      if (path.endsWith("/scenarios")) return route.fulfill({ json: ["Scene", "Empty", "Failure"].map((name) => ({ name, type: "image", file_id: null })) })
      if (path.endsWith("/gaze-at")) return route.fulfill({ json: { requested_time_s: 0, nearest_time_s: 0, scenario: "Instruction", gx: null, gy: null, scenario_file_id: null, scenario_type: null, scenario_time_s: 0 } })
      if (path.endsWith("/aois")) return route.fulfill({ json: { scenario: url.searchParams.get("scenario"), aois: [], transitions: [], total_fixations: 0, total_dwell_time_ms: 0, observed_aoi_dwell_time_ms: 0, observed_aoi_dwell_time_percent: 0 } })
      if (!path.endsWith("/eeg")) throw new Error(`Unexpected request: ${path}`)
      requests.push(url)
      if (url.searchParams.get("scenario") === "Failure") return route.fulfill({ status: 500, json: { detail: "Synthetic EEG failure" } })
      const endpoint = path.split("/").at(-2)!
      const extra = views.find((item) => item.endpoint === endpoint)!.extra
      const available = [...new Set(["f3", "f4", "c3", "c4", extra])]
      const channels = (url.searchParams.get("channels")?.split(",") ?? available).filter((channel) => available.includes(channel))
      const time = url.searchParams.get("scenario") === "Empty" ? [] : [0, 1, 2]
      const power = Object.fromEntries(channels.map((channel) => [channel, time.map((t) => t + 1)]))
      const common = { channels, available_channels: available, sampling_rate_hz: 10, metadata: { hop_s: 1, warnings: [] } }
      const body = endpoint === "timeseries" ? { ...common, time, raw: power, smooth: power }
        : endpoint === "psd" ? { ...common, frequency: time, power, use_db: true, unit: "dB" }
        : endpoint === "spectrogram" ? { ...common, time, frequency: time, power: Object.fromEntries(channels.map((channel) => [channel, time.map(() => time)])), normalize: "none", use_db: true, unit: "dB", color_domain: { min: 0, max: 4 } }
        : { ...common, time, power, unit: "uV^2", window_s: 2, overlap_ratio: 0.5, remove_dc: true, color_domain: { min: 0, max: 4 }, positions: { f3: [-0.5, 0.5], f4: [0.5, 0.5], c3: [-0.5, 0], c4: [0.5, 0], p3: [-0.5, -0.5] } }
      return route.fulfill({ json: body })
    })
    await page.goto("/dashboard")
    await expect(page.getByText("Estadísticas EEG por canal", { exact: true })).toBeVisible()
    await page.waitForLoadState("networkidle")
    expect(requests.map((url) => url.pathname)).toEqual(["/api/projects/active/analytics/timeseries/eeg"])
    requests.length = 0
    if (view.endpoint !== "timeseries") await page.getByRole("tab", { name: view.label, exact: true }).click()
    await page.waitForLoadState("networkidle")
    const chips = page.getByLabel("Canales EEG")
    const extra = chips.getByRole("button", { name: view.extra.toUpperCase(), exact: true })
    await expect(extra).toBeEnabled()
    // The active response controls availability, even without any temporal response.
    if (view.endpoint !== "spectrogram") await expect(chips.getByRole("button", { name: "P4", exact: true })).toBeDisabled()
    requests.length = 0
    await chips.getByRole("button", { name: "F3", exact: true }).click()
    await page.waitForLoadState("networkidle")
    expect(requests.map((url) => url.pathname)).toEqual([`/api/projects/active/analytics/${view.endpoint}/eeg`])
    expect(requests[0].searchParams.get("channels")?.split(",")).not.toContain("f3")
    // Filtered series must not disable the chip required to recover a channel.
    await expect(chips.getByRole("button", { name: "F3", exact: true })).toBeEnabled()
    await expect(chips.getByRole("button", { name: "F3", exact: true })).toHaveAttribute("aria-pressed", "false")
    requests.length = 0
    await page.getByRole("combobox").nth(1).click()
    await page.getByRole("option", { name: "Participante P02", exact: true }).click()
    await page.waitForLoadState("networkidle")
    expect(requests.map((url) => url.pathname)).toEqual([`/api/projects/active/analytics/${view.endpoint}/eeg`])
    expect(requests[0].searchParams.get("participant_code")).toBe("P02")
    for (const scenario of ["Scene", "Empty", "Failure", "all"]) {
      requests.length = 0
      await page.getByRole("combobox").first().click()
      await page.getByRole("option", { name: scenario === "all" ? "Todos los escenarios" : scenario, exact: true }).click()
      await page.waitForLoadState("networkidle")
      expect(requests.map((url) => url.pathname)).toEqual([`/api/projects/active/analytics/${view.endpoint}/eeg`])
      expect(requests[0].searchParams.get("scenario")).toBe(scenario)
      if (scenario === "Empty") await expect(page.getByText(view.empty, { exact: true })).toBeVisible()
      if (scenario === "Failure") await expect(page.getByText(view.endpoint === "timeseries" ? "No se pudo cargar la senal EEG." : view.endpoint === "psd" ? "No se pudo cargar la PSD de EEG." : view.endpoint === "spectrogram" ? "No se pudo cargar el espectrograma de EEG." : "No se pudo cargar la topografía EEG.", { exact: true }).first()).toBeVisible()
    }
    await expect(extra).toBeEnabled()
    expect(errors).toEqual([])
  })
}

