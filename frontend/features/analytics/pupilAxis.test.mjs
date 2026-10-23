import assert from "node:assert/strict"
import test from "node:test"
import { pupilAxis } from "./pupilAxis.ts"

test("the full scale starts at zero and stops at the first whole millimetre above the peak", () => {
  assert.deepEqual(pupilAxis([2.2, 4.03, 5.15]), { domain: [0, 6], ticks: [0, 1, 2, 3, 4, 5, 6], decimals: 0 })
  // A peak just under a whole value keeps some room above it.
  assert.deepEqual(pupilAxis([3, 5.95])?.domain, [0, 7])
})

test("wide ranges space the ticks so the axis stays readable", () => {
  assert.deepEqual(pupilAxis([1, 12.5]), { domain: [0, 14], ticks: [0, 2, 4, 6, 8, 10, 12, 14], decimals: 0 })
})

test("missing samples are ignored and an empty series has no axis", () => {
  assert.deepEqual(pupilAxis([0, Number.NaN, 3.5, -1, 4.2])?.domain, [0, 5])
  assert.equal(pupilAxis([]), null)
  assert.equal(pupilAxis([0, Number.NaN]), null)
})
