import assert from "node:assert/strict"
import test from "node:test"
import {
  axisTickDecimals,
  EMPTY_ZOOM_HISTORY,
  formatAxisTick,
  normalizeZoomRange,
  popZoom,
  pushZoom,
  sameZoomRange,
  zoomSpan,
  readZoomValue,
  sliceEegPsd,
  sliceEegSpectrogram, percentileColorDomain } from "./chartZoom.ts"

test("reads the dragged x value from a Recharts 3 mouse state", () => {
  assert.equal(readZoomValue({ activeLabel: 1.25 }), 1.25)
  assert.equal(readZoomValue({ activeLabel: "2.5" }), 2.5)
  for (const state of [null, undefined, {}, { activeLabel: "" }, { activeLabel: "x" }, { activeLabel: Infinity }]) {
    assert.equal(readZoomValue(state), null)
  }
})

test("drag ranges are ordered and widened outward so no selected sample is lost", () => {
  assert.deepEqual(normalizeZoomRange(2.3456, 1.2341), { start: 1.234, end: 2.346 })
  assert.deepEqual(normalizeZoomRange(0.1, 0.5, { decimals: 2 }), { start: 0.1, end: 0.5 })
  assert.deepEqual(normalizeZoomRange(-0.4, 1, { min: 0 }), { start: 0, end: 1 })
  assert.equal(normalizeZoomRange(1, 1), null)
  assert.equal(normalizeZoomRange(Number.NaN, 1), null)
  assert.equal(normalizeZoomRange(-2, -1, { min: 0 }), null)
})

test("a zoom needs at least two samples and must leave some out", () => {
  const values = [0, 1, 2, 3, 4]
  assert.deepEqual(zoomSpan(values, { start: 1, end: 3 }), [1, 4])
  assert.deepEqual(zoomSpan(values, { start: 0.5, end: 2.5 }), [1, 3])
  assert.equal(zoomSpan(values, { start: 1.5, end: 2.5 }), null)
  assert.equal(zoomSpan(values, { start: 10, end: 20 }), null)
  assert.equal(zoomSpan(values, { start: -1, end: 4 }), null)
  assert.deepEqual(zoomSpan(values, { start: 0, end: 3.5 }), [0, 4])
})

test("PSD zoom keeps channels aligned with the visible frequencies", () => {
  const data = {
    frequency: [0, 5, 10, 15], channels: ["f3", "f4"], available_channels: ["f3", "f4"],
    sampling_rate_hz: 250, use_db: true, unit: "dB",
    power: { f3: [1, 2, 3, 4], f4: [5, null, 7, 8] },
  }
  assert.equal(sliceEegPsd(data, null), data)
  assert.equal(sliceEegPsd(null, { start: 0, end: 5 }), null)
  assert.equal(sliceEegPsd(data, { start: 6, end: 9 }), data)
  assert.equal(sliceEegPsd(data, { start: 0, end: 15 }), data)
  const zoomed = sliceEegPsd(data, { start: 5, end: 10 })
  assert.deepEqual(zoomed.frequency, [5, 10])
  assert.deepEqual(zoomed.power, { f3: [2, 3], f4: [null, 7] })
  assert.equal(zoomed.unit, "dB")
  assert.deepEqual(data.frequency, [0, 5, 10, 15])
})

test("spectrogram zoom slices every frequency row by time column", () => {
  const data = {
    time: [0, 1, 2, 3], frequency: [0, 5], channels: ["c3"], available_channels: ["c3"],
    sampling_rate_hz: 250, use_db: true, normalize: "none", unit: "dB",
    color_domain: { min: 0, max: 9 },
    power: { c3: [[1, 2, 3, 4], [5, 6, null, 8]] },
  }
  const zoomed = sliceEegSpectrogram(data, { start: 1, end: 2.5 })
  assert.deepEqual(zoomed.time, [1, 2])
  assert.deepEqual(zoomed.frequency, [0, 5])
  assert.deepEqual(zoomed.power, { c3: [[2, 3], [6, null]] })
  // Narrowing the view rescales the colour ramp to what is on screen, with the
  // same 2nd/98th percentiles the backend clips at. Keeping the whole block's
  // limits squeezed the visible part into a fraction of the ramp.
  assert.deepEqual(zoomed.color_domain, percentileColorDomain([2, 3, 6, null]))
  assert.deepEqual(zoomed.color_domain, { min: 2.04, max: 5.88 })
  assert.equal(sliceEegSpectrogram(data, { start: 1.2, end: 1.8 }), data)
})

