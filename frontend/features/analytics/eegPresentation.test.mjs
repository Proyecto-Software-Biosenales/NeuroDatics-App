import assert from "node:assert/strict"
import test from "node:test"
import {
  buildStats, finiteValues, formatChannel, formatNumber, hexToRgb,
  interpolateColor, interpolateTopographyValue, mean, median, fullResolutionStats, nearestTimeIndex,
  readClickedTime, rotateTopographyPositionClockwise, scaleSpectrogramValue,
  std, VIRIDIS_GRADIENT,
  channelQualityRows, clusterArtifactSpans, describeArtifactCluster, describeArtifactSpan,
  envelopeWarning, formatSpanRange, montageLanes, qualityCardWarnings, reingestionNotice,
  robustDomain, visibleArtifactSpans,
} from "./eegPresentation.ts"

test("EEG statistics preserve finite samples and sample standard deviation", () => {
  assert.deepEqual(finiteValues([0, undefined, NaN, Infinity, -Infinity, -2, 5]), [0, -2, 5])
  assert.equal(mean([]), 0)
  assert.equal(mean([1, 2, 3]), 2)
  assert.equal(median([]), 0)
  const values = [4, 1, 3, 2]
  assert.equal(median(values), 2.5)
  assert.deepEqual(values, [4, 1, 3, 2])
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(std([]), 0)
  assert.equal(std([8]), 0)
  assert.equal(std([1, 2, 3]), 1)
})

test("EEG summaries use RMS without an invented experimental baseline", () => {
  assert.equal(buildStats("f3", []), null)
  assert.deepEqual(buildStats("f3", [1, 2, 3]), {
    channel: "f3", count: 3, mean: 2, std: 1, median: 2,
    min: 1, max: 3, rms: Math.sqrt(14/3),
  })
  const raw = { count: 10000, mean: 1, std: 2, median: 1, min: -4, max: 5, rms: 3 }
  const smooth = { ...raw, std: 1, rms: 2 }
  const data = {channels:["f3"],raw:{f3:[999]},statistics:{raw:{f3:raw},smooth:{f3:smooth}}}
  assert.deepEqual(fullResolutionStats(data,"raw"), [{channel:"f3",...raw}])
  assert.deepEqual(fullResolutionStats(data,"smooth"), [{channel:"f3",...smooth}])
  assert.deepEqual(fullResolutionStats(data,"both"), [{channel:"f3",...raw}])
  assert.deepEqual(finiteValues([null,0,NaN]),[0])
})

test("spectrogram hit testing keeps the real clock and rejects gaps", () => {
  const times = [1,2,3,21,22]
  assert.equal(nearestTimeIndex(times,21.1,1),3)
  assert.equal(nearestTimeIndex(times,10,1),-1)
  assert.equal(nearestTimeIndex([],0,1),-1)
})

test("EEG labels and color mapping preserve boundaries and missing values", () => {
  assert.equal(formatChannel("f3"), "F3")
  assert.equal(formatNumber(null), "—")
  assert.equal(formatNumber(undefined), "—")
  assert.equal(formatNumber(Infinity), "—")
  assert.equal(formatNumber(1.23456, 2, " uV"), "1.23 uV")
  assert.deepEqual(hexToRgb("#102030"), { r: 16, g: 32, b: 48 })
  assert.deepEqual(interpolateColor(-1), { r: 68, g: 1, b: 84 })
  assert.deepEqual(interpolateColor(2), { r: 253, g: 231, b: 37 })
  assert.deepEqual(interpolateColor(0.065), { r: 70, g: 21, b: 102 })
  assert.equal(scaleSpectrogramValue(NaN, { min: 1, max: 3 }), 0)
  assert.equal(scaleSpectrogramValue(2, { min: 3, max: 3 }), 0.5)
  assert.equal(scaleSpectrogramValue(-1, { min: 0, max: 4 }), 0)
  assert.equal(scaleSpectrogramValue(5, { min: 0, max: 4 }), 1)
  assert.equal(scaleSpectrogramValue(1, { min: 0, max: 4 }), 0.25)
  assert.ok(VIRIDIS_GRADIENT.startsWith("linear-gradient(to right, #440154 0%"))
  assert.ok(VIRIDIS_GRADIENT.endsWith("#FDE725 100%)"))
})

