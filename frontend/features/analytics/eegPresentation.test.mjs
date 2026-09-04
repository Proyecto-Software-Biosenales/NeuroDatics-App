import assert from "node:assert/strict"
import test from "node:test"
import {
  baseline, buildStats, finiteValues, formatChannel, formatNumber, hexToRgb,
  interpolateColor, interpolateTopographyValue, mean, median, peakPercent,
  readClickedTime, rotateTopographyPositionClockwise, scaleSpectrogramValue,
  std, VIRIDIS_GRADIENT,
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

test("baseline and peak statistics preserve the existing 5 to 20 percent window", () => {
  assert.equal(baseline([]), 0)
  assert.equal(baseline([5]), 5)
  assert.equal(baseline(Array.from({ length: 20 }, (_, i) => i + 1)), 3)
  assert.equal(peakPercent(10, 0), null)
  assert.equal(peakPercent(10, NaN), null)
  assert.equal(peakPercent(10, -5), 300)
  assert.equal(buildStats("f3", []), null)
  assert.deepEqual(buildStats("f3", [1, 2, 3]), {
    channel: "f3", count: 3, mean: 2, std: 1, median: 2,
    min: 1, max: 3, baseline: 1, peakPercent: 200,
  })
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


