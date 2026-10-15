import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const project = {
  id: "manual-demo",
  name: "Estudio de atención visual — demostración",
  description: "Datos sintéticos para documentar el flujo de análisis.",
  status: "active",
  ingestion_status: "READY",
  ingestion_generation: 4,
  created_at: "2026-10-10T09:30:00Z",
  updated_at: "2026-10-13T16:20:00Z",
  participants_count: 3,
  sensors: [
    { id: "s1", sensor_type: "EyeTracker" },
    { id: "s2", sensor_type: "EEG" },
    { id: "s3", sensor_type: "GSR" },
  ],
}

const draftProject = {
  id: "manual-draft",
  name: "Piloto de cuestionario — borrador",
  description: "Proyecto de planificación sin ingesta publicada.",
  status: "draft",
  ingestion_status: "PROCESSING",
  ingestion_generation: 1,
  created_at: "2026-10-12T11:00:00Z",
  updated_at: "2026-10-13T09:15:00Z",
  participants_count: 0,
  planning_participants_count: 4,
  sensors: [],
}

const archivedProject = {
  id: "manual-archived",
  name: "Campaña de reconocimiento — archivo",
  description: "Proyecto conservado para consulta histórica.",
  status: "archived",
  ingestion_status: "READY",
  ingestion_generation: 2,
  created_at: "2026-08-03T14:20:00Z",
  updated_at: "2026-09-01T10:45:00Z",
  participants_count: 8,
  sensors: [{ id: "s4", sensor_type: "EyeTracker" }],
}

const participants = [
  { participant_code: "P-001", user_index: 1 },
  { participant_code: "P-002", user_index: 2 },
  { participant_code: "P-003", user_index: 3 },
]

const scenarios = [
  { name: "Página principal", type: "image", file_id: "stimulus-1" },
  { name: "Oferta destacada", type: "image", file_id: "stimulus-2" },
  { name: "Video de campaña", type: "video", file_id: "stimulus-3" },
]

const times = Array.from({ length: 32 }, (_, index) => Number((index * 0.5).toFixed(1)))
const pupil = times.map((time) => Number((3.45 + Math.sin(time * 0.8) * 0.18 + time * 0.006).toFixed(3)))
const gsr = times.map((time) => Number((4.2 + Math.sin(time * 0.55) * 0.35 + time * 0.018).toFixed(3)))
const gsrSmooth = gsr.map((value, index) => Number((value - 0.06 + Math.sin(index * 0.15) * 0.025).toFixed(3)))
const eegChannels = ["Fp1", "Fp2", "C3", "C4"]
const eegRaw = Object.fromEntries(eegChannels.map((channel, channelIndex) => [
  channel,
  times.map((time) => Number((Math.sin(time * (0.7 + channelIndex * 0.08)) * 7 + channelIndex * 0.8).toFixed(2))),
]))
const eegSmooth = Object.fromEntries(eegChannels.map((channel) => [
  channel,
  eegRaw[channel].map((value) => Number((value * 0.82).toFixed(2))),
]))
const eegStatistics = Object.fromEntries(eegChannels.map((channel) => [
  channel,
  { count: 320, mean: 1.8, std: 4.1, median: 1.6, min: -6.8, max: 9.4, rms: 4.5 },
]))

function comparisonChart(id: string, title: string, yLabel: string, seriesKey: string, label: string, color: string, unit: string) {
  return {
    id,
    title,
    x_label: "Tiempo (s)",
    y_label: yLabel,
    time_basis: "absolute" as const,
    x_domain: [0, 15] as [number, number],
    data: times.map((time, index) => ({
      time,
      sourceTime: time,
      [seriesKey]: id === "pupil" ? pupil[index] : id === "distance" ? 61 + Math.sin(time * 0.4) * 1.5 : 50 + Math.sin(time * 0.3) * 14,
    })),
    series: [{ key: seriesKey, label, color, unit }],
    legend: [{ label, color }],
    peaks: [],
    annotations: [],
    synchronized: true,
    height: 300,
  }
}

const comparisonCharts = {
  contract_version: "comparison-charts-v3",
  statistics_schema_version: "comparison-statistics-v1",
  charts: [
    comparisonChart("pupil", "Dilatación pupilar", "Diámetro (mm)", "pupil_avg_mm", "Pupila promedio", "#00A878", "mm"),
    comparisonChart("distance", "Distancia al dispositivo", "Distancia (cm)", "distance_cm", "Distancia", "#2563EB", "cm"),
    comparisonChart("gaze", "Gaze point", "Posición (%)", "gaze_x_pct", "Mirada horizontal", "#F59E0B", "%"),
  ],
  statistics: [],
}

