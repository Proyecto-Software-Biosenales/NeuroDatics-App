/**
 * The pupil view's figures, shared by the individual view and the group
 * modes so both compute them the same way. No runtime imports.
 */

export type PupilEyes = "both" | "left" | "right"

export interface PupilPoint {
  time: number
  /** Raw diameters. */
  left: number
  right: number
  /** Smoothed diameters: the drawn signal and the source of every figure. */
  smooth_left: number
  smooth_right: number
}

export interface PupilSample {
  time: number
  value: number
  rawValue: number
}

export interface PupilStats {
  count: number
  mean: number
  min: number
  max: number
  std: number
  median: number
  baseline: number
  raw_mean: number | null
  raw_min: number | null
  raw_max: number | null
  raw_std: number | null
  raw_median: number | null
  raw_baseline: number | null
}

/** Row shape of `StatisticsTable` (kept structural to stay import-free). */
export interface PupilStatRow {
  serie: string
  count: number | null
  baseline: number | null
  mean: number | null
  std: number | null
  median: number | null
  min: number | null
  max: number | null
  peak: number | null
}

/** A zero or missing diameter is a lost sample, not a value. */
export function isValidPupilValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) return 0
  const position = (percentileValue / 100) * (sortedValues.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedValues[lower]
  const weight = position - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

/** Mean of the values between the 5th and 20th percentiles. */
function robustBaseline(values: number[]): number {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  if (finiteValues.length === 0) return 0
  const sorted = [...finiteValues].sort((a, b) => a - b)
  const low = percentile(sorted, 5)
  const high = percentile(sorted, 20)
  const baselineValues = finiteValues.filter((value) => value >= low && value <= high)
  const source = baselineValues.length > 0 ? baselineValues : finiteValues
  return source.reduce((sum, value) => sum + value, 0) / source.length
}

export function computePupilStats(samples: PupilSample[]): PupilStats | null {
  const values = samples.map((sample) => sample.value).filter((value) => Number.isFinite(value))
  if (values.length === 0) return null

  const rawValues = samples.map((sample) => sample.rawValue).filter((value) => Number.isFinite(value))
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const varianceDivisor = values.length > 1 ? values.length - 1 : values.length
  const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / varianceDivisor)
  const median = values.length % 2 === 0
    ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
    : sorted[Math.floor(values.length / 2)]

  const rawSorted = [...rawValues].sort((a, b) => a - b)
  const rawMean = rawValues.length > 0
    ? rawValues.reduce((sum, value) => sum + value, 0) / rawValues.length
    : null
  const rawVarianceDivisor = rawValues.length > 1 ? rawValues.length - 1 : rawValues.length
  const rawStd = rawValues.length > 0
    ? Math.sqrt(rawValues.reduce((sum, value) => sum + (value - (rawMean ?? 0)) ** 2, 0) / rawVarianceDivisor)
    : null
  const rawMedian = rawValues.length > 0
    ? rawValues.length % 2 === 0
      ? (rawSorted[rawValues.length / 2 - 1] + rawSorted[rawValues.length / 2]) / 2
      : rawSorted[Math.floor(rawValues.length / 2)]
    : null

  return {
    count: values.length,
    mean: roundMetric(mean),
    min: roundMetric(sorted[0]),
    max: roundMetric(sorted[sorted.length - 1]),
    std: roundMetric(std),
    median: roundMetric(median),
    baseline: roundMetric(robustBaseline(values)),
    raw_mean: rawMean != null ? roundMetric(rawMean) : null,
    raw_min: rawValues.length > 0 ? roundMetric(rawSorted[0]) : null,
    raw_max: rawValues.length > 0 ? roundMetric(rawSorted[rawSorted.length - 1]) : null,
    raw_std: rawStd != null ? roundMetric(rawStd) : null,
    raw_median: rawMedian != null ? roundMetric(rawMedian) : null,
    raw_baseline: rawValues.length > 0 ? roundMetric(robustBaseline(rawValues)) : null,
  }
}

/** One point's sample for `eyes`; with both eyes, their mean, or the one that is valid. */
function sampleAt(point: PupilPoint, eyes: PupilEyes): PupilSample | null {
  const leftValid = isValidPupilValue(point.left) && isValidPupilValue(point.smooth_left)
  const rightValid = isValidPupilValue(point.right) && isValidPupilValue(point.smooth_right)
  if (eyes === "left") return leftValid ? { time: point.time, value: point.smooth_left, rawValue: point.left } : null
  if (eyes === "right") return rightValid ? { time: point.time, value: point.smooth_right, rawValue: point.right } : null
  if (leftValid && rightValid) {
    return {
      time: point.time,
      value: (point.smooth_left + point.smooth_right) / 2,
      rawValue: (point.left + point.right) / 2,
    }
  }
  if (leftValid) return { time: point.time, value: point.smooth_left, rawValue: point.left }
  if (rightValid) return { time: point.time, value: point.smooth_right, rawValue: point.right }
  return null
}

/** The valid samples the figures are computed from. */
export function pupilSamples(points: PupilPoint[], eyes: PupilEyes): PupilSample[] {
  return points.flatMap((point) => {
    const sample = sampleAt(point, eyes)
    return sample ? [sample] : []
  })
}

/** The drawn trace for `eyes`: one value per point, NaN where it was lost. */
export function pupilTrace(points: PupilPoint[], eyes: PupilEyes): { time: number[]; value: number[] } {
  return {
    time: points.map((point) => point.time),
    value: points.map((point) => sampleAt(point, eyes)?.value ?? Number.NaN),
  }
}

export function extremePupilSample(samples: PupilSample[], kind: "min" | "max"): PupilSample | null {
  if (samples.length === 0) return null
  return samples.reduce((best, sample) => {
    if (kind === "min") return sample.value < best.value ? sample : best
    return sample.value > best.value ? sample : best
  }, samples[0])
}

/** A statistics-table row; the peak is the maximum's rise over the baseline, in %. */
export function pupilStatRow(serie: string, stats: PupilStats | null): PupilStatRow {
  const peak = stats?.max != null && stats?.baseline != null && stats.baseline !== 0
    ? ((stats.max - stats.baseline) / Math.abs(stats.baseline)) * 100
    : null
  return {
    serie,
    count: stats?.count ?? null,
    baseline: stats?.baseline ?? null,
    mean: stats?.mean ?? null,
    std: stats?.std ?? null,
    median: stats?.median ?? null,
    min: stats?.min ?? null,
    max: stats?.max ?? null,
    peak,
  }
}
