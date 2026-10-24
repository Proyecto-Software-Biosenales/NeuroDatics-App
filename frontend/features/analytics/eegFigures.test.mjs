import assert from "node:assert/strict"
import test from "node:test"
import {
  averageFigures,
  psdSeriesStats,
  psdSummary,
  spectrogramStatsOf,
  spectrogramSummary,
  topographyFrameStats,
  topographyRowsOf,
} from "./eegPresentation.ts"

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)

test("a PSD line's row finds its first highest value and skips gaps", () => {
  const row = psdSeriesStats("f3", [1, 2, 3, 4], [-3, null, 5, 5])
  assert.equal(row.count, 3)
  assert.equal(row.peakFrequency, 3)
  assert.equal(row.peakPower, 5)
  close(row.mean, 7 / 3)
  assert.equal(psdSeriesStats("f3", [1], [null]), null)
})

test("the PSD cards take the highest peak and the mean of every visible value", () => {
  const power = { f3: [1, 4], c3: [2, 3] }
  const stats = ["f3", "c3"].map((channel) => psdSeriesStats(channel, [1, 2], power[channel]))
  assert.deepEqual(psdSummary(stats, power), { peakFrequency: 2, peakPower: 4, meanPower: 2.5 })
  assert.deepEqual(psdSummary([], power), { peakFrequency: null, peakPower: null, meanPower: null })
})

test("spectrogram statistics pool every matrix given and locate the peak", () => {
  const frequency = [5, 10]
  const time = [0, 1, 2]
  const one = spectrogramStatsOf("c3", frequency, time, [[[1, 2, 3], [4, null, 0]]])
  assert.equal(one.peakFrequency, 10)
  assert.equal(one.peakTime, 0)
  assert.equal(one.peakPower, 4)
  assert.equal(one.minPower, 0)
  assert.equal(one.frequencyBins, 2)
  assert.equal(one.timeBins, 3)
  const pooled = spectrogramStatsOf("P01", frequency, time, [[[1, 2, 3]], [[0, 9, 1]]])
  assert.equal(pooled.peakPower, 9)
  assert.equal(pooled.peakTime, 1)
  close(pooled.meanPower, 16 / 6)
  assert.equal(spectrogramStatsOf("x", frequency, time, [[[null]]]), null)
  assert.deepEqual(spectrogramSummary({ channels: ["c3"], frequency, power: { c3: [[1, 3], [null, 2]] } }), {
    maxPower: 3, meanPower: 2, maxFrequency: 10,
  })
  assert.deepEqual(spectrogramSummary(null), { maxPower: null, meanPower: null, maxFrequency: null })
})

test("topography rows keep electrodes with a position and a value, turned like the head", () => {
  const rows = topographyRowsOf(["f3", "f4", "c3"], { f3: [-0.5, 0.5], f4: [0.5, 0.5] }, (channel) => ({ f3: 2, f4: Number.NaN, c3: 1 })[channel])
  assert.deepEqual(rows, [{ channel: "f3", value: 2, x: 0.5, y: 0.5 }])
  const stats = topographyFrameStats(
    [{ channel: "f3", value: 2, x: 0, y: 0 }, { channel: "c3", value: 6, x: 0, y: 0 }],
    1.5
  )
  assert.equal(stats.frameTime, 1.5)
  assert.equal(stats.meanPower, 4)
  assert.equal(stats.strongest.channel, "c3")
  assert.equal(topographyFrameStats([], null).meanPower, null)
})

test("group figures average each participant's own figure; dB levels in linear power", () => {
  const average = averageFigures(
    [{ count: 3, level: 0, frequency: 10 }, null, { count: 4, level: 10, frequency: null }, { frequency: 12 }],
    ["count", "level", "frequency"],
    { db: ["level"], round: ["count"] }
  )
  assert.equal(average.values.count, 4)
  close(average.values.level, 10 * Math.log10(5.5))
  assert.equal(average.values.frequency, 11)
  assert.deepEqual(average.n, { count: 2, level: 2, frequency: 2 })
  assert.equal(average.participants, 3)
  const none = averageFigures([null], ["level"])
  assert.equal(none.values.level, null)
  assert.equal(none.participants, 0)
})
