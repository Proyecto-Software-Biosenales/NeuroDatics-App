/**
 * Pure numeric helpers for «Superposición» and «Promedio». No runtime imports,
 * so `node --test` runs this file directly (same rule as timeAlignment.ts).
 *
 * Every function skips non-finite values instead of treating them as zero, and
 * reports how many participants contributed (`n`) wherever a mean is taken.
 * A line breaks only where the time between valid samples says the signal was
 * lost (`holeThreshold`), never at a single missing sample.
 */

/** A grid never has more points than this, whatever the participants' rates. */
export const MAX_GRID_POINTS = 2000

/**
 * A gap wider than this many regular steps is a hole, never interpolated.
 * See `holeThreshold` for what a regular step is.
 */
export const GAP_FACTOR = 3

/**
 * The step quantile that stands for a trace's regular spacing when deciding
 * holes. Drawn traces keep each bucket's first, last, minimum and maximum, so
 * their valid samples sit unevenly inside a bucket: most steps are short, and
 * the longest ordinary ones reach most of a bucket's width. A real loss of
 * tracking empties whole buckets and is longer than all of them.
 */
const REGULAR_STEP_QUANTILE = 0.9

export interface Trace {
  /** Ascending sample times (or frequencies). */
  x: ArrayLike<number>
  /**
   * Values; NaN marks a missing sample. A missing sample alone never breaks
   * the line: only a gap in time between valid samples does.
   */
  y: ArrayLike<number>
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * The valid samples of a trace, in order: finite time and finite value.
 * Missing values are dropped here, so whether the line continues across them
 * depends only on how far apart the remaining samples are.
 */
function cleanTrace(trace: Trace): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  const length = Math.min(trace.x.length, trace.y.length)
  for (let index = 0; index < length; index += 1) {
    const time = trace.x[index]
    const value = trace.y[index]
    if (!isFiniteNumber(time) || !isFiniteNumber(value)) continue
    // Out-of-order or repeated times are dropped rather than reordered: the API returns sorted axes.
    if (x.length && time <= x[x.length - 1]) continue
    x.push(time)
    y.push(value)
  }
  return { x, y }
}

/** Positive steps between consecutive finite values, with the first and last value and their count. */
function stepsOf(x: ArrayLike<number>): { steps: number[]; first: number; last: number; count: number } {
  const steps: number[] = []
  let first = Number.NaN
  let last = Number.NaN
  let count = 0
  let previous = Number.NaN
  for (let index = 0; index < x.length; index += 1) {
    const value = x[index]
    if (!isFiniteNumber(value)) continue
    if (count === 0) first = value
    else if (value > previous) steps.push(value - previous)
    previous = value
    last = value
    count += 1
  }
  return { steps, first, last, count }
}

/**
 * The trace's typical spacing: the median step, but never below the average
 * spacing. Drawn traces keep each bucket's extremes at uneven times, and two
 * neighbouring samples there must not make the ordinary bucket width look
 * like a hole. The common grid is built at this spacing.
 */
export function typicalStep(x: ArrayLike<number>): number {
  const { steps, first, last, count } = stepsOf(x)
  if (count < 2 || steps.length === 0) return Number.NaN
  return Math.max(median(steps), (last - first) / (count - 1))
}

/**
 * The widest gap between valid samples still drawn as one line: GAP_FACTOR
 * times the regular step, which is the typical step or the 90th percentile of
 * the steps, whichever is larger. An isolated missing sample, or the uneven
 * spacing inside a drawn bucket, stays below it; a loss of tracking that
 * empties whole buckets goes above it. Pass the valid samples' times.
 */
export function holeThreshold(x: ArrayLike<number>): number {
  const { steps, first, last, count } = stepsOf(x)
  if (count < 2 || steps.length === 0) return Number.NaN
  const sorted = [...steps].sort((a, b) => a - b)
  const regular = sorted[Math.floor(REGULAR_STEP_QUANTILE * (sorted.length - 1))]
  return GAP_FACTOR * Math.max(median(steps), (last - first) / (count - 1), regular)
}

