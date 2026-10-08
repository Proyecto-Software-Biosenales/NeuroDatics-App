/** Production-browser fixture, API mocked; no external services or personal data. */
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import zlib from "node:zlib"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..")
const require = createRequire(path.join(root, "frontend/package.json"))
const { chromium, expect } = require("@playwright/test")
const baseURL = process.env.G00_BASE_URL ?? "http://127.0.0.1:3332"
const repeats = Number(process.env.G00_REPEATS ?? 5)
const fixtureDelay = Number(process.env.G00_API_DELAY_MS ?? 20)
const channels = ["f3", "f4", "c3", "c4", "p3", "p4", "oz"]
const time = Array.from({ length: 128 }, (_, i) => i / 2)
const power = Object.fromEntries(channels.map((c, index) => [c, time.map((_, i) => 2 + Math.sin(i / 5 + index))]))
const common = { channels, available_channels: channels, sampling_rate_hz: 100, metadata: { version: "eeg-v2", warnings: [], hop_s: 0.5 } }
const stats = Object.fromEntries(channels.map(c => [c, { count: 6400, mean: 2, std: 1, median: 2, min: 1, max: 3, rms: 2.2 }]))
const responses = {
  "/timeseries/eeg": { ...common, time, raw: power, smooth: power, statistics: { raw: stats, smooth: stats } },
  "/psd/eeg": { ...common, frequency: time, power, use_db: true, unit: "dB" },
  "/spectrogram/eeg": { ...common, time, frequency: Array.from({ length: 16 }, (_, i) => i), unit: "dB", use_db: true, normalize: "freq_demean", color_domain: { min: 0, max: 8 }, power: Object.fromEntries(channels.map(c => [c, Array.from({ length: 16 }, (_, j) => time.map((_, i) => 2 + Math.sin(i / 7 + j)))])) },
  "/topography/eeg": { ...common, time, power, unit: "uV^2", window_s: 0.5, overlap_ratio: 0, remove_dc: true, color_domain: { min: 0, max: 8 }, positions: { f3: [-0.5, 0.5], f4: [0.5, 0.5], c3: [-0.5, 0], c4: [0.5, 0], p3: [-0.5, -0.5], p4: [0.5, -0.5], oz: [0, -0.8] } },
}
const comparisonV3 = { contract_version: "comparison-charts-v3", statistics_schema_version: "comparison-statistics-v1", charts: [], statistics: [] }
const output = { baseURL, repeats, warmup: 1, api_delay_ms: fixtureDelay, fixture: "G12 copy of G00-UI plus current project detail and comparison-charts-v3 mocks: 2 EEG projects, 7 channels, 128 points, 16 frequencies; fabricated responses", samples: [] }
const browser = await chromium.launch({ headless: true })
try {
  for (let sample = -1; sample < repeats; sample++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    const errors = [], requests = [], steps = []
    let pendingRequests = 0
    page.on("pageerror", e => errors.push(e.message))
    await page.addInitScript(() => {
      localStorage.setItem("neurodatics-auth-session", JSON.stringify({ user: { id: "g00-ui", email: "g00@test.invalid", name: "Synthetic", authSource: "google-oauth" }, session: { accessToken: "synthetic-ui-token", tokenType: "bearer", expiresAt: "2099-01-01T00:00:00.000Z" } }))
      window.g00LongTasks = []
      new PerformanceObserver(list => window.g00LongTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: "longtask", buffered: true })
    })
    await page.route("**/api/**", async route => {
      pendingRequests++
      const url = new URL(route.request().url()), requestPath = url.pathname.replace(/\/$/, "")
      let body
      if (requestPath === "/api/projects") body = ["A", "B"].map(id => ({ id: `g00-${id}`, name: `G00 Project ${id}`, ingestion_generation: 3, sensors: [{ id: `eeg-${id}`, sensor_type: "EEG" }] }))
      else if (/^\/api\/projects\/g00-[AB]$/.test(requestPath)) {
        const id = requestPath.split("/").at(-1)
        body = { id, name: `G00 Project ${id.at(-1)}`, description: "Synthetic EEG project", status: "active", ingestion_status: "completed", ingestion_generation: 3, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", source_folder_name: "synthetic", sensors: [{ id: `eeg-${id.at(-1)}`, sensor_type: "EEG" }], participants: [{ id: "p1", participant_code: "SYN-01" }, { id: "p2", participant_code: "SYN-02" }], scenaries: [], files: [] }
      }
      else if (requestPath.endsWith("/analytics/participants")) body = [{ participant_code: "SYN-01", user_index: 1 }, { participant_code: "SYN-02", user_index: 2 }]
      else if (requestPath.endsWith("/analytics/scenarios")) body = []
      else if (requestPath.endsWith("/analytics/comparison/charts")) body = comparisonV3
      else if (requestPath.endsWith("/analytics/gaze-at")) body = { requested_time_s: Number(url.searchParams.get("t_s") ?? 0), nearest_time_s: 0, scenario: "Instruction", gx: null, gy: null, scenario_file_id: null, scenario_type: null, scenario_time_s: 0 }
      else body = Object.entries(responses).find(([suffix]) => requestPath.endsWith(suffix))?.[1]
      if (!body) throw new Error(`Unexpected G00 API request: ${requestPath}`)
      const payload = JSON.stringify(body)
      requests.push({ path: requestPath, query: url.search, bytes: Buffer.byteLength(payload) })
      await new Promise(resolve => setTimeout(resolve, fixtureDelay))
      await route.fulfill({ status: 200, contentType: "application/json", body: payload })
      pendingRequests--
    })
    const settle = async () => {
      await expect(page.getByText("Estadísticas EEG por canal", { exact: true })).toBeVisible()
      await expect(page.getByLabel("Canales EEG").getByRole("button", { name: "F3", exact: true })).toBeEnabled()
      await page.waitForLoadState("networkidle")
    }
    const step = async (name, act, ready) => {
      const start = performance.now(), before = requests.length
      await act()
      await ready()
      await expect.poll(() => pendingRequests).toBe(0)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.waitForLoadState("networkidle")
      const selected = requests.slice(before)
      steps.push({ name, ms_including_networkidle: performance.now() - start, requests: selected, response_bytes: selected.reduce((sum, request) => sum + request.bytes, 0) })
    }
    await step("initial_A", () => page.goto(`${baseURL}/dashboard`), settle)
    const initialResources = await page.evaluate(() => performance.getEntriesByType("resource").filter(e => e.name.includes("/_next/")).map(e => ({ name: new URL(e.name).pathname, transfer_bytes: e.transferSize, encoded_bytes: e.encodedBodySize, decoded_bytes: e.decodedBodySize })))
    await step("PSD", () => page.getByRole("tab", { name: "Densidad espectral", exact: true }).click(), () => expect(page.getByText("Densidad espectral de potencia", { exact: true })).toBeVisible())
    await step("spectrogram", () => page.getByRole("tab", { name: "Espectrograma de frecuencias", exact: true }).click(), () => expect(page.locator("canvas")).toHaveCount(7))
    await step("topography", () => page.getByRole("tab", { name: "Topografía EEG", exact: true }).click(), () => expect(page.getByText("Potencia por electrodo", { exact: true })).toBeVisible())
    const settleTopography = async () => {
      await expect(page.getByRole("tab", { name: "Topografía EEG", exact: true })).toHaveAttribute("aria-selected", "true")
      await expect(page.getByText("Potencia por electrodo", { exact: true })).toBeVisible()
      await expect(page.getByLabel("Canales EEG").getByRole("button", { name: "F3", exact: true })).toBeEnabled()
    }
    await step("B_topography", () => page.getByRole("button", { name: "G00 Project B", exact: true }).click(), settleTopography)
    await step("return_A_topography", () => page.getByRole("button", { name: "G00 Project A", exact: true }).click(), settleTopography)
    await step("comparison_A_v3", async () => {
      const project = page.getByRole("button", { name: "G00 Project A", exact: true }).locator("xpath=../..")
      const comparison = project.getByRole("button", { name: "Comparativas", exact: true })
      if ((await comparison.count()) === 0) await project.getByRole("button", { name: "Expandir proyecto" }).click()
      await project.getByRole("button", { name: "Comparativas", exact: true }).click()
    }, async () => {
      await expect(page.getByRole("heading", { name: "Comparativas", exact: true })).toBeVisible()
      await expect.poll(() => requests.filter(request => request.path.endsWith("/analytics/comparison/charts")).length).toBeGreaterThan(0)
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send("Performance.enable")
    const metrics = await cdp.send("Performance.getMetrics")
    const longtasks = await page.evaluate(() => window.g00LongTasks)
    expect(errors).toEqual([])
    if (sample >= 0) output.samples.push({ sample, steps, initialResources, longtasks, browserMetrics: Object.fromEntries(metrics.metrics.filter(m => ["JSHeapUsedSize", "JSHeapTotalSize", "Nodes", "LayoutDuration", "ScriptDuration"].includes(m.name)).map(m => [m.name, m.value])) })
    await context.close()
  }
} finally { await browser.close() }
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
output.summary = output.samples[0].steps.map(({ name }, i) => {
  const values = output.samples.map(s => s.steps[i].ms_including_networkidle)
  return { step: name, n: values.length, median_ms: median(values), min_ms: Math.min(...values), max_ms: Math.max(...values), request_counts: output.samples.map(s => s.steps[i].requests.length), bytes: output.samples.map(s => s.steps[i].response_bytes) }
})
const chunkRoot = process.env.G12_CHUNK_DIR ?? path.join(process.env.G00_FRONTEND_DIR ?? path.join(root, "output/perf-g12/frontend"), ".next/static")
const chunks = fs.readdirSync(chunkRoot, { recursive: true }).filter(file => file.endsWith(".js")).map(file => {
  const body = fs.readFileSync(path.join(chunkRoot, file))
  return { file, bytes: body.length, gzip_bytes: zlib.gzipSync(body).length }
})
output.production_chunks = { count: chunks.length, total_bytes: chunks.reduce((s, c) => s + c.bytes, 0), total_gzip_bytes: chunks.reduce((s, c) => s + c.gzip_bytes, 0), files: chunks }
output.limits = ["mocked API, not full system latency", "initial navigation includes networkidle (500 ms); clicks await mocked response completion, visible content and two animation frames", "fresh browser contexts; server and OS warm", "no cloud or frozen local package", "synthetic UI fixture does not test numeric equivalence", "CDP memory is snapshot, not peak RSS"]
fs.writeFileSync(process.env.G00_BROWSER_OUTPUT ?? path.join(root, "docs/perf/ejecucion/evidencia/g12/browser-g12.json"), JSON.stringify(output, null, 2))
console.log(JSON.stringify(output.summary, null, 2))
