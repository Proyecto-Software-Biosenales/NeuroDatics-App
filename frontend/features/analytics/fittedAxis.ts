export interface FittedAxis {
  domain: [number, number]
  ticks: number[]
  decimals: number
}

const TARGET_INTERVALS = 5

// Rounds a rough tick spacing up to 1, 2, 2.5 or 5 times a power of ten.
function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * power
}

function stepDecimals(step: number): number {
  for (let decimals = 0; decimals < 10; decimals += 1) {
    const scaled = step * 10 ** decimals
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return decimals
  }
  return 10
}

/**
 * Vertical axis hugging the values, for the «Ajustar» toggle. Each end is the
 * value rounded outwards one decimal below the span's order of magnitude (a
 * pupil of 2.9-3.98 mm gets 2.8-4.0), so the lines fill the plot and never
 * touch its edge; the round ticks are the ones that fall inside. Unlike the
 * default scale it does not reach down to zero. Null when there is nothing to
 * scale.
 */
export function fittedAxis(values: Iterable<number | null | undefined>): FittedAxis | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min)) return null

  // Flat data gets a band around it instead of a line on the edge.
  if (!(max > min)) {
    const half = Math.max(Math.abs(max), 1) * 0.05
    min -= half
    max += half
  }
  const span = max - min
  const precision = 10 ** (Math.floor(Math.log10(span)) - 1)
  const precisionDecimals = stepDecimals(precision)
  const round = (value: number) => Number(value.toFixed(precisionDecimals))
  let start = round(Math.floor(min / precision) * precision)
  let end = round(Math.ceil(max / precision) * precision)
  if (min - start < precision * 1e-6) start = round(start - precision)
  if (end - max < precision * 1e-6) end = round(end + precision)

  const step = niceStep(span / TARGET_INTERVALS)
  const decimals = stepDecimals(step)
  const ticks: number[] = []
  const first = Math.ceil(start / step - 1e-9)
  const last = Math.floor(end / step + 1e-9)
  for (let index = first; index <= last; index += 1) {
    ticks.push(Number((index * step).toFixed(decimals)))
  }
  return { domain: [start, end], ticks, decimals }
}

/** YAxis props for a fitted axis; none, so the default scale applies, when `axis` is null. */
export function fittedYAxisProps(axis: FittedAxis | null) {
  if (!axis) return {}
  return {
    domain: axis.domain,
    ticks: axis.ticks,
    allowDataOverflow: true,
    tickFormatter: (value: unknown) => Number(value).toFixed(axis.decimals),
  }
}