/**
 * Values of `trace` on `grid` by linear interpolation between its valid
 * samples. Outside the valid samples' range, or across a gap wider than
 * `holeThreshold`, the result is NaN: nothing is extrapolated and a real loss
 * of signal is never bridged, while isolated missing samples are.
 */
export function resampleTrace(trace: Trace, grid: ArrayLike<number>): Float64Array {
  const out = new Float64Array(grid.length).fill(Number.NaN)
  const { x, y } = cleanTrace(trace)
  if (x.length === 0) return out
  const maxGap = x.length > 1 ? holeThreshold(x) : 0
  let cursor = 0
  for (let index = 0; index < grid.length; index += 1) {
    const time = grid[index]
    if (!isFiniteNumber(time) || time < x[0] || time > x[x.length - 1]) continue
    // Grids are ascending, so the cursor only moves forward.
    while (cursor < x.length - 1 && x[cursor + 1] <= time) cursor += 1
    if (x[cursor] === time) {
      out[index] = y[cursor]
      continue
    }
    const next = cursor + 1
    if (next >= x.length) continue
    const span = x[next] - x[cursor]
    if (!(span > 0) || span > maxGap) continue
    out[index] = y[cursor] + ((y[next] - y[cursor]) * (time - x[cursor])) / span
  }
  return out
}

/**
 * A common, evenly spaced grid covering every trace: from the earliest start
 * to the latest end, at the median of the traces' typical steps, and never
 * more than `maxPoints` points.
 */
