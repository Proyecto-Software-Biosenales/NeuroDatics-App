/** Shared axis ranges across participant cards, honest about their coverage. */

export interface Domain {
  min: number
  max: number
  /**
   * Evenly spaced quantiles of the card's values and how many values they
   * summarise. With them the common range is the pooled P1-P99 instead of the
   * union of every card's extremes.
   */
  quantiles?: number[]
  count?: number
}

export type ScaleMode = "common" | "independent"

/** Percentiles the common range of a temporal signal covers. */
export const COMMON_LOW_PERCENTILE = 1
export const COMMON_HIGH_PERCENTILE = 99

const SUMMARY_QUANTILES = 101

export function finiteDomain(values: Iterable<number | null | undefined>): Domain | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

export function mergeDomains(domains: Iterable<Domain | null | undefined>): Domain | null {
  let merged: Domain | null = null
  for (const domain of domains) {
    if (!domain || !Number.isFinite(domain.min) || !Number.isFinite(domain.max)) continue
    merged = merged
      ? { min: Math.min(merged.min, domain.min), max: Math.max(merged.max, domain.max) }
      : { min: domain.min, max: domain.max }
  }
  return merged
}

/** `domain` plus the quantile summary of `values`, for a percentile common range. */
export function withQuantiles(domain: Domain, values: Iterable<number | null | undefined>): Domain {
  const sorted: number[] = []
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) sorted.push(value)
  if (!sorted.length) return domain
  sorted.sort((a, b) => a - b)
  const quantiles = Array.from({ length: SUMMARY_QUANTILES }, (_, index) => {
    const position = ((sorted.length - 1) * index) / (SUMMARY_QUANTILES - 1)
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  })
  return { ...domain, quantiles, count: sorted.length }
}

// Share of one card's values at or below `value`, read off its quantiles.
function cardShare(quantiles: number[], value: number): number {
  const last = quantiles.length - 1
  if (value < quantiles[0]) return 0
  if (value >= quantiles[last]) return 1
  // quantiles[low] <= value < quantiles[high]
  let low = 0
  let high = last
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (quantiles[mid] <= value) low = mid
    else high = mid
  }
  const step = quantiles[low + 1] - quantiles[low]
  return (low + (step > 0 ? (value - quantiles[low]) / step : 0)) / last
}

type SummarisedDomain = Domain & { quantiles: number[]; count: number }

function pooledQuantile(cards: SummarisedDomain[], total: number, fraction: number): number {
  let low = Math.min(...cards.map((card) => card.quantiles[0]))
  let high = Math.max(...cards.map((card) => card.quantiles[card.quantiles.length - 1]))
  for (let iteration = 0; iteration < 60 && high > low; iteration += 1) {
    const mid = (low + high) / 2
    let below = 0
    for (const card of cards) below += card.count * cardShare(card.quantiles, mid)
    if (below / total >= fraction) high = mid
    else low = mid
  }
  return high
}

/**
 * The range every card shares. When each card summarised its values, it is
 * the P1-P99 of all of them pooled (each value weighs the same), so one
 * artefact in one participant cannot flatten the rest; otherwise it is the
 * union of the cards' ranges.
 */
export function commonDomain(domains: Iterable<Domain | null | undefined>): Domain | null {
  const valid = [...domains].filter(
    (domain): domain is Domain => Boolean(domain && Number.isFinite(domain.min) && Number.isFinite(domain.max))
  )
  if (!valid.length) return null
  const summarised = valid.every((domain) => (domain.quantiles?.length ?? 0) >= 2 && (domain.count ?? 0) > 0)
  if (!summarised) return mergeDomains(valid)
  const cards = valid as SummarisedDomain[]
  const total = cards.reduce((sum, card) => sum + card.count, 0)
  return {
    min: pooledQuantile(cards, total, COMMON_LOW_PERCENTILE / 100),
    max: pooledQuantile(cards, total, COMMON_HIGH_PERCENTILE / 100),
  }
}

/** A drawable range: flat data gets a small band, and a little headroom. */
export function paddedDomain(domain: Domain | null, pad = 0.04): [number, number] | null {
  if (!domain) return null
  if (!(domain.max > domain.min)) {
    const half = Math.max(Math.abs(domain.min) * 0.05, 0.5)
    return [domain.min - half, domain.max + half]
  }
  const span = domain.max - domain.min
  return [domain.min - span * pad, domain.max + span * pad]
}

/**
 * Text that says which participants a common range was computed from. A range
 * from part of the selection is never presented as the global one.
 */
export function describeCommonScale(covered: number, selected: number, percentiles = false): string {
  if (selected <= 0) return "Sin participantes seleccionados."
  const reach = percentiles
    ? ` Cubre del ${COMMON_LOW_PERCENTILE} % al ${COMMON_HIGH_PERCENTILE} % de sus valores; lo que queda fuera se corta en el borde de la gráfica.`
    : ""
  if (covered >= selected) {
    return (selected === 1
      ? "Escala común: calculada con el único participante seleccionado."
      : `Escala común a los ${selected} participantes seleccionados.`) + reach
  }
  return `Escala común parcial: calculada con ${covered} de ${selected} participantes cargados hasta ahora; cambia al cargar más.${reach}`
}
