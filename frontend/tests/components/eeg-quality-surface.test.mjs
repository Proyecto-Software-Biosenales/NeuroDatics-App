// The chart itself cannot be mounted here: recharts ships ES modules and this
// harness bundles CommonJS, so `import { LineChart } from "recharts"` breaks the
// bundle outright. What the chart derives is covered by the pure helpers in
// features/analytics/eegPresentation.test.mjs; this file exercises the panels
// that surface the quality record, in a real browser, with real events.
import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { chromium, expect } from "@playwright/test"
import { browserBundle } from "../browserBundle.mjs"

// A stand-in for SAIO block 5: C4 ordinary, F3 carrying a 9,640 uV excursion on
// a 10 uV quantization grid with 12.4 % repeated samples and a kilo rescale.
const bundle = browserBundle(`
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { EegArtifactSpanList, EegChannelQualityTable, EegQualityNotes }
    from '@/features/analytics/components/eeg/EegQualityPanel';
  import { InfoChip } from '@/features/analytics/components/InfoChip';

  const CHANNELS = ['f3', 'c4'];
  const quality = over => ({
    transient_candidates: 0, transient_step_threshold_uV_assumed: 500,
    max_absolute_step: 104, median_offset: -1256.2, valid_samples: 1000,
    missing_samples: 1216, repeated_adjacent_samples: 0, quantization_step_uV: 0.01,
    constant: false, amplitude_outlier_samples: 0, amplitude_z_max: 3.1,
    amplitude_z_threshold: 10, step_threshold_ceiling_uV_assumed: 500,
    peak_to_peak_window_s: 1, peak_to_peak_max_uV: 274.6,
    peak_to_peak_threshold_uV_assumed: 1000, peak_to_peak_excursions: 0, ...over,
  });
  const METADATA = {
    version: 'eeg-v2',
    warnings: [
      'Escala kilo corregida por 1000; confirmar unidad física.',
      'Muestras EEG ausentes: se muestran como huecos.',
    ],
    source_units: { f3: 'kilo', c4: 'uv' },
    assumed_uV_channels: [],
    excluded_channels: ['le'],
    channels: {
      f3: quality({ quantization_step_uV: 10, repeated_adjacent_samples: 124,
        amplitude_outlier_samples: 1554, amplitude_z_max: 94.9,
        peak_to_peak_max_uV: 9800, peak_to_peak_excursions: 3 }),
      c4: quality(),
    },
    artifact_spans: [
      { channel: 'c4', start_s: 30, end_s: 31, peak_uV: -1576.9, z: 3.1, detector: 'peak_to_peak' },
      { channel: 'f3', start_s: 120.4, end_s: 125.3, peak_uV: 9640, z: 94.9, detector: 'amplitude' },
      // Runs 10 ms after the excursion: the same event, one chip.
      { channel: 'f3', start_s: 125.31, end_s: 125.4, peak_uV: 880, z: 10.5, detector: 'amplitude' },
    ],
    artifact_spans_total: 5,
  };

  function Fixture({ metadata }) {
    const [selectedTime, setSelectedTime] = useState(null);
    return <>
      <EegQualityNotes metadata={metadata} />
      <EegArtifactSpanList metadata={metadata} channels={CHANNELS}
        selectedTime={selectedTime} onSelectTime={setSelectedTime} />
      <EegChannelQualityTable metadata={metadata} channels={CHANNELS} />
      {metadata.channels?.f3 ? <InfoChip label="Eje recortado" detail="Detalle del eje recortado" /> : null}
      <output id="state">{JSON.stringify({ selectedTime })}</output>
    </>;
  }
  const root = createRoot(document.getElementById('root'));
  window.mountFixture = clean =>
    root.render(<Fixture metadata={clean
      ? { version: 'eeg-v2', warnings: [], source_units: { f3: 'uv' }, channels: {} }
      : METADATA} />);
`)

let browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })

async function fixture(t, clean = false) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  t.after(async () => { await page.close(); assert.deepEqual(errors, []) })
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ content: bundle })
  await page.evaluate((value) => window.mountFixture(value), clean)
  await expect(page.locator("#state")).toBeVisible()
  return page
}

const state = async (page) => JSON.parse(await page.locator("#state").textContent())