export function commonGrid(traces: readonly Trace[], maxPoints = MAX_GRID_POINTS): Float64Array {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  const steps: number[] = []
  for (const trace of traces) {
    const { x } = cleanTrace(trace)
    if (x.length === 0) continue
    start = Math.min(start, x[0])
    end = Math.max(end, x[x.length - 1])
    const step = typicalStep(x)
    if (Number.isFinite(step) && step > 0) steps.push(step)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return new Float64Array(0)
  if (end === start) return Float64Array.of(start)
  const limit = Math.max(2, Math.floor(maxPoints))
  const span = end - start
  const wanted = steps.length ? median(steps) : span
  // Both ends are always grid points; the step only shrinks to fit them.
  const count = Math.max(2, Math.min(limit, Math.ceil(span / wanted - 1e-9) + 1))
  const step = span / (count - 1)
  const grid = new Float64Array(count)
  for (let index = 0; index < count; index += 1) grid[index] = index === count - 1 ? end : start + index * step
  return grid
}

export interface PointwiseSummary {
  mean: Float64Array
  /** Sample standard deviation (n − 1); NaN where fewer than two values. */
  sd: Float64Array
  n: Uint16Array
}

/** Mean, sample SD and count at each index over columns of equal length. */
export function summarize(columns: ReadonlyArray<ArrayLike<number>>, length?: number): PointwiseSummary {
  const size = length ?? (columns[0]?.length ?? 0)
  const mean = new Float64Array(size).fill(Number.NaN)
  const sd = new Float64Array(size).fill(Number.NaN)
  const n = new Uint16Array(size)
  for (let index = 0; index < size; index += 1) {
    let count = 0
    let sum = 0
    for (const column of columns) {
      const value = column[index]
      if (!isFiniteNumber(value)) continue
      count += 1
      sum += value
    }
    if (count === 0) continue
    const average = sum / count
    mean[index] = average
    n[index] = count
    if (count < 2) continue
    let squares = 0
    for (const column of columns) {
      const value = column[index]
      if (isFiniteNumber(value)) squares += (value - average) ** 2
    }
    sd[index] = Math.sqrt(squares / (count - 1))
  }
  return { mean, sd, n }
}

export interface GridAggregate extends PointwiseSummary {
  grid: Float64Array
  /** Each trace resampled on `grid`, in input order. */
  resampled: Float64Array[]
}

/** Resample every trace on one common grid and summarize them point by point. */
export function aggregateTraces(traces: readonly Trace[], maxPoints = MAX_GRID_POINTS): GridAggregate {
  const grid = commonGrid(traces, maxPoints)
  const resampled = traces.map((trace) => resampleTrace(trace, grid))
  return { grid, resampled, ...summarize(resampled, grid.length) }
}

export interface KeyedMean {
  mean: number | null
  /** Records that had a finite value for this key. */
  n: number
}

/**
 * Per-key mean over records. Only records with a finite value for a key count
 * toward that key. `keys` defaults to every key seen in any record.
 */
export function meanByKey<K extends string>(
  records: ReadonlyArray<Partial<Record<K, unknown>>>,
  keys?: readonly K[]
): Record<K, KeyedMean> {
  const fields = keys ?? ([...new Set(records.flatMap((record) => Object.keys(record)))] as K[])
  const result = {} as Record<K, KeyedMean>
  for (const key of fields) {
    let sum = 0
    let count = 0
    for (const record of records) {
      const value = record[key]
      if (!isFiniteNumber(value)) continue
      sum += value
      count += 1
    }
    result[key] = { mean: count ? sum / count : null, n: count }
  }
  return result
}

/** The numeric fields of a statistics row (`StatisticsTable`'s `StatRow`). */
export const STAT_FIELDS = ["count", "baseline", "mean", "std", "median", "min", "max", "peak"] as const
export type StatField = (typeof STAT_FIELDS)[number]
export type StatRowLike = { serie: string } & Partial<Record<StatField, number | null | undefined>>

export interface AveragedStatRow {
  row: { serie: string } & Record<StatField, number | null>
  /** Participants that contributed to each field. */
  n: Record<StatField, number>
  /** Participants with at least one finite field. */
  participants: number
}

/**
 * The «Promedio» row: each field is the mean, over participants, of that
 * participant's own figure. The sample count is rounded to a whole number.
 */
export function averageStatRows(rows: readonly (StatRowLike | null | undefined)[], serie: string): AveragedStatRow {
  const present = rows.filter((row): row is StatRowLike => row != null)
  const means = meanByKey<StatField>(present, STAT_FIELDS)
  const row = { serie } as AveragedStatRow["row"]
  const n = {} as Record<StatField, number>
  for (const field of STAT_FIELDS) {
    const value = means[field].mean
    row[field] = value == null ? null : field === "count" ? Math.round(value) : value
    n[field] = means[field].n
  }
  const participants = present.filter((item) => STAT_FIELDS.some((field) => isFiniteNumber(item[field]))).length
  return { row, n, participants }
}

export interface Spectrum {
  frequency: ArrayLike<number>
  power: ArrayLike<number>
}

export interface SpectrumMean {
  frequency: Float64Array
  /** In the input's unit (dB when `db`). */
  mean: Float64Array
  /** Mean ± 1 SD, computed in linear power and converted like `mean`. */
  lower: Float64Array
  upper: Float64Array
  n: Uint16Array
}

const fromDb = (value: number) => 10 ** (value / 10)
const toDb = (value: number) => (value > 0 ? 10 * Math.log10(value) : Number.NaN)

function sameAxis(axes: ReadonlyArray<ArrayLike<number>>): boolean {
  const first = axes[0]
  return axes.every((axis) => axis.length === first.length && Array.prototype.every.call(axis, (value: number, index: number) => value === first[index]))
}

/**
 * Mean power spectrum. Power is always averaged in linear units: dB spectra
 * are converted to linear, averaged, and converted back. Spectra on different
 * frequency axes are first resampled on a common one.
 */
export function meanSpectra(spectra: readonly Spectrum[], options: { db: boolean; maxPoints?: number }): SpectrumMean {
  const usable = spectra.filter((spectrum) => spectrum.frequency.length > 0)
  if (usable.length === 0) {
    const empty = new Float64Array(0)
    return { frequency: empty, mean: empty, lower: empty, upper: empty, n: new Uint16Array(0) }
  }
  const linear = (spectrum: Spectrum): Trace => ({
    x: spectrum.frequency,
    y: Array.from({ length: spectrum.power.length }, (_, index) => {
      const value = spectrum.power[index]
      return isFiniteNumber(value) ? (options.db ? fromDb(value) : value) : Number.NaN
    }),
  })
  const traces = usable.map(linear)
  let frequency: Float64Array
  let columns: ArrayLike<number>[]
  if (sameAxis(usable.map((spectrum) => spectrum.frequency))) {
    frequency = Float64Array.from(usable[0].frequency)
    columns = traces.map((trace) => trace.y)
  } else {
    frequency = commonGrid(traces, options.maxPoints ?? MAX_GRID_POINTS)
    columns = traces.map((trace) => resampleTrace(trace, frequency))
  }
  const summary = summarize(columns, frequency.length)
  const convert = (value: number) => (options.db ? toDb(value) : value)
  const mean = summary.mean.map(convert)
  const lower = summary.mean.map((value, index) => {
    const spread = summary.sd[index]
    return Number.isFinite(spread) ? convert(value - spread) : Number.NaN
  })
  const upper = summary.mean.map((value, index) => {
    const spread = summary.sd[index]
    return Number.isFinite(spread) ? convert(value + spread) : Number.NaN
  })
  return { frequency, mean, lower, upper, n: summary.n }
}

/** One participant's spectrogram: rows are frequencies, columns are times (the API's layout). */
export interface SpectrogramInput {
  time: ArrayLike<number>
  frequency: ArrayLike<number>
  power: Readonly<Record<string, ReadonlyArray<ArrayLike<number | null>>>>
}

export interface SpectrogramMean {
  time: Float64Array
  frequency: Float64Array
  /** Per key, rows (frequencies) × columns (times), in the input's unit; NaN where nobody has a value. */
  mean: Record<string, number[][]>
  n: Record<string, number[][]>
}

const traceOf = (axis: ArrayLike<number>): Trace => ({ x: axis, y: axis })

function sameAxisAs(axis: ArrayLike<number>, grid: ArrayLike<number>): boolean {
  if (axis.length !== grid.length) return false
  for (let index = 0; index < axis.length; index += 1) if (axis[index] !== grid[index]) return false
  return true
}

/**
 * Cell-wise mean of spectrograms (per key, e.g. per channel) on one common
 * time × frequency grid. Each spectrogram is taken to linear power, resampled
 * along time and then along frequency without extrapolating or bridging a loss of signal,
 * averaged, and taken back to dB when `db`.
 */
export function meanSpectrograms(
  inputs: readonly SpectrogramInput[],
  keys: readonly string[],
  options: { db: boolean; maxTimePoints?: number; maxFrequencyPoints?: number }
): SpectrogramMean {
  const usable = inputs.filter((input) => input.time.length > 0 && input.frequency.length > 0)
  const time = commonGrid(usable.map((input) => traceOf(input.time)), options.maxTimePoints ?? MAX_GRID_POINTS)
  const frequency = usable.length && sameAxis(usable.map((input) => input.frequency))
    ? Float64Array.from(usable[0].frequency)
    : commonGrid(usable.map((input) => traceOf(input.frequency)), options.maxFrequencyPoints ?? MAX_GRID_POINTS)
  const toLinear = (value: number | null | undefined) =>
    isFiniteNumber(value) ? (options.db ? fromDb(value) : value) : Number.NaN
  const mean: Record<string, number[][]> = {}
  const n: Record<string, number[][]> = {}
  for (const key of keys) {
    const grids: Float64Array[][] = []
    for (const input of usable) {
      const matrix = input.power[key]
      if (!matrix || matrix.length === 0) continue
      // Along time first, one frequency row at a time.
      const rows = Array.from({ length: Math.min(matrix.length, input.frequency.length) }, (_, row) =>
        resampleTrace({ x: input.time, y: Array.from(matrix[row], toLinear) }, time)
      )
      if (sameAxisAs(input.frequency, frequency)) {
        grids.push(rows)
        continue
      }
      // Then along frequency, one time column at a time.
      const resampled = Array.from({ length: frequency.length }, () => new Float64Array(time.length).fill(Number.NaN))
      const axis = Array.from(input.frequency).slice(0, rows.length)
      for (let column = 0; column < time.length; column += 1) {
        const values = resampleTrace({ x: axis, y: rows.map((row) => row[column]) }, frequency)
        values.forEach((value, row) => {
          resampled[row][column] = value
        })
      }
      grids.push(resampled)
    }
    const summary = meanGrids(grids)
    mean[key] = options.db ? summary.mean.map((row) => row.map(toDb)) : summary.mean
    n[key] = summary.n
  }
  return { time, frequency, mean, n }
}

/** Series per key over time, e.g. a topography's power per electrode and window. */
export interface KeyedSeriesInput {
  time: ArrayLike<number>
  values: Readonly<Record<string, ArrayLike<number | null> | undefined>>
}

export interface KeyedSeriesMean {
  grid: Float64Array
  /** Per key, the mean over inputs at each grid point. */
  mean: Record<string, Float64Array>
  n: Record<string, Uint16Array>
  /** Per key, each input resampled on `grid`, in input order. */
  resampled: Record<string, Float64Array[]>
}

/**
 * Per-key mean of time series on one common grid (every key shares it), with
 * linear interpolation that never extrapolates or bridges a loss of signal. Inputs
 * without a key do not count toward its mean.
 */
export function meanKeyedSeries(
  inputs: readonly KeyedSeriesInput[],
  keys: readonly string[],
  maxPoints = MAX_GRID_POINTS
): KeyedSeriesMean {
  const grid = commonGrid(inputs.map((input) => traceOf(input.time)), maxPoints)
  const mean: Record<string, Float64Array> = {}
  const n: Record<string, Uint16Array> = {}
  const resampled: Record<string, Float64Array[]> = {}
  for (const key of keys) {
    const columns = inputs.map((input) => {
      const values = input.values[key]
      return values ? resampleTrace({ x: input.time, y: values as ArrayLike<number> }, grid) : new Float64Array(grid.length).fill(Number.NaN)
    })
    const summary = summarize(columns, grid.length)
    mean[key] = summary.mean
    n[key] = summary.n
    resampled[key] = columns
  }
  return { grid, mean, n, resampled }
}

export interface GridMean {
  mean: number[][]
  n: number[][]
}

/**
 * Cell-wise mean of 2D grids (rows × columns), e.g. spectrograms already on a
 * common axis. Missing cells and differently sized grids are skipped cell by
 * cell. With `db`, cells are averaged in linear power.
 */
export function meanGrids(grids: ReadonlyArray<ReadonlyArray<ArrayLike<number>>>, options: { db?: boolean } = {}): GridMean {
  const rows = Math.max(0, ...grids.map((grid) => grid.length))
  const mean: number[][] = []
  const n: number[][] = []
  for (let row = 0; row < rows; row += 1) {
    const columns = Math.max(0, ...grids.map((grid) => grid[row]?.length ?? 0))
    const meanRow: number[] = new Array(columns).fill(Number.NaN)
    const countRow: number[] = new Array(columns).fill(0)
    for (let column = 0; column < columns; column += 1) {
      let sum = 0
      let count = 0
      for (const grid of grids) {
        const value = grid[row]?.[column]
        if (!isFiniteNumber(value)) continue
        sum += options.db ? fromDb(value) : value
        count += 1
      }
      if (!count) continue
      meanRow[column] = options.db ? toDb(sum / count) : sum / count
      countRow[column] = count
    }
    mean.push(meanRow)
    n.push(countRow)
  }
  return { mean, n }
}
