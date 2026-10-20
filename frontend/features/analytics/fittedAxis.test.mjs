import assert from "node:assert/strict"
import test from "node:test"
import { fittedAxis, fittedYAxisProps } from "./fittedAxis.ts"

test("the axis brackets the values with round ticks instead of starting at zero", () => {
  assert.deepEqual(fittedAxis([58.3, 61.2, 64.9]), { domain: [58, 66], ticks: [58, 60, 62, 64, 66], decimals: 0 })
  assert.deepEqual(fittedAxis([1.234, 1.48]), { domain: [1.2, 1.5], ticks: [1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5], decimals: 2 })
  assert.deepEqual(fittedAxis([31, 47.5]), { domain: [30, 50], ticks: [30, 35, 40, 45, 50], decimals: 0 })
})

test("negative values, as in decibels, are kept", () => {
  assert.deepEqual(fittedAxis([-12.5, 3.1])?.domain, [-15, 5])
})

test("flat data gets a band around it", () => {
  assert.deepEqual(fittedAxis([60, 60]), { domain: [58, 62], ticks: [58, 60, 62], decimals: 0 })
  assert.deepEqual(fittedAxis([0, 0])?.domain, [-0.02, 0.02])
})

test("missing samples are ignored and an empty series has no axis", () => {
  assert.deepEqual(fittedAxis([null, 40, Number.NaN, undefined, 45])?.domain, [40, 45])
  assert.equal(fittedAxis([]), null)
  assert.equal(fittedAxis([null, Number.NaN]), null)
})

test("without an axis the chart keeps its default scale", () => {
  assert.deepEqual(fittedYAxisProps(null), {})
  const props = fittedYAxisProps(fittedAxis([1.234, 1.48]))
  assert.equal(props.allowDataOverflow, true)
  assert.equal(props.tickFormatter(1.3), "1.30")
})