test("topography interpolation preserves electrode values and clockwise orientation", () => {
  const left = { channel: "f3", value: 2, x: -1, y: 0 }
  const right = { channel: "f4", value: 6, x: 1, y: 0 }
  assert.deepEqual(interpolateTopographyValue(-1, 0, [left, right]), { value: 2, nearest: left })
  assert.deepEqual(interpolateTopographyValue(0, 0, [left, right]), { value: 4, nearest: left })
  assert.deepEqual(interpolateTopographyValue(0, 0, [{ ...left, value: NaN }]), { value: 0, nearest: null })
  assert.deepEqual(interpolateTopographyValue(0, 0, []), { value: 0, nearest: null })
  assert.deepEqual(rotateTopographyPositionClockwise(0.25, 0.75), { x: 0.75, y: -0.25 })
})

test("EEG click extraction preserves payload priority and numeric labels", () => {
  assert.equal(readClickedTime(null), null)
  assert.equal(readClickedTime("2"), null)
  assert.equal(readClickedTime({ activePayload: [{ payload: { time: 0 } }], activeLabel: "9" }), 0)
  assert.equal(readClickedTime({ activeLabel: "2.5" }), 2.5)
  assert.equal(readClickedTime({ activeLabel: "invalid" }), null)
  assert.equal(readClickedTime({ activePayload: [{ payload: { time: Infinity } }], activeLabel: "9" }), null)
})

test("a robust y range cannot be stretched by one sample, and says what it hides", () => {
  assert.equal(robustDomain([]), null)
  assert.equal(robustDomain([NaN, null]), null)
  // 200 ordinary samples plus the block 5 F3 spike: the spike stays outside.
  const values = [...Array(200).keys()].map((index) => index - 100).concat([9640])
  const domain = robustDomain(values)
  assert.ok(domain.max < 200, `expected the spike outside the view, got ${domain.max}`)
  // 201 samples: the 0.5/99.5 percentiles land one sample in from each end.
  // The low tail ends 1 uV past the band, so it is drawn; the spike is not.
  assert.equal(domain.clippedHigh, 1)
  assert.equal(domain.clippedLow, 0)
  assert.equal(domain.min, -100)
  // Ordinary noise reports nothing clipped: percentiles alone always hid ~1 %.
  const noise = [...Array(5000).keys()].map((index) => 40 * Math.sin(index * 0.37) + 25 * Math.cos(index * 1.3))
  const quiet = robustDomain(noise)
  assert.equal(quiet.clippedLow + quiet.clippedHigh, 0)
  // Without reach the percentile band is the view, as before.
  assert.ok(robustDomain(noise, 0.5, 99.5, 0).clippedHigh > 0)
  // One excursion hides only itself, not the ordinary tail on its side.
  const spiked = robustDomain([...noise, 9640])
  assert.equal(spiked.clippedHigh, 1)
  assert.equal(spiked.clippedLow, 0)
  assert.equal(spiked.max, Math.max(...noise))
  // Full percentiles keep everything, so nothing is reported as clipped.
  const whole = robustDomain(values, 0, 100)
  assert.equal(whole.max, 9640)
  assert.equal(whole.clippedHigh, 0)
  // A constant channel still gets a drawable band.
  const flat = robustDomain([5, 5, 5])
  assert.ok(flat.max > flat.min)
  assert.equal(flat.clippedLow + flat.clippedHigh, 0)
})

