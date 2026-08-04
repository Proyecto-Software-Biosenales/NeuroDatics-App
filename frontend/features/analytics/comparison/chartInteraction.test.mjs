import assert from "node:assert/strict"
import test from "node:test"
import { resolveClickedPoint } from "./chartInteraction.ts"

const data = [
  { time: 0, sourceTime: 100, value: 1 },
  { time: 0.25, sourceTime: 100.25, value: 2 },
  { time: 0.5, sourceTime: 100.5, value: 3 },
]

test("resolves the original point from a Recharts 3 click state", () => {
  assert.equal(
    resolveClickedPoint(data, {
      activeLabel: 0.25,
      activeTooltipIndex: "1",
      isTooltipActive: true,
    }),
    data[1]
  )
})

test("uses the nearest original point and preserves its source timestamp", () => {
  assert.deepEqual(resolveClickedPoint(data, { activeLabel: 0.48 }), data[2])
})

test("falls back to the Recharts 3 tooltip index", () => {
  assert.equal(resolveClickedPoint(data, { activeTooltipIndex: "2" }), data[2])
  assert.equal(resolveClickedPoint(data, { activeIndex: 1 }), data[1])
})

test("keeps compatibility with the Recharts 2 payload shape", () => {
  assert.equal(
    resolveClickedPoint(data, {
      activePayload: [{ payload: data[0] }],
    }),
    data[0]
  )
})

test("ignores incomplete chart clicks", () => {
  assert.equal(resolveClickedPoint(data, {}), null)
  assert.equal(resolveClickedPoint([], { activeLabel: 0 }), null)
})
