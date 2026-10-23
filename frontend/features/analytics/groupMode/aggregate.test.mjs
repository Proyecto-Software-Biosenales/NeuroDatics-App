import assert from "node:assert/strict"
import test from "node:test"
import {
  aggregateTraces,
  averageStatRows,
  commonGrid,
  meanByKey,
  meanGrids,
  meanSpectra,
  resampleTrace,
  summarize,
  typicalStep,
} from "./aggregate.ts"
import { GROUP_SUPPORT, groupSeriesStyle, groupUnsupportedReason } from "./groupSupport.ts"

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)

test("resampling interpolates inside the trace and never extrapolates", () => {
  const values = resampleTrace({ x: [0, 1, 2], y: [0, 10, 20] }, [-1, 0, 0.5, 1.5, 2, 3])
  assert.ok(Number.isNaN(values[0]))
  assert.equal(values[1], 0)
  close(values[2], 5)
  close(values[3], 15)
  assert.equal(values[4], 20)
  assert.ok(Number.isNaN(values[5]))
})

test("resampling never bridges a missing value or a wide gap", () => {
  const missing = resampleTrace({ x: [0, 1, 2, 3], y: [1, Number.NaN, 3, 4] }, [0.5, 1.5, 2.5])
  assert.ok(Number.isNaN(missing[0]))
  assert.ok(Number.isNaN(missing[1]))
  close(missing[2], 3.5)
  // Steps of 1 s, then a 10 s hole: more than three typical steps.
  const gap = resampleTrace({ x: [0, 1, 2, 3, 13, 14], y: [0, 0, 0, 0, 1, 1] }, [2.5, 8, 13.5])
  close(gap[0], 0)
  assert.ok(Number.isNaN(gap[1]))
  close(gap[2], 1)
})

test("the typical step is not fooled by envelope pairs a few samples apart", () => {
  // Pairs 0.01 s apart every 1 s: the median step is 0.01, the average ≈ 0.5.
  const x = [0, 0.01, 1, 1.01, 2, 2.01, 3, 3.01]
  assert.ok(typicalStep(x) > 0.4)
  const values = resampleTrace({ x, y: x.map(() => 2) }, [0.5, 1.5, 2.5])
  assert.deepEqual(Array.from(values), [2, 2, 2])
})

test("the common grid covers every trace and stays within the point budget", () => {
  const grid = commonGrid([{ x: [0, 1, 2], y: [1, 1, 1] }, { x: [1, 1.5, 2, 2.5, 3, 3.5, 4], y: [1, 1, 1, 1, 1, 1, 1] }])
  assert.equal(grid[0], 0)
  close(grid[grid.length - 1], 4)
  const dense = commonGrid([{ x: Array.from({ length: 50_000 }, (_, k) => k / 1000), y: new Array(50_000).fill(1) }], 2000)
  assert.ok(dense.length <= 2000)
  close(dense[0], 0)
  close(dense[dense.length - 1], 49.999, 1e-6)
  assert.equal(commonGrid([]).length, 0)
})

test("summaries give the mean, the sample SD and n at each point", () => {
  const { mean, sd, n } = summarize([[1, 2, Number.NaN], [3, Number.NaN, Number.NaN], [5, 4, Number.NaN]])
  close(mean[0], 3)
  close(sd[0], 2)
  assert.equal(n[0], 3)
  close(mean[1], 3)
  close(sd[1], Math.SQRT2)
  assert.equal(n[1], 2)
  assert.ok(Number.isNaN(mean[2]))
  assert.equal(n[2], 0)
  const single = summarize([[7]])
  assert.equal(single.mean[0], 7)
  assert.ok(Number.isNaN(single.sd[0]), "one participant has no spread")
})

test("aggregating traces aligns participants with different ranges", () => {
  const result = aggregateTraces([
    { x: [0, 1, 2, 3, 4], y: [0, 0, 0, 0, 0] },
    { x: [2, 3, 4, 5, 6], y: [10, 10, 10, 10, 10] },
  ])
  const at = (time) => result.grid.findIndex((value) => Math.abs(value - time) < 1e-9)
  assert.equal(result.n[at(1)], 1)
  close(result.mean[at(1)], 0)
  assert.equal(result.n[at(3)], 2)
  close(result.mean[at(3)], 5)
  assert.equal(result.n[at(6)], 1)
  close(result.mean[at(6)], 10)
  assert.equal(result.resampled.length, 2)
})

