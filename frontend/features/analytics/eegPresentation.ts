export interface ChannelStats {
  channel: string
  count: number
  mean: number
  std: number
  median: number
  min: number
  max: number
  baseline: number
  peakPercent: number | null
}

export interface TopographyFrameRow {
  channel: string
  value: number
  x: number
  y: number
}

export function formatChannel(channel: string) {
  return channel.toUpperCase()
}

export function finiteValues(values: Array<number | undefined>) {
  return values.filter((value): value is number => Number.isFinite(value))
}

export function mean(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

export function std(values: number[]) {
  if (values.length <= 1) return 0
  const avg = mean(values)
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

export function baseline(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const start = Math.floor(sorted.length * 0.05)
  const end = Math.max(start + 1, Math.ceil(sorted.length * 0.2))
  return mean(sorted.slice(start, end))
}

export function peakPercent(maxValue: number, baseValue: number) {
  if (!Number.isFinite(baseValue) || baseValue === 0) return null
  return ((maxValue - baseValue) / Math.abs(baseValue)) * 100
}

export function buildStats(channel: string, values: number[]): ChannelStats | null {
  if (values.length === 0) return null
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const baseValue = baseline(values)

  return {
    channel,
    count: values.length,
    mean: mean(values),
    std: std(values),
    median: median(values),
    min: minValue,
    max: maxValue,
    baseline: baseValue,
    peakPercent: peakPercent(maxValue, baseValue),
  }
}

export function formatNumber(value: number | null | undefined, decimals = 4, unit = "") {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${value.toFixed(decimals)}${unit}`
}

export const VIRIDIS_STOPS = [
  { point: 0, color: "#440154" },
  { point: 0.13, color: "#482878" },
  { point: 0.25, color: "#3E4989" },
  { point: 0.38, color: "#31688E" },
  { point: 0.5, color: "#26828E" },
  { point: 0.63, color: "#1F9E89" },
  { point: 0.75, color: "#35B779" },
  { point: 0.88, color: "#6DCD59" },
  { point: 1, color: "#FDE725" },
]

export const VIRIDIS_GRADIENT = `linear-gradient(to right, ${VIRIDIS_STOPS.map(
  (stop) => `${stop.color} ${Math.round(stop.point * 100)}%`
).join(", ")})`

export interface RgbColor {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): RgbColor {
  const value = Number.parseInt(hex.slice(1), 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

export function interpolateColor(position: number) {
  const clamped = Math.max(0, Math.min(1, position))
  const upperIndex = VIRIDIS_STOPS.findIndex((stop) => stop.point >= clamped)
  if (upperIndex <= 0) return hexToRgb(VIRIDIS_STOPS[0].color)

  const lower = VIRIDIS_STOPS[upperIndex - 1]
  const upper = VIRIDIS_STOPS[upperIndex]
  const span = upper.point - lower.point || 1
  const local = (clamped - lower.point) / span
  const lowerRgb = hexToRgb(lower.color)
  const upperRgb = hexToRgb(upper.color)

  return {
    r: Math.round(lowerRgb.r + (upperRgb.r - lowerRgb.r) * local),
    g: Math.round(lowerRgb.g + (upperRgb.g - lowerRgb.g) * local),
    b: Math.round(lowerRgb.b + (upperRgb.b - lowerRgb.b) * local),
  }
}

export function scaleSpectrogramValue(value: number, domain: { min: number; max: number }) {
  if (!Number.isFinite(value)) return 0
  const span = domain.max - domain.min
  if (!Number.isFinite(span) || span <= 0) return 0.5
  return Math.max(0, Math.min(1, (value - domain.min) / span))
}

export function interpolateTopographyValue(x: number, y: number, rows: TopographyFrameRow[]) {
  let weightedSum = 0
  let weightTotal = 0
  let nearest: TopographyFrameRow | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue
    const distance = Math.hypot(x - row.x, y - row.y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = row
    }
    if (distance < 0.001) {
      return { value: row.value, nearest }
    }
    const weight = 1 / Math.max(distance ** 2, 1e-6)
    weightedSum += row.value * weight
    weightTotal += weight
  }

  return {
    value: weightTotal > 0 ? weightedSum / weightTotal : 0,
    nearest,
  }
}

export function rotateTopographyPositionClockwise(x: number, y: number) {
  // Backend layout points front of head toward +Y; this view turns the face toward +X.
  return {
    x: y,
    y: -x,
  }
}

export function readClickedTime(state: unknown): number | null {
  if (!state || typeof state !== "object") return null

  const maybeState = state as {
    activePayload?: Array<{ payload?: { time?: unknown } }>
    activeLabel?: unknown
  }
  const fromPayload = maybeState.activePayload?.[0]?.payload?.time
  const fromLabel = maybeState.activeLabel
  const candidate = typeof fromPayload === "number" ? fromPayload : Number(fromLabel)

  return Number.isFinite(candidate) ? candidate : null
}
