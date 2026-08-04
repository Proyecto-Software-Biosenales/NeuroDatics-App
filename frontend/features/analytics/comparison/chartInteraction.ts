interface RechartsClickState {
  activeLabel?: unknown
  activeTooltipIndex?: unknown
  activeIndex?: unknown
  activePayload?: Array<{ payload?: unknown }>
}

interface TemporalPoint {
  time: number
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

/**
 * Resolve a chart click for both Recharts 2 and Recharts 3.
 *
 * Recharts 3 no longer exposes `activePayload` on chart-level handlers. The
 * returned item must come from `data` so callers retain fields that are not
 * plotted, such as the absolute source timestamp used by the gaze preview.
 */
export function resolveClickedPoint<T extends TemporalPoint>(
  data: readonly T[],
  state: unknown
): T | null {
  if (!data.length || !state || typeof state !== "object") return null

  const candidate = state as RechartsClickState
  const legacyPoint = candidate.activePayload?.[0]?.payload
  if (
    legacyPoint &&
    typeof legacyPoint === "object" &&
    finiteNumber((legacyPoint as TemporalPoint).time) != null
  ) {
    return legacyPoint as T
  }

  for (const rawIndex of [
    candidate.activeTooltipIndex,
    candidate.activeIndex,
  ]) {
    const index = finiteNumber(rawIndex)
    if (index != null && Number.isInteger(index) && index >= 0 && data[index]) {
      return data[index]
    }
  }

  const label = finiteNumber(candidate.activeLabel)
  if (label == null) return null

  let nearest: T | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const point of data) {
    if (!Number.isFinite(point.time)) continue
    const distance = Math.abs(point.time - label)
    if (distance < nearestDistance) {
      nearest = point
      nearestDistance = distance
    }
  }
  return nearest
}