test("statistics rows average each participant's own figures", () => {
  const averaged = averageStatRows(
    [
      { serie: "P01", count: 10, mean: 3, min: 2, max: 4, std: 0.5, median: 3, baseline: 2.5, peak: 60 },
      { serie: "P02", count: 11, mean: 5, min: 4, max: 6, std: 0.7, median: 5, baseline: null, peak: null },
      null,
    ],
    "Promedio (2 participantes)"
  )
  assert.equal(averaged.row.serie, "Promedio (2 participantes)")
  assert.equal(averaged.row.mean, 4)
  assert.equal(averaged.row.count, 11, "a mean sample count is shown whole")
  assert.equal(averaged.row.baseline, 2.5)
  assert.equal(averaged.n.baseline, 1)
  assert.equal(averaged.n.mean, 2)
  assert.equal(averaged.participants, 2)
  close(averaged.row.std, 0.6)
})

test("records average per key over the records that have it", () => {
  const means = meanByKey([{ a: 1, b: 2 }, { a: 3 }, { a: Number.NaN, b: 4 }])
  assert.deepEqual(means.a, { mean: 2, n: 2 })
  assert.deepEqual(means.b, { mean: 3, n: 2 })
  assert.deepEqual(meanByKey([], ["x"]).x, { mean: null, n: 0 })
})

test("spectra average in linear power even when given in dB", () => {
  const result = meanSpectra(
    [
      { frequency: [1, 2], power: [0, 10] },
      { frequency: [1, 2], power: [10, 10] },
    ],
    { db: true }
  )
  // 0 dB = 1 and 10 dB = 10 in linear power: mean 5.5, back to dB.
  close(result.mean[0], 10 * Math.log10(5.5))
  close(result.mean[1], 10)
  assert.deepEqual(Array.from(result.n), [2, 2])
  assert.ok(result.upper[0] > result.mean[0])
  const linear = meanSpectra([{ frequency: [1, 2], power: [1, 3] }, { frequency: [1, 2], power: [3, 5] }], { db: false })
  assert.deepEqual(Array.from(linear.mean), [2, 4])
})

test("spectra on different frequency axes share a common one", () => {
  const result = meanSpectra(
    [
      { frequency: [0, 1, 2, 3, 4], power: [1, 1, 1, 1, 1] },
      { frequency: [0, 2, 4], power: [3, 3, 3] },
    ],
    { db: false }
  )
  assert.equal(result.frequency[0], 0)
  close(result.frequency[result.frequency.length - 1], 4)
  for (const value of result.mean) close(value, 2)
})

test("grids average cell by cell, skipping missing cells", () => {
  const { mean, n } = meanGrids([
    [[1, 2], [3, Number.NaN]],
    [[3, 4], [5, 6]],
  ])
  assert.deepEqual(mean, [[2, 3], [4, 6]])
  assert.deepEqual(n, [[2, 2], [2, 1]])
  const db = meanGrids([[[0]], [[10]]], { db: true })
  close(db.mean[0][0], 10 * Math.log10(5.5))
})

test("group support follows the plan's table", () => {
  for (const kind of ["pupil", "gaze", "distance", "gsr", "eeg_timeseries"]) {
    assert.deepEqual(GROUP_SUPPORT[kind], { overlay: true, average: true, requiresConcreteScenario: true }, kind)
  }
  assert.equal(groupUnsupportedReason("eeg_psd", "overlay", "all"), null)
  assert.equal(groupUnsupportedReason("pupil", "average", "Escena 1"), null)
  assert.match(groupUnsupportedReason("pupil", "overlay", "all"), /escenario concreto/)
  assert.match(groupUnsupportedReason("heatmap", "average", "all"), /imagen/)
  assert.match(groupUnsupportedReason("eeg_spectrogram", "overlay", "Escena 1"), /Promedio/)
  assert.equal(groupUnsupportedReason("eeg_topography", "average", "Escena 1"), null)
  assert.match(groupUnsupportedReason("scanpath", "average", "Escena 1"), /Superposición/)
  assert.equal(groupUnsupportedReason("scanpath", "overlay", "Escena 1"), null)
  assert.equal(groupUnsupportedReason("aoi", "average", "Escena 1"), null)
  assert.match(groupUnsupportedReason("fixation_histogram", "overlay", "Escena 1"), /un participante a la vez/)
  assert.match(groupUnsupportedReason("fixation_histogram", "average", "all"), /un participante a la vez/)
})

test("participant styles are stable by position and add a dash past eight", () => {
  assert.deepEqual(groupSeriesStyle(0), { color: "var(--group-series-1)", dash: undefined })
  assert.deepEqual(groupSeriesStyle(7), { color: "var(--group-series-8)", dash: undefined })
  assert.equal(groupSeriesStyle(8).color, "var(--group-series-1)")
  assert.ok(groupSeriesStyle(8).dash)
  assert.notEqual(groupSeriesStyle(8).dash, groupSeriesStyle(16).dash)
})
