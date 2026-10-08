/** G11 synthetic Chromium probe. No application services or personal data. */
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..")
const require = createRequire(path.join(root, "frontend/package.json"))
const { chromium } = require("@playwright/test")

const repeats = Number(process.env.G11_REPEATS ?? 5)
const variant = process.env.G11_VARIANT ?? "base"
const outputPath = process.env.G11_OUTPUT ?? path.join(
  root,
  `docs/perf/ejecucion/evidencia/g11/profile-${variant}.json`,
)
const logicalSizes = [320, 640, 960]
const dprs = [1, 2, 3]
const scenarios = ["complete", "missing", "nan", "values_change", "mask_change"]

function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    n: samples.length,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted.at(-1),
    samples,
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ["--js-flags=--expose-gc", "--enable-precise-memory-info"],
})
const context = await browser.newContext()
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send("Performance.enable")
await page.goto("about:blank")

async function taskDuration() {
  const response = await cdp.send("Performance.getMetrics")
  return response.metrics.find((metric) => metric.name === "TaskDuration")?.value ?? null
}

const results = []
try {
  for (const logicalSize of logicalSizes) {
    for (const dpr of dprs) {
      for (const scenario of scenarios) {
        await page.evaluate(() => globalThis.gc?.())
        const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null)
        const cpuBefore = await taskDuration()
        const measurement = await page.evaluate(
          ({ logicalSize, dpr, repeats, scenario, variant }) => {
            const width = Math.floor(logicalSize * dpr)
            const height = width
            const range = 1.15
            const positions = [
              ["f3", -0.5, 0.5], ["f4", 0.5, 0.5], ["c3", -0.5, 0],
              ["c4", 0.5, 0], ["p3", -0.5, -0.5], ["p4", 0.5, -0.5],
              ["oz", 0, -0.8],
            ]
            const domain = { min: 0, max: 8 }
            const canvas = document.createElement("canvas")
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext("2d")
            if (!ctx) throw new Error("2d canvas unavailable")

            const gradient = [
              [68, 1, 84], [70, 48, 126], [54, 92, 141], [39, 127, 142],
              [31, 161, 135], [74, 193, 109], [159, 218, 58], [253, 231, 37],
            ]
            const pack = (r, g, b) =>
              (r | (g << 8) | (b << 16) | (255 << 24)) >>> 0
            const lut = new Uint32Array(256)
            for (let index = 0; index < lut.length; index += 1) {
              const scaled = (index / 255) * (gradient.length - 1)
              const low = Math.floor(scaled)
              const high = Math.min(gradient.length - 1, low + 1)
              const weight = scaled - low
              const color = gradient[low].map((value, component) =>
                Math.round(value + (gradient[high][component] - value) * weight),
              )
              lut[index] = pack(color[0], color[1], color[2])
            }
            const viridisPixel = (value) => {
              if (!Number.isFinite(value)) return lut[0]
              const position = ((value - domain.min) / (domain.max - domain.min)) * 255
              if (position <= 0) return lut[0]
              if (position >= 255) return lut[255]
              return lut[(position + 0.5) | 0]
            }
            const rowsForFrame = (frame) => {
              let selected = positions
              if (scenario === "missing") selected = positions.slice(0, 4)
              return selected.map(([channel, x, y], index) => {
                let value = 2 + Math.sin(index)
                if (scenario === "nan" && (index === 1 || index === 5)) value = NaN
                if (scenario === "values_change") value = 2 + Math.sin(index + frame * 0.37)
                if (scenario === "mask_change" && index === 2 && frame % 2 === 1) value = NaN
                return { channel, x, y, value }
              })
            }
            const topographyValueAt = (x, y, rows) => {
              let weightedSum = 0
              let weightTotal = 0
              for (const row of rows) {
                if (!Number.isFinite(row.value)) continue
                const dx = x - row.x
                const dy = y - row.y
                const squared = dx * dx + dy * dy
                if (squared < 1e-6) return row.value
                const weight = 1 / Math.max(squared, 1e-6)
                weightedSum += row.value * weight
                weightTotal += weight
              }
              return weightTotal > 0 ? weightedSum / weightTotal : 0
            }
            const baseDraw = (rows) => {
              const image = ctx.createImageData(width, height)
              const pixels = new Uint32Array(image.data.buffer)
              for (let py = 0; py < height; py += 1) {
                const y = range - (py / Math.max(1, height - 1)) * range * 2
                const rowStart = py * width
                for (let px = 0; px < width; px += 1) {
                  const x = (px / Math.max(1, width - 1)) * range * 2 - range
                  if (x * x + y * y > 1) continue
                  pixels[rowStart + px] = viridisPixel(topographyValueAt(x, y, rows))
                }
              }
              ctx.putImageData(image, 0, 0)
            }
            let cachedGeometry = null
            const candidateKey = (rows) =>
              `${width},${height}|${rows.map((row) => `${row.channel.length}:${row.channel}|${row.x},${row.y},${Number.isFinite(row.value) ? 1 : 0}`).join("|")}`
            const buildGeometry = (rows, key) => {
              const indices = rows.flatMap((row, index) => Number.isFinite(row.value) ? [index] : [])
              const byteLength = indices.length * 4 + indices.length * (width + height) * 8 + height * 2 * 4 + key.length * 2
              if (byteLength > 1024 * 1024) return null
              const validRowIndices = Uint32Array.from(indices)
              const xSquared = new Float64Array(indices.length * width)
              const ySquared = new Float64Array(indices.length * height)
              indices.forEach((rowIndex, validIndex) => {
                const row = rows[rowIndex]
                for (let px = 0; px < width; px += 1) {
                  const x = (px / Math.max(1, width - 1)) * range * 2 - range
                  const dx = x - row.x
                  xSquared[validIndex * width + px] = dx * dx
                }
                for (let py = 0; py < height; py += 1) {
                  const y = range - (py / Math.max(1, height - 1)) * range * 2
                  const dy = y - row.y
                  ySquared[validIndex * height + py] = dy * dy
                }
              })
              const headSpans = new Uint32Array(height * 2)
              for (let py = 0; py < height; py += 1) {
                const y = range - (py / Math.max(1, height - 1)) * range * 2
                let start = width
                let end = 0
                for (let px = 0; px < width; px += 1) {
                  const x = (px / Math.max(1, width - 1)) * range * 2 - range
                  if (x * x + y * y <= 1) {
                    if (start === width) start = px
                    end = px + 1
                  }
                }
                headSpans[py * 2] = start
                headSpans[py * 2 + 1] = end
              }
              return { key, validRowIndices, xSquared, ySquared, headSpans, byteLength }
            }
            const candidateDraw = (rows, phases = null) => {
              const image = ctx.createImageData(width, height)
              const pixels = new Uint32Array(image.data.buffer)
              const key = candidateKey(rows)
              let rebuilt = false
              const buildStart = performance.now()
              if (cachedGeometry?.key !== key) {
                cachedGeometry = buildGeometry(rows, key)
                rebuilt = true
              }
              phases?.build.push(performance.now() - buildStart)
              if (!cachedGeometry) {
                baseDraw(rows)
                phases?.shade.push(0)
                return { rebuilt, geometryBytes: 0 }
              }
              const shadeStart = performance.now()
              const { validRowIndices, xSquared, ySquared, headSpans } = cachedGeometry
              for (let py = 0; py < height; py += 1) {
                const start = headSpans[py * 2]
                const end = headSpans[py * 2 + 1]
                const rowStart = py * width
                for (let px = start; px < end; px += 1) {
                  let weightedSum = 0
                  let weightTotal = 0
                  let valueAtElectrode = null
                  for (let validIndex = 0; validIndex < validRowIndices.length; validIndex += 1) {
                    const squared = xSquared[validIndex * width + px] + ySquared[validIndex * height + py]
                    const value = rows[validRowIndices[validIndex]].value
                    if (squared < 1e-6) {
                      valueAtElectrode = value
                      break
                    }
                    const weight = 1 / Math.max(squared, 1e-6)
                    weightedSum += value * weight
                    weightTotal += weight
                  }
                  pixels[rowStart + px] = viridisPixel(valueAtElectrode ?? (weightTotal > 0 ? weightedSum / weightTotal : 0))
                }
              }
              ctx.putImageData(image, 0, 0)
              phases?.shade.push(performance.now() - shadeStart)
              return { rebuilt, geometryBytes: cachedGeometry.byteLength }
            }
            const geometryInterpolation = (rows) => {
              const values = new Float64Array(width * height)
              values.fill(NaN)
              for (let py = 0; py < height; py += 1) {
                const y = range - (py / Math.max(1, height - 1)) * range * 2
                const rowStart = py * width
                for (let px = 0; px < width; px += 1) {
                  const x = (px / Math.max(1, width - 1)) * range * 2 - range
                  if (x * x + y * y > 1) continue
                  values[rowStart + px] = topographyValueAt(x, y, rows)
                }
              }
              return values
            }
            const colorRaster = (values) => {
              const image = ctx.createImageData(width, height)
              const pixels = new Uint32Array(image.data.buffer)
              for (let index = 0; index < values.length; index += 1) {
                if (!Number.isNaN(values[index])) pixels[index] = viridisPixel(values[index])
              }
              ctx.putImageData(image, 0, 0)
            }
            if (variant !== "base" && variant !== "candidate") throw new Error(`Unsupported probe variant: ${variant}`)

            const draw = variant === "base" ? baseDraw : candidateDraw
            draw(rowsForFrame(-1))
            const total = []
            const candidatePhases = { build: [], shade: [] }
            let cacheRebuilds = 0
            let geometryBytes = 0
            for (let frame = 0; frame < repeats; frame += 1) {
              const start = performance.now()
              const metadata = variant === "base"
                ? (baseDraw(rowsForFrame(frame)), null)
                : candidateDraw(rowsForFrame(frame), candidatePhases)
              total.push(performance.now() - start)
              if (metadata?.rebuilt) cacheRebuilds += 1
              geometryBytes = metadata?.geometryBytes ?? 0
            }
            const candidateCold = []
            if (variant === "candidate") {
              for (let frame = 0; frame < repeats; frame += 1) {
                cachedGeometry = null
                const start = performance.now()
                candidateDraw(rowsForFrame(frame))
                candidateCold.push(performance.now() - start)
              }
            }
            const stableRows = rowsForFrame(2)
            geometryInterpolation(stableRows)
            const geometry = []
            for (let frame = 0; frame < repeats; frame += 1) {
              const start = performance.now()
              geometryInterpolation(stableRows)
              geometry.push(performance.now() - start)
            }
            const values = geometryInterpolation(stableRows)
            colorRaster(values)
            const color = []
            for (let frame = 0; frame < repeats; frame += 1) {
              const start = performance.now()
              colorRaster(values)
              color.push(performance.now() - start)
            }
            return {
              width,
              height,
              total,
              geometry_interpolation: geometry,
              color_put_image_data: color,
              candidate_build: candidatePhases.build,
              candidate_shade_color_put: candidatePhases.shade,
              candidate_cold_frame: candidateCold,
              cache_rebuilds_measured: cacheRebuilds,
              retained_geometry_bytes: geometryBytes,
              explicit_bytes: {
                pixels: width * height,
                image_data_rgba: width * height * 4,
                canvas_backing_lower_bound: width * height * 4,
                decomposition_values_float64: width * height * 8,
              },
            }
          },
          { logicalSize, dpr, repeats, scenario, variant },
        )
        const cpuAfter = await taskDuration()
        await page.evaluate(() => globalThis.gc?.())
        const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null)
        results.push({
          logical_size_css_px: logicalSize,
          dpr,
          scenario,
          backing_width_px: measurement.width,
          backing_height_px: measurement.height,
          frame_sync_ms: summary(measurement.total),
          phase_geometry_interpolation_ms: summary(measurement.geometry_interpolation),
          phase_color_put_image_data_ms: summary(measurement.color_put_image_data),
          phase_candidate_build_ms: measurement.candidate_build.length ? summary(measurement.candidate_build) : null,
          phase_candidate_shade_color_put_ms: measurement.candidate_shade_color_put.length ? summary(measurement.candidate_shade_color_put) : null,
          candidate_cold_frame_ms: measurement.candidate_cold_frame.length ? summary(measurement.candidate_cold_frame) : null,
          cache_rebuilds_measured: measurement.cache_rebuilds_measured,
          retained_geometry_bytes: measurement.retained_geometry_bytes,
          chromium_task_cpu_ms_batch:
            cpuBefore == null || cpuAfter == null ? null : (cpuAfter - cpuBefore) * 1000,
          heap_js_before_bytes: heapBefore,
          heap_js_after_gc_bytes: heapAfter,
          ...measurement.explicit_bytes,
        })
      }
    }
  }
} finally {
  await browser.close()
}

const output = {
  generated_at: new Date().toISOString(),
  variant,
  environment: {
    node: process.version,
    browser: "bundled Playwright Chromium, headless",
    logical_sizes_css_px: logicalSizes,
    dprs,
    scenarios,
    warmup_frames_per_case: 1,
    measured_frames_per_case: repeats,
  },
  interpretation: {
    frame_sync_ms: "synchronous createImageData + shade + putImageData; excludes React, scheduling and outlines/electrode labels",
    chromium_task_cpu_ms_batch: "renderer TaskDuration delta for total and both decomposition batches plus harness overhead; not per-frame CPU",
    heap: "performance.memory snapshot after forced GC; not browser RSS or raster/GPU memory",
    canvas_backing_lower_bound: "RGBA byte lower bound, not an observed browser allocation",
  },
  results,
}
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8")
console.log(JSON.stringify({ outputPath, cases: results.length, variant }))