test("per-channel colour limits are rescaled too, and absent unless requested", () => {
  const data = {
    time: [0, 1, 2, 3], frequency: [0], channels: ["c3", "f3"], available_channels: ["c3", "f3"],
    sampling_rate_hz: 250, use_db: true, normalize: "none", unit: "dB",
    color_domain: { min: 0, max: 100 },
    channel_color_domain: { c3: { min: 0, max: 9 }, f3: { min: 0, max: 99 } },
    power: { c3: [[1, 2, 3, 4]], f3: [[10, 20, 30, 40]] },
  }
  const zoomed = sliceEegSpectrogram(data, { start: 1, end: 2.5 })
  assert.deepEqual(zoomed.channel_color_domain.c3, percentileColorDomain([2, 3]))
  assert.deepEqual(zoomed.channel_color_domain.f3, percentileColorDomain([20, 30]))
  assert.equal(sliceEegSpectrogram({ ...data, channel_color_domain: undefined },
    { start: 1, end: 2.5 }).channel_color_domain, undefined)
})

test("percentile colour limits ignore missing windows and survive a flat matrix", () => {
  assert.equal(percentileColorDomain([]), null)
  assert.equal(percentileColorDomain([null, undefined, NaN]), null)
  assert.deepEqual(percentileColorDomain([7]), { min: 7, max: 7 })
  assert.deepEqual(percentileColorDomain([0, 10], 0, 100), { min: 0, max: 10 })
})

test("nested zooms step back one level at a time before the full view", () => {
  const first = { start: 10, end: 50 }
  const second = { start: 20, end: 30 }
  const third = { start: 22, end: 24 }
  const once = pushZoom(EMPTY_ZOOM_HISTORY, first, sameZoomRange)
  assert.deepEqual(once, { current: first, previous: [] })
  const twice = pushZoom(once, second, sameZoomRange)
  assert.deepEqual(twice, { current: second, previous: [first] })
  const thrice = pushZoom(twice, third, sameZoomRange)
  assert.deepEqual(thrice, { current: third, previous: [first, second] })
  assert.deepEqual(twice.previous, [first])

  // Re-entering the level on screen adds no step to go back through.
  assert.equal(pushZoom(twice, { start: 20, end: 30 }, sameZoomRange), twice)

  assert.deepEqual(popZoom(thrice), twice)
  assert.deepEqual(popZoom(twice), once)
  assert.deepEqual(popZoom(once), EMPTY_ZOOM_HISTORY)
  assert.deepEqual(popZoom(EMPTY_ZOOM_HISTORY), EMPTY_ZOOM_HISTORY)
})

test("zoom ranges compare by bounds, including open window edges", () => {
  assert.equal(sameZoomRange({ start: 1, end: 2 }, { start: 1, end: 2 }), true)
  assert.equal(sameZoomRange({ start: 1, end: null }, { start: 1, end: null }), true)
  assert.equal(sameZoomRange({ start: 1, end: null }, { start: 1, end: 2 }), false)
})

test("axis ticks gain decimals as the visible span shrinks", () => {
  assert.equal(axisTickDecimals([0, 120]), 0)
  assert.equal(axisTickDecimals([10, 15]), 1)
  assert.equal(axisTickDecimals([10, 10.5]), 2)
  assert.equal(axisTickDecimals([10, 10.05]), 3)
  assert.equal(axisTickDecimals(["dataMin", "dataMax"]), 0)
  assert.equal(formatAxisTick(10.25, 1), "10.3")
  assert.equal(formatAxisTick("x", 1), "")
})