test("warnings and unit caveats share one card that offers re-ingestion", async (t) => {
  const page = await fixture(t)
  // <output id="state"> also carries the implicit status role, so name the panel.
  const notice = page.getByRole("status").filter({ hasText: "Unidades EEG" })
  await expect(notice).toContainText("Calidad y alcance de EEG")
  await expect(notice).toContainText("Muestras EEG ausentes")
  // The kilo caveat below says it with the channel name; the prose copy goes.
  await expect(notice).not.toContainText("Escala kilo corregida")
  await expect(notice).toContainText("Reescalados en ingesta: F3 (kilo)")
  await expect(notice).toContainText("no recupera la precisión perdida")
  await expect(notice).toContainText("Excluidos por unidad ambigua: LE")
  await expect(notice).toContainText("sin volver a ingerir ambos")
  await expect(page.getByRole("link", { name: "Volver a ingerir" })).toHaveAttribute(
    "href",
    "/proyectos"
  )
})

test("a clean export shows no notice, no spans and no quality table", async (t) => {
  const page = await fixture(t, true)
  await expect(page.getByRole("status").filter({ hasText: "Unidades EEG" })).toHaveCount(0)
  await expect(page.getByRole("button")).toHaveCount(0)
  await expect(page.getByText(/Calidad por canal/)).toHaveCount(0)
})

test("each event says which detector found it and jumps to its start", async (t) => {
  const page = await fixture(t)
  // One row per channel in the chart's order, one chip per event: runs that
  // touch share a chip.
  // Each name starts with the chip's visible text, so voice control can say it.
  const labels = await page.getByRole("button", { name: /: ir a / }).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label"))
  )
  assert.deepEqual(labels, [
    "120.4–125.4 s ×2: ir a F3 120.40–125.40 s · 2 tramos · pico 9640.0 uV, z máx. 94.9 · amplitud (z robusto)",
    "30.0–31.0 s: ir a C4 30.00–31.00 s · pico -1576.9 uV, z 3.1 · pico a pico en ventana",
  ])
  await expect(page.getByText(/2 eventos · 3 tramos del detector/)).toBeVisible()
  await expect(page.getByText(/los 3 más severos de 5/)).toBeVisible()
  await expect(page.getByText(/Señalados, no eliminados/)).toBeVisible()

  assert.equal((await state(page)).selectedTime, null)
  await page.getByRole("button", { name: /ir a F3/ }).click()
  assert.equal((await state(page)).selectedTime, 120.4)
  await expect(page.getByRole("button", { name: /ir a F3/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.getByRole("button", { name: /ir a C4/ })).toHaveAttribute(
    "aria-pressed",
    "false"
  )
})

test("the chip explains itself on focus and every run stays in the detail table", async (t) => {
  const page = await fixture(t)
  await page.getByRole("button", { name: /ir a F3/ }).focus()
  await expect(page.getByRole("tooltip")).toContainText("2 tramos")

  // Collapsed by default: the individual runs cost one line until asked for.
  await expect(page.getByRole("button", { name: /^Ir a / })).toHaveCount(0)
  await page.getByRole("button", { name: "Detalle de los 3 tramos" }).click()
  await expect(page.getByRole("button", { name: /^Ir a / })).toHaveCount(3)
  await page.getByRole("button", { name: /^Ir a F3 125\.31/ }).click()
  assert.equal((await state(page)).selectedTime, 125.31)
  // The event chip lights up for any instant inside it, not only its start.
  await expect(page.getByRole("button", { name: /ir a F3/ })).toHaveAttribute("aria-pressed", "true")
})

test("a chip without an action opens its explanation on click, not only on hover", async (t) => {
  const page = await fixture(t)
  await expect(page.getByRole("tooltip")).toHaveCount(0)
  await page.getByRole("button", { name: "Eje recortado" }).click()
  await expect(page.getByRole("tooltip")).toContainText("Detalle del eje recortado")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("tooltip")).toHaveCount(0)
})

test("per-channel quality that was already measured is finally rendered", async (t) => {
  const page = await fixture(t)
  const rows = page.getByRole("row")
  const f3 = rows.filter({ hasText: "F3" }).first()
  await expect(f3).toContainText("10.00 uV")
  await expect(f3).toContainText("12.40 %")
  await expect(f3).toContainText("1,216")
  await expect(f3).toContainText("-1256.2 uV")
  await expect(f3).toContainText("94.9")
  await expect(f3).toContainText("cuantización gruesa")
  await expect(f3).toContainText("origen kilo")
  await expect(f3).toContainText("pico a pico 9800 uV")
  // 1554 amplitude samples + 0 steps + 3 peak-to-peak windows.
  await expect(f3).toContainText("1,557")

  const c4 = rows.filter({ hasText: "C4" }).first()
  await expect(c4).toContainText("0.01 uV")
  await expect(c4).not.toContainText("cuantización gruesa")
  await expect(c4).not.toContainText("origen")
})
