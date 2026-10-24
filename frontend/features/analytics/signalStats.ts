/**
 * Statistics table rows of the gaze, distance and GSR views, built from the
 * figures the statistics endpoints return. Shared by each view and by its
 * «Superposición» / «Promedio» table, so both show the same figures.
 */

import type { StatRow } from "./components/StatisticsTable"
import type { GazeStatistics } from "./types"

export interface SignalStatistics {
  mean: number
  baseline: number
  std: number
  median: number
  min: number
  max: number
}

/** Rise of the maximum over the baseline, in percent; null without a usable baseline. */
export function peakPercent(max: number | null | undefined, baseline: number | null | undefined): number | null {
  return max != null && baseline != null && baseline !== 0 ? ((max - baseline) / Math.abs(baseline)) * 100 : null
}

/** One table row: `stats` from the server, `count` the drawn samples (0 shows as «—»). */
export function signalStatRow(serie: string, stats: SignalStatistics | null | undefined, count: number | null): StatRow {
  return {
    serie,
    count: count || null,
    baseline: stats?.baseline ?? null,
    mean: stats?.mean ?? null,
    std: stats?.std ?? null,
    median: stats?.median ?? null,
    min: stats?.min ?? null,
    max: stats?.max ?? null,
    peak: peakPercent(stats?.max, stats?.baseline),
  }
}

export type GazeAxis = "x" | "y"

/** The figures of one gaze axis. */
export function gazeAxisStatistics(stats: GazeStatistics | null | undefined, axis: GazeAxis): SignalStatistics | null {
  if (!stats) return null
  return axis === "x"
    ? { mean: stats.gx_mean, baseline: stats.gx_baseline, std: stats.gx_std, median: stats.gx_median, min: stats.gx_min, max: stats.gx_max }
    : { mean: stats.gy_mean, baseline: stats.gy_baseline, std: stats.gy_std, median: stats.gy_median, min: stats.gy_min, max: stats.gy_max }
}
