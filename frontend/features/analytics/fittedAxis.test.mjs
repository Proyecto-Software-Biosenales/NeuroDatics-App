import assert from "node:assert/strict"
import test from "node:test"
import { fittedAxis, fittedYAxisProps } from "./fittedAxis.ts"

test("the axis hugs the values one decimal out, with the round ticks inside", () => {
  assert.deepEqual(fittedAxis([58.3, 61.2, 64.9]), { domain: [58.2, 65], ticks: [60, 62, 64], decimals: 0 })
  assert.deepEqual(fittedAxis([1.234, 1.48]), { domain: [1.23, 1.49], ticks: [1.25, 1.3, 1.35, 1.4, 1.45], decimals: 2 })
  assert.deepEqual(fittedAxis([31, 47.5]), { domain: [30, 48], ticks: [30, 35, 40, 45], decimals: 0 })
  // A pupil in millimetres: one decimal, not the nearest whole millimetre.
  assert.deepEqual(fittedAxis([2.9, 3.98])?.domain, [2.8, 4])
})

test("a value on the rounding boundary still leaves a small margin", () => {
  const { domain } = fittedAxis([3.1, 5.5])
  assert.deepEqual(domain, [3, 5.6])
})

test("negative values, as in decibels, are kept", () => {
  assert.deepEqual(fittedAxis([-12.5, 3.1])?.domain, [-13, 4])
})

test("flat data gets a band around it", () => {
  assert.deepEqual(fittedAxis([60, 60]), { domain: [56.9, 63.1], ticks: [58, 60, 62], decimals: 0 })
  assert.deepEqual(fittedAxis([0, 0])?.domain, [-0.06, 0.06])
})

test("missing samples are ignored and an empty series has no axis", () => {
  assert.deepEqual(fittedAxis([null, 40, Number.NaN, undefined, 45])?.domain, [39.9, 45.1])
  assert.equal(fittedAxis([]), null)
  assert.equal(fittedAxis([null, Number.NaN]), null)
})

test("without an axis the chart keeps its default scale", () => {
  assert.deepEqual(fittedYAxisProps(null), {})
  const props = fittedYAxisProps(fittedAxis([1.234, 1.48]))
  assert.equal(props.allowDataOverflow, true)
  assert.equal(props.tickFormatter(1.3), "1.30")
})
