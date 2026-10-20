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
 * Vertical axis that brackets the values with round ticks, for the «Ajustar»
 * toggle. Unlike the default scale it does not reach down to zero. Null when
 * there is nothing to scale.
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
  const span = max > min ? max - min : Math.max(Math.abs(max), 1) * 0.1
  const step = niceStep(span / TARGET_INTERVALS)
  const decimals = stepDecimals(step)
  let start = Math.floor(min / step) * step
  let end = Math.ceil(max / step) * step
  if (!(end > start)) {
    start -= step
    end += step
  }

  const ticks: number[] = []
  const count = Math.round((end - start) / step)
  for (let index = 0; index <= count; index += 1) {
    ticks.push(Number((start + index * step).toFixed(decimals)))
  }
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, decimals }
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