test("artifact spans are filtered to the visible channels and read back in time order", () => {
  const metadata = { version: "eeg-v2", warnings: [], artifact_spans: [
    { channel: "f3", start_s: 120.4, end_s: 125.3, peak_uV: 9640, z: 94.9, detector: "amplitude" },
    { channel: "c3", start_s: 37.1, end_s: 37.2, peak_uV: 916.5, z: 3.7, detector: "step" },
    { channel: "p4", start_s: 5, end_s: 6, peak_uV: 1828.3, z: 3.8, detector: "peak_to_peak" },
  ]}
  assert.deepEqual(
    visibleArtifactSpans(metadata, ["f3", "c3"]).map((span) => span.channel),
    ["c3", "f3"]
  )
  assert.deepEqual(visibleArtifactSpans(metadata, []), [])
  assert.deepEqual(visibleArtifactSpans(undefined, ["f3"]), [])
  assert.equal(
    describeArtifactSpan(metadata.artifact_spans[0]),
    "F3 120.40–125.30 s · pico 9640.0 uV, z 94.9 · amplitud (z robusto)"
  )
  assert.match(describeArtifactSpan(metadata.artifact_spans[2]), /pico a pico en ventana$/)
})

test("artifact spans of one channel that touch read back as one event", () => {
  // SAIO b5 F3: a peak-to-peak window, the excursion, then sub-second amplitude runs.
  const spans = [
    { channel: "f3", start_s: 125.26, end_s: 125.37, peak_uV: 880, z: 10.5, detector: "amplitude" },
    { channel: "f3", start_s: 7.68, end_s: 9.49, peak_uV: -800, z: 5.7, detector: "peak_to_peak" },
    { channel: "f3", start_s: 119.38, end_s: 121.93, peak_uV: 9640, z: 94.9, detector: "peak_to_peak" },
    { channel: "c4", start_s: 120, end_s: 121, peak_uV: -1576.9, z: 3.1, detector: "step" },
    { channel: "f3", start_s: 120.38, end_s: 125.25, peak_uV: 9640, z: 94.9, detector: "amplitude" },
    { channel: "f3", start_s: 125.8, end_s: 125.8, peak_uV: -12000, z: 12, detector: "amplitude" },
  ]
  const clusters = clusterArtifactSpans(spans)
  assert.deepEqual(
    clusters.map((c) => [c.channel, c.start_s, c.end_s, c.spans.length]),
    [["f3", 7.68, 9.49, 1], ["f3", 119.38, 125.8, 4], ["c4", 120, 121, 1]]
  )
  const event = clusters[1]
  // Detectors in a fixed order; the peak keeps its sign; z is the largest.
  assert.deepEqual(event.detectors, ["amplitude", "peak_to_peak"])
  assert.equal(event.peak_uV, -12000)
  assert.equal(event.z, 94.9)
  // The input is not reordered or mutated.
  assert.equal(spans[0].start_s, 125.26)

  // A gap wider than the tolerance keeps two events apart.
  assert.equal(clusterArtifactSpans(spans, 0).length, 5)
  assert.deepEqual(clusterArtifactSpans([]), [])

  // One span reads exactly as before; a cluster says how many it holds.
  assert.equal(describeArtifactCluster(clusters[0]), describeArtifactSpan(spans[1]))
  assert.equal(
    describeArtifactCluster(event),
    "F3 119.38–125.80 s · 4 tramos · pico -12000.0 uV, z máx. 94.9 · amplitud (z robusto), pico a pico en ventana"
  )
  assert.equal(formatSpanRange(7.68, 9.49), "7.7–9.5 s")
  assert.equal(formatSpanRange(125.42, 125.43), "125.42 s")
})

test("the quality card drops warnings another element already states", () => {
  const warnings = [
    "Unidad EEG no declarada: uV es una suposición heredada; confirmar calibración y referencia.",
    "Escala kilo corregida por 1000; el reescalado no recupera la precisión perdida. Confirmar unidad física.",
    "Muestras EEG ausentes: se muestran como huecos.",
    "Canales sin un tramo válido suficiente para la ventana de análisis: P4. Se informan como incompletos.",
    "El gráfico muestra la envolvente (mínimo y máximo) de cada tramo: conserva los extremos reales.",
  ]
  // Nothing structured to show them: every warning stays.
  assert.deepEqual(qualityCardWarnings({ version: "eeg-v2", warnings }), warnings)
  assert.deepEqual(qualityCardWarnings(undefined), [])
  assert.equal(envelopeWarning({ version: "eeg-v2", warnings }), null)

  const shown = {
    version: "eeg-v2", warnings, assumed_uV_channels: ["c3"], source_units: { f3: "kilo" },
    incomplete_channels: ["p4"], display_reduction: "min_max_envelope_per_bucket",
  }
  assert.deepEqual(qualityCardWarnings(shown), ["Muestras EEG ausentes: se muestran como huecos."])
  assert.equal(envelopeWarning(shown), warnings[4])
})

