import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_SCANPATH_RADIUS_CAP_MS,
  SCANPATH_DURATION_LEGEND,
  formatScanpathObjectiveDetails,
  resolveScanpathRadiusCapMs,
  resolveScanpathTotalDurationS,
  scanpathRadiusForDuration,
  scanpathRadiusNorm,
} from "./scanpathScale.ts"

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  )

test("uses one absolute area scale from zero through the two-second cap", () => {
  const minRadius = 12
  const maxRadius = 40

  assert.equal(scanpathRadiusForDuration(0, minRadius, maxRadius), minRadius)
  near(
    scanpathRadiusForDuration(0.2, minRadius, maxRadius),
    Math.sqrt(minRadius ** 2 + 0.1 * (maxRadius ** 2 - minRadius ** 2))
  )
  near(
    scanpathRadiusForDuration(1, minRadius, maxRadius),
    Math.sqrt(minRadius ** 2 + 0.5 * (maxRadius ** 2 - minRadius ** 2))
  )
  assert.equal(scanpathRadiusForDuration(2, minRadius, maxRadius), maxRadius)
  assert.equal(scanpathRadiusForDuration(8, minRadius, maxRadius), maxRadius)
})

test("normalization is cohort-independent and area-proportional", () => {
  const duration = 0.5
  const participantOneDurations = [0.2, duration, 6]
  const participantTwoDurations = [duration, 0.55]

  const one = participantOneDurations.map((value) => scanpathRadiusNorm(value))[1]
  const two = participantTwoDurations.map((value) => scanpathRadiusNorm(value))[0]

  assert.equal(one, two)
  assert.equal(one, Math.sqrt(0.25))
})

test("invalid duration and scale inputs use safe minimum and cap defaults", () => {
  assert.equal(DEFAULT_SCANPATH_RADIUS_CAP_MS, 2_000)
  assert.equal(resolveScanpathRadiusCapMs(undefined), 2_000)
  assert.equal(resolveScanpathRadiusCapMs({ cap_ms: 0 }), 2_000)
  assert.equal(resolveScanpathRadiusCapMs({ cap_ms: Number.NaN }), 2_000)
  assert.equal(resolveScanpathRadiusCapMs({ cap_ms: 1_500 }), 1_500)
  assert.equal(scanpathRadiusForDuration(-1, 10, 28), 10)
  assert.equal(scanpathRadiusForDuration(Number.NaN, 10, 28), 10)
})

test("exposes the fixed legend values", () => {
  assert.deepEqual(SCANPATH_DURATION_LEGEND, [
    { durationMs: 200, label: "200 ms" },
    { durationMs: 1_000, label: "1 s" },
    { durationMs: 2_000, label: "≥ 2 s" },
  ])
})

test("uses API total dwell when present and sums valid objectives as fallback", () => {
  const objectives = [
    { duration_s: 0.2 },
    { duration_s: 0.75 },
    { duration_s: -1 },
    { duration_s: Number.NaN },
  ]

  assert.equal(resolveScanpathTotalDurationS(1.5, objectives), 1.5)
  assert.equal(resolveScanpathTotalDurationS(undefined, objectives), 0.95)
})

test("node details retain uncapped duration and exact event times", () => {
  assert.equal(
    formatScanpathObjectiveDetails({
      id: 7,
      duration_s: 2.345,
      t_start: 1.125,
      t_end: 3.47,
    }),
    "Fijación 7: 2345 ms; inicio 1.125 s; fin 3.470 s."
  )
})
