import type { EegPsdData, EegSpectrogramData } from "./types"

export interface ZoomRange {
  start: number
  end: number
}

// Horizontal pixels a press must travel before it is a drag instead of a click.
export const DRAG_ZOOM_THRESHOLD_PX = 6

function finite(value: unknown): number | null {
  if (value == null || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

/** X-axis value under the pointer, from a Recharts chart-level mouse state. */
export function readZoomValue(state: unknown): number | null {
  if (!state || typeof state !== "object") return null
  return finite((state as { activeLabel?: unknown }).activeLabel)
}

/**
 * Order the two dragged edges and widen them outward to `decimals`, so the
 * rounded range never excludes a sample the user selected. Null when the drag
 * does not cover a positive span.
 */
export function normalizeZoomRange(
  a: number,
  b: number,
  { decimals = 3, min = Number.NEGATIVE_INFINITY }: { decimals?: number; min?: number } = {}
): ZoomRange | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const factor = 10 ** decimals
  const start = Math.max(min, Math.floor(Math.min(a, b) * factor) / factor)
  const end = Math.ceil(Math.max(a, b) * factor) / factor
  if (!(end > start)) return null
  return { start: Number(start.toFixed(decimals)), end: Number(end.toFixed(decimals)) }
}

/**
 * Half-open index span of sorted `values` inside the range. Null when the range
 * holds fewer than two points or every point, since neither narrows the view.
 */
export function zoomSpan(values: readonly number[], range: ZoomRange): [number, number] | null {
  let first = -1
  let last = -1
  values.forEach((value, index) => {
    if (value < range.start || value > range.end) return
    if (first < 0) first = index
    last = index
  })
  if (first < 0 || last <= first) return null
  return first === 0 && last === values.length - 1 ? null : [first, last + 1]
}

export function sliceEegPsd(data: EegPsdData | null, range: ZoomRange | null): EegPsdData | null {
  if (!data || !range) return data
  const span = zoomSpan(data.frequency, range)
  if (!span) return data
  return {
    ...data,
    frequency: data.frequency.slice(...span),
    power: Object.fromEntries(
      Object.entries(data.power).map(([channel, values]) => [channel, values.slice(...span)])
    ),
  }
}

/** Percentile colour limits, matching the backend's own 2nd/98th clipping. */
export function percentileColorDomain(
  values: Array<number | null | undefined>,
  low = 2,
  high = 98
): { min: number; max: number } | null {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value))
  if (finiteValues.length === 0) return null
  const sorted = [...finiteValues].sort((a, b) => a - b)
  const at = (percentile: number) => {
    const position = ((sorted.length - 1) * Math.max(0, Math.min(100, percentile))) / 100
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  }
  return { min: at(low), max: at(high) }
}

export function sliceEegSpectrogram(
  data: EegSpectrogramData | null,
  range: ZoomRange | null
): EegSpectrogramData | null {
  if (!data || !range) return data
  const span = zoomSpan(data.time, range)
  if (!span) return data
  const power = Object.fromEntries(
    Object.entries(data.power).map(([channel, matrix]) => [
      channel,
      matrix.map((row) => row.slice(...span)),
    ])
  )
  // Keeping the block's colour limits after narrowing the view left the
  // visible part squeezed into a fraction of the ramp. Rescale to what is
  // actually on screen, with the same percentiles the backend uses.
  const rescale = (values: Array<number | null | undefined>, fallback: { min: number; max: number }) =>
    percentileColorDomain(values) ?? fallback
  const channelDomains = data.channel_color_domain
  return {
    ...data,
    time: data.time.slice(...span),
    power,
    color_domain: rescale(
      Object.values(power).flatMap((matrix) => matrix.flat()),
      data.color_domain
    ),
    channel_color_domain: channelDomains
      ? Object.fromEntries(
          Object.entries(channelDomains).map(([channel, domain]) => [
            channel,
            rescale((power[channel] ?? []).flat(), domain),
          ])
        )
      : channelDomains,
  }
}

/** Axis tick decimals that keep neighbouring ticks distinct once zoomed in. */
export function axisTickDecimals(domain: readonly unknown[]): number {
  const [low, high] = domain
  const span = typeof low === "number" && typeof high === "number" ? Math.abs(high - low) : Number.POSITIVE_INFINITY
  return span >= 20 ? 0 : span >= 2 ? 1 : span >= 0.2 ? 2 : 3
}

export function formatAxisTick(value: unknown, decimals: number): string {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(decimals) : ""
}

/** Zoom levels: the range on screen plus each level it was entered from. Null is the full view. */
export interface ZoomHistory<T> {
  current: T | null
  previous: T[]
}

export const EMPTY_ZOOM_HISTORY: ZoomHistory<never> = { current: null, previous: [] }

export function sameZoomRange(
  a: { start: number | null; end: number | null },
  b: { start: number | null; end: number | null }
): boolean {
  return a.start === b.start && a.end === b.end
}

/** Show `next`, remembering the level it replaces unless that level is the full view. */
export function pushZoom<T>(
  history: ZoomHistory<T>,
  next: T,
  same: (a: T, b: T) => boolean = Object.is
): ZoomHistory<T> {
  if (history.current == null) return { current: next, previous: [] }
  if (same(history.current, next)) return history
  return { current: next, previous: [...history.previous, history.current] }
}

/** Step back one level; the first level steps back to the full view. */
export function popZoom<T>(history: ZoomHistory<T>): ZoomHistory<T> {
  if (history.previous.length === 0) return EMPTY_ZOOM_HISTORY
  return { current: history.previous[history.previous.length - 1], previous: history.previous.slice(0, -1) }
}