test("channel quality rows expose the export resolution the UI never showed", () => {
  const channel = (over) => ({
    transient_candidates: 0, transient_step_threshold_uV_assumed: 500,
    max_absolute_step: 10, median_offset: -1256.2, valid_samples: 1000,
    missing_samples: 22, repeated_adjacent_samples: 124, quantization_step_uV: 0.01,
    constant: false, amplitude_outlier_samples: 0, amplitude_z_max: 2.1,
    amplitude_z_threshold: 10, step_threshold_ceiling_uV_assumed: 500,
    peak_to_peak_window_s: 1, peak_to_peak_max_uV: 222.9,
    peak_to_peak_threshold_uV_assumed: 1000, peak_to_peak_excursions: 0, ...over,
  })
  const metadata = {
    version: "eeg-v2", warnings: [],
    source_units: { f3: "kilo", c4: "uv" },
    assumed_uV_channels: ["c4"],
    channels: {
      f3: channel({ quantization_step_uV: 10, repeated_adjacent_samples: 124,
        amplitude_outlier_samples: 1554, amplitude_z_max: 94.9, peak_to_peak_max_uV: 9800,
        peak_to_peak_excursions: 3 }),
      c4: channel(),
    },
  }
  const rows = channelQualityRows(metadata, ["f3", "c4", "missing"])
  assert.deepEqual(rows.map((row) => row.channel), ["f3", "c4"])
  const [f3, c4] = rows
  assert.equal(f3.quantizationStepUV, 10)
  assert.equal(f3.coarselyQuantized, true)
  assert.equal(c4.coarselyQuantized, false)
  assert.equal(f3.repeatedFraction, 0.124)
  assert.equal(f3.sourceUnit, "kilo")
  assert.equal(f3.assumedUnit, false)
  assert.equal(c4.assumedUnit, true)
  assert.equal(f3.amplitudeZMax, 94.9)
  assert.deepEqual(channelQualityRows(undefined, ["f3"]), [])
})

test("the re-ingestion notice fires on rescaled, assumed or excluded units only", () => {
  assert.equal(reingestionNotice({ version: "eeg-v2", warnings: [], source_units: { f3: "uv" } }).needed, false)
  assert.equal(reingestionNotice(undefined).needed, false)
  const kilo = reingestionNotice({ version: "eeg-v2", warnings: [],
    source_units: { f3: "kilo", c3: "uv", p3: "mV" }, assumed_uV_channels: ["c4"],
    excluded_channels: ["le"] })
  assert.equal(kilo.needed, true)
  assert.deepEqual(kilo.rescaledChannels, ["f3", "p3"])
  assert.deepEqual(kilo.assumedChannels, ["c4"])
  assert.deepEqual(kilo.excludedChannels, ["le"])
})

test("montage lanes are evenly spaced at one shared uV per pixel", () => {
  const { lanes, spacing, domain } = montageLanes(["f3", "c3", "p3"], { f3: 100, c3: 40, p3: 10 })
  // The widest channel sets the pitch, so every lane is drawn at the same scale.
  assert.equal(spacing, 120)
  assert.deepEqual(lanes, [
    { channel: "f3", offset: 240 }, { channel: "c3", offset: 120 }, { channel: "p3", offset: 0 },
  ])
  assert.deepEqual(domain, [-60, 300])
  // No channels, or no measurable span, still yields a drawable axis.
  assert.ok(montageLanes([], {}).spacing > 0)
  assert.ok(montageLanes(["f3"], {}).spacing > 0)
})