async function mockPlatform(page: Page, options: { authenticated?: boolean } = {}) {
  if (options.authenticated !== false) {
    await page.addInitScript(() => {
      localStorage.setItem("neurodatics-auth-session", JSON.stringify({
        user: { id: "manual-demo-user", email: "demo@neurodatics.local", name: "Investigador de demostración", authSource: "google-oauth" },
        session: { accessToken: "manual-demo-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" },
      }))
    })
  }

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const pathname = url.pathname

    if (pathname === "/api/projects" || pathname === "/api/projects/") {
      await route.fulfill({ json: [project, draftProject, archivedProject] })
      return
    }
    if (pathname.endsWith("/analytics/participants")) {
      await route.fulfill({ json: participants })
      return
    }
    if (pathname.endsWith("/analytics/scenarios")) {
      await route.fulfill({ json: scenarios })
      return
    }
    if (pathname.endsWith("/analytics/timeseries/pupil")) {
      await route.fulfill({ json: { time: times, left: pupil.map((v) => v - 0.04), right: pupil.map((v) => v + 0.04), average: pupil, smooth_left: pupil.map((v) => v - 0.02), smooth_right: pupil.map((v) => v + 0.02) } })
      return
    }
    if (pathname.endsWith("/analytics/statistics/pupil")) {
      await route.fulfill({ json: { mean: 3.61, min: 3.18, max: 3.84, std: 0.14, median: 3.62, baseline: 3.48, raw_mean: 3.61, raw_min: 3.18, raw_max: 3.84, raw_std: 0.14, raw_median: 3.62, raw_baseline: 3.48 } })
      return
    }
    if (pathname.endsWith("/analytics/timeseries/gsr")) {
      await route.fulfill({ json: { time: times, gsr, gsr_smooth: gsrSmooth } })
      return
    }
    if (pathname.endsWith("/analytics/statistics/gsr")) {
      await route.fulfill({ json: { mean: 4.31, min: 3.78, max: 4.82, std: 0.22, median: 4.29, baseline: 4.12, raw_mean: 4.35, raw_min: 3.72, raw_max: 4.91, raw_std: 0.25, raw_median: 4.32, raw_baseline: 4.1 } })
      return
    }
    if (pathname.endsWith("/analytics/timeseries/eeg")) {
      await route.fulfill({ json: {
        time: times,
        channels: eegChannels,
        available_channels: eegChannels,
        sampling_rate_hz: 20,
        metadata: { version: "eeg-quality-v1", warnings: ["Muestras EEG ausentes: revisar el registro."], reference: "Promedio común" },
        raw: eegRaw,
        smooth: eegSmooth,
        statistics: { raw: eegStatistics, smooth: eegStatistics },
      } })
      return
    }
    if (pathname.endsWith("/analytics/comparison/charts")) {
      await route.fulfill({ json: comparisonCharts })
      return
    }
    if (pathname === "/api/integrations/google-drive/connection") {
      await route.fulfill({ json: { connected: true, account_email: "almacenamiento-demo@neurodatics.local", oauth_configured: true } })
      return
    }
    if (pathname.endsWith("/pre-experiment")) {
      await route.fulfill({ json: {
        revision: 1,
        config: {
          participants: [
            { id: "planning-1", code: "P-001", name: "Participante 001", identification_document: "", gender: "No especificado", age: 29, notes: "Primera sesión." },
            { id: "planning-2", code: "P-002", name: "Participante 002", identification_document: "", gender: "No especificado", age: 34, notes: "" },
          ],
          screen: { model: "Dell U2720Q", width_px: 3840, height_px: 2160, width_cm: 59.7, height_cm: 33.6, viewing_distance_cm: 65, notes: "Pantalla calibrada antes de la sesión." },
          notes: "Aplicar el mismo protocolo de iluminación en todas las sesiones.",
          questionnaires: {
            before: { enabled: true, title: "Cuestionario antes del experimento", questions: [{ id: "q-1", type: "multiple_choice", prompt: "¿Ha usado antes un dispositivo de seguimiento ocular?", required: true, options: [{ id: "yes", label: "Sí" }, { id: "no", label: "No" }] }] },
            after: { enabled: false, title: "Cuestionario después del experimento", questions: [] },
          },
        },
        responses: [],
      } })
      return
    }
    if (pathname.includes("/analytics/fixations/sensitivity")) {
      await route.fulfill({ json: { default_min_fixation_duration_ms: 200, available_min_fixation_durations_ms: [100, 150, 200, 250, 300], points: [] } })
      return
    }
    if (pathname === "/api/projects/manual-demo") {
      await route.fulfill({ json: { ...project, participants, scenaries: scenarios } })
      return
    }
    await route.fulfill({ json: [] })
  })
}

async function stable(page: Page) {
  await page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; } nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(700)
}

function capturePath(name: string) {
  const dir = path.resolve(process.cwd(), "..", "manual", "assets", "screenshots")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, name)
}

