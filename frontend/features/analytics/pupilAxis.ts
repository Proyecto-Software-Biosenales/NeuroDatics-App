export interface PupilAxis {
  domain: [number, number]
  ticks: number[]
}

// Room left above the highest value on the full scale, so a peak just under a
// whole millimetre does not touch the top edge.
const FULL_SCALE_HEADROOM_MM = 0.2
const MAX_TICK_INTERVALS = 8

/**
 * Vertical axis for pupil diameter, in whole millimetres. The full scale runs
 * from zero to the first whole value above the peak; `fit` keeps only the
 * whole values that bracket the data. Null when there is nothing to scale.
 */
export function pupilAxis(values: Iterable<number>, fit: boolean): PupilAxis | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min)) return null

  const low = fit ? min : 0
  const high = fit ? max : max + FULL_SCALE_HEADROOM_MM
  const step = Math.max(1, Math.ceil((Math.ceil(high) - Math.floor(low)) / MAX_TICK_INTERVALS))
  const start = Math.floor(low / step) * step
  const end = Math.max(Math.ceil(high / step) * step, start + step)

  const ticks: number[] = []
  for (let tick = start; tick <= end; tick += step) ticks.push(tick)
  return { domain: [start, end], ticks }
}
