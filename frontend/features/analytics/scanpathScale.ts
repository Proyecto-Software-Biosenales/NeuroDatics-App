export const DEFAULT_SCANPATH_RADIUS_CAP_MS = 2_000

export const SCANPATH_DURATION_LEGEND = [
  { durationMs: 200, label: "200 ms" },
  { durationMs: 1_000, label: "1 s" },
  { durationMs: 2_000, label: "≥ 2 s" },
] as const

type RadiusScaleLike = {
  cap_ms?: number | null
}

type DurationLike = {
  duration_s: number
}

type ObjectiveDetailsLike = DurationLike & {
  id: number
  t_start: number
  t_end: number
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

export function resolveScanpathRadiusCapMs(
  radiusScale?: RadiusScaleLike | null
): number {
  const capMs = radiusScale?.cap_ms
  return typeof capMs === "number" && Number.isFinite(capMs) && capMs > 0
    ? capMs
    : DEFAULT_SCANPATH_RADIUS_CAP_MS
}

export function scanpathDurationFraction(
  durationS: number,
  capMs: number = DEFAULT_SCANPATH_RADIUS_CAP_MS
): number {
  const safeCapMs =
    Number.isFinite(capMs) && capMs > 0
      ? capMs
      : DEFAULT_SCANPATH_RADIUS_CAP_MS
  const durationMs = finiteNonNegative(durationS) * 1_000
  return Math.min(durationMs / safeCapMs, 1)
}

/**
 * Cohort-independent normalization used by the API contract. Taking the square
 * root makes the resulting circle area, rather than its radius, proportional
 * to fixation duration.
 */
export function scanpathRadiusNorm(
  durationS: number,
  capMs: number = DEFAULT_SCANPATH_RADIUS_CAP_MS
): number {
  return Math.sqrt(scanpathDurationFraction(durationS, capMs))
}

/**
 * Maps duration to radius while preserving a non-zero minimum target. The
 * interpolation is performed between the squared bounds so visible area grows
 * linearly with duration up to the absolute cap.
 */
export function scanpathRadiusForDuration(
  durationS: number,
  minRadius: number,
  maxRadius: number,
  capMs: number = DEFAULT_SCANPATH_RADIUS_CAP_MS
): number {
  const safeMin = finiteNonNegative(minRadius)
  const safeMax = Math.max(safeMin, finiteNonNegative(maxRadius))
  const fraction = scanpathDurationFraction(durationS, capMs)
  return Math.sqrt(
    safeMin ** 2 + fraction * (safeMax ** 2 - safeMin ** 2)
  )
}

export function resolveScanpathTotalDurationS(
  totalDurationS: number | null | undefined,
  objectives: readonly DurationLike[]
): number {
  if (
    typeof totalDurationS === "number" &&
    Number.isFinite(totalDurationS) &&
    totalDurationS >= 0
  ) {
    return totalDurationS
  }

  return objectives.reduce(
    (total, objective) => total + finiteNonNegative(objective.duration_s),
    0
  )
}

function formatEventTime(value: number) {
  return `${finiteNonNegative(value).toFixed(3)} s`
}

export function formatScanpathObjectiveDetails(
  objective: ObjectiveDetailsLike
): string {
  const durationMs = Math.round(finiteNonNegative(objective.duration_s) * 1_000)
  return `Fijación ${objective.id}: ${durationMs} ms; inicio ${formatEventTime(objective.t_start)}; fin ${formatEventTime(objective.t_end)}.`
}
