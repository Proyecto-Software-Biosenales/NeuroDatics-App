import assert from "node:assert/strict"
import test from "node:test"
import { meanKeyedSeries, meanSpectrograms } from "./aggregate.ts"

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const db = (linear) => 10 * Math.log10(linear)

test("spectrograms are averaged cell by cell in linear power, never in dB", () => {
  const frequency = [1, 2]
  const time = [0, 1, 2]
  const a = { time, frequency, power: { f3: [[0, 0, 0], [10, 10, 10]] } }
  const b = { time, frequency, power: { f3: [[10, 10, null], [20, 20, 20]] } }
  const mean = meanSpectrograms([a, b], ["f3"], { db: true })
  assert.deepEqual(Array.from(mean.time), time)
  assert.deepEqual(Array.from(mean.frequency), frequency)
  // 0 dB and 10 dB are 1 and 10 in linear power: mean 5.5, not 5 dB.
  close(mean.mean.f3[0][0], db(5.5))
  close(mean.mean.f3[1][1], db(55))
  // A missing cell does not count as zero.
  assert.equal(mean.mean.f3[0][2], 0)
  assert.equal(mean.n.f3[0][2], 1)
  assert.equal(mean.n.f3[1][2], 2)
})

test("spectrograms on different time axes meet on one common stimulus-time grid", () => {
  const a = { time: [0, 1, 2, 3], frequency: [5], power: { c3: [[1, 1, 1, 1]] } }
  const b = { time: [1, 2, 3, 4], frequency: [5], power: { c3: [[3, 3, 3, 3]] } }
  const mean = meanSpectrograms([a, b], ["c3"], { db: false })
  assert.deepEqual(Array.from(mean.time), [0, 1, 2, 3, 4])
  // Each end has one participant only: nothing is extrapolated.
  assert.deepEqual(mean.mean.c3[0], [1, 2, 2, 2, 3])
  assert.deepEqual(mean.n.c3[0], [1, 2, 2, 2, 1])
})

test("spectrograms on different frequency axes are resampled along frequency too", () => {
  const a = { time: [0, 1], frequency: [0, 2, 4], power: { p3: [[0, 0], [2, 2], [4, 4]] } }
  const b = { time: [0, 1], frequency: [0, 4], power: { p3: [[0, 0], [8, 8]] } }
  const mean = meanSpectrograms([a, b], ["p3"], { db: false, maxFrequencyPoints: 3 })
  assert.deepEqual(Array.from(mean.frequency), [0, 2, 4])
  // b at 2 Hz interpolates to 4; the mean with a's 2 is 3.
  assert.deepEqual(mean.mean.p3[1], [3, 3])
  assert.deepEqual(mean.mean.p3[2], [6, 6])
})

test("a key missing in one spectrogram is averaged over the others only", () => {
  const time = [0, 1]
  const frequency = [1]
  const mean = meanSpectrograms(
    [{ time, frequency, power: { f3: [[2, 2]] } }, { time, frequency, power: { f4: [[6, 6]] } }],
    ["f3", "f4", "le"],
    { db: false }
  )
  assert.deepEqual(mean.mean.f3[0], [2, 2])
  assert.deepEqual(mean.mean.f4[0], [6, 6])
  assert.deepEqual(mean.mean.le, [])
  assert.equal(meanSpectrograms([], ["f3"], { db: true }).time.length, 0)
})

test("keyed series share one grid and keep each input resampled on it", () => {
  const result = meanKeyedSeries(
    [
      { time: [1, 2, 3], values: { f3: [1, 2, 3], c3: [10, null, 30] } },
      { time: [2, 3, 4], values: { f3: [3, 4, 5] } },
    ],
    ["f3", "c3"]
  )
  assert.deepEqual(Array.from(result.grid), [1, 2, 3, 4])
  const at = (value) => Array.from(result.grid).indexOf(value)
  close(result.mean.f3[at(2)], 2.5)
  assert.equal(result.n.f3[at(2)], 2)
  // Only the first input reaches 1 s and only the second 4 s.
  assert.equal(result.n.f3[at(1)], 1)
  assert.equal(result.mean.f3[at(4)], 5)
  // The first input's c3 gap is never bridged, and the second has no c3.
  assert.ok(Number.isNaN(result.mean.c3[at(2)]))
  assert.equal(result.mean.c3[at(1)], 10)
  assert.equal(result.resampled.c3.length, 2)
  assert.ok(result.resampled.c3[1].every(Number.isNaN))
  assert.equal(result.resampled.f3[1][at(2)], 3)
  assert.ok(Number.isNaN(result.resampled.f3[1][at(1)]))
})
