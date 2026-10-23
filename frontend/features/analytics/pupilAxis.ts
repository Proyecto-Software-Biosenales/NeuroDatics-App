export interface PupilAxis {
  domain: [number, number]
  ticks: number[]
  decimals: number
}

// Room left above the highest value on the full scale, so a peak just under a
// whole millimetre does not touch the top edge.
const FULL_SCALE_HEADROOM_MM = 0.2
const MAX_TICK_INTERVALS = 8

/**
 * Full vertical scale for pupil diameter, in whole millimetres from zero to the
 * first whole value above the peak. «Ajustar» uses `fittedAxis` instead, like
 * every other chart. Null when there is nothing to scale.
 */
export function pupilAxis(values: Iterable<number>): PupilAxis | null {
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue
    if (value > max) max = value
  }
  if (!Number.isFinite(max)) return null

  const high = max + FULL_SCALE_HEADROOM_MM
  const step = Math.max(1, Math.ceil(Math.ceil(high) / MAX_TICK_INTERVALS))
  const end = Math.max(Math.ceil(high / step) * step, step)

  const ticks: number[] = []
  for (let tick = 0; tick <= end; tick += step) ticks.push(tick)
  return { domain: [0, end], ticks, decimals: 0 }
}
