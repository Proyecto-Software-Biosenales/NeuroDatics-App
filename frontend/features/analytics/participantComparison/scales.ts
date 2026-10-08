/** Shared axis ranges across participant cards, honest about their coverage. */

export interface Domain {
  min: number
  max: number
}

export type ScaleMode = "common" | "independent"

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
export function describeCommonScale(covered: number, selected: number): string {
  if (selected <= 0) return "Sin participantes seleccionados."
  if (covered >= selected) {
    return selected === 1
      ? "Escala común: calculada con el único participante seleccionado."
      : `Escala común a los ${selected} participantes seleccionados.`
  }
  return `Escala común parcial: calculada con ${covered} de ${selected} participantes cargados hasta ahora; se amplía al cargar más.`
}