test.describe("capturas del manual", () => {
  test("captura las vistas principales con datos de demostración", async ({ page }) => {
    await mockPlatform(page)
    await page.setViewportSize({ width: 1440, height: 1000 })

    await page.goto("/")
    await stable(page)
    await page.screenshot({ path: capturePath("01-inicio.png"), fullPage: true })

    await page.goto("/proyectos")
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible()
    await expect(page.getByText(project.name, { exact: true })).toBeVisible()
    await stable(page)
    await page.screenshot({ path: capturePath("02-proyectos.png"), fullPage: true })

    await page.getByRole("button", { name: "Crear nuevo proyecto" }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await stable(page)
    await page.screenshot({ path: capturePath("03-crear-proyecto.png"), fullPage: true })
    await page.keyboard.press("Escape")

    await page.goto("/dashboard")
    await expect(page.getByText("Promedio ambas pupilas")).toBeVisible({ timeout: 20_000 })
    await stable(page)
    await page.screenshot({ path: capturePath("04-dashboard.png"), fullPage: true })

    await page.goto("/reportes")
    await expect(page.getByRole("heading", { name: "Reportes", exact: true })).toBeVisible()
    await page.getByRole("combobox").click()
    await page.getByText(project.name, { exact: true }).last().click()
    await expect(page.getByText("Informe PDF de Eye Tracking")).toBeVisible({ timeout: 20_000 })
    await stable(page)
    await page.screenshot({ path: capturePath("05-reportes.png"), fullPage: true })

    await page.goto("/configuracion")
    await expect(page.getByRole("heading", { name: "Configuración", exact: true })).toBeVisible()
    await expect(page.getByText("Conexión guardada")).toBeVisible({ timeout: 20_000 })
    await stable(page)
    await page.screenshot({ path: capturePath("06-configuracion.png"), fullPage: true })
  })

  test("captura autenticación, estados, sensores y flujos ampliados", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })

    await mockPlatform(page, { authenticated: false })
    await page.goto("/login")
    await expect(page.getByRole("button", { name: "Continuar con Google", exact: true })).toBeVisible()
    await stable(page)
    await page.screenshot({ path: capturePath("07-login.png"), fullPage: true })

    await mockPlatform(page)
    await page.goto("/proyectos")
    await expect(page.getByText(draftProject.name, { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Archivados", exact: true }).click()
    await expect(page.getByText(archivedProject.name, { exact: true })).toBeVisible()
    await stable(page)
    await page.screenshot({ path: capturePath("08-proyectos-archivados.png"), fullPage: true })

    await page.goto("/dashboard")
    await expect(page.getByRole("button", { name: "Electroencefalógrafo", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Electroencefalógrafo", exact: true }).click()
    await expect(page.getByText("Estadísticas EEG por canal", { exact: true })).toBeVisible({ timeout: 20_000 })
    await stable(page)
    await page.screenshot({ path: capturePath("09-dashboard-eeg.png"), fullPage: true })

    await page.getByRole("button", { name: "Sensor Galvánico", exact: true }).click()
    await expect(page.getByText("Respuesta galvánica", { exact: true })).toBeVisible({ timeout: 20_000 })
    await stable(page)
    await page.screenshot({ path: capturePath("10-dashboard-gsr.png"), fullPage: true })

    await page.getByRole("button", { name: "Comparativas", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Comparativas", exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("heading", { name: "Dilatación pupilar", exact: true })).toBeVisible({ timeout: 20_000 })
    await stable(page)
    await page.screenshot({ path: capturePath("11-dashboard-comparativas.png"), fullPage: true })

    await page.goto("/configuracion?proyecto=manual-demo")
    await page.getByRole("button", { name: /Pantalla y datos relevantes/ }).click()
    await expect(page.locator('input[value="Dell U2720Q"]')).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: /Pantalla y datos relevantes/ }).scrollIntoViewIfNeeded()
    await stable(page)
    await page.screenshot({ path: capturePath("12-pre-experimento.png"), fullPage: false })

    await page.goto("/reportes")
    await expect(page.getByRole("heading", { name: "Reportes", exact: true })).toBeVisible()
    await page.getByRole("combobox").click()
    await page.getByText(project.name, { exact: true }).last().click()
    await expect(page.getByText("Todos los dispositivos", { exact: true })).toBeVisible({ timeout: 20_000 })
    await page.getByText("Resumen de todos los participantes", { exact: true }).click()
    await page.getByText("Todos los dispositivos", { exact: true }).click()
    await expect(page.getByText("Descargar reportes (ZIP)", { exact: true })).toBeVisible({ timeout: 20_000 })
    await stable(page)
    await page.screenshot({ path: capturePath("13-reportes-grupo.png"), fullPage: true })
  })
})
