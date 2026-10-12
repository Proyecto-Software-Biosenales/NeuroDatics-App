import type {
  AoiEventItem,
  AoiMetricItem,
  AoiTransitionRow,
  DistanceTimeseriesData,
  FixationPoint,
  GazeTimeseriesData,
  PupilTimeseriesData,
} from "./types"

/**
 * Derivations behind the AOI comparison tab. JSX-free and free of value
 * imports so it can be unit tested with `node --test`; the tab passes in the
 * point-in-AOI test (`findAoiAtPoint`) as a locator.
 */

/** Finds the AOI under a point given in stimulus percentages (0-100). */
export type AoiLocator = (xPercent: number | null, yPercent: number | null) => AoiMetricItem | null

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

// ------------------------------------------------------------------ formatting

const NBSP = "\u00a0"

/** Decimal comma, as the KPI cards of the same tab print it. */
export function formatDecimal(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(".", ",")
}

/** Explicit sign, so a delta never reads as an absolute value. */
export function formatSignedDecimal(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals))
  const sign = rounded > 0 ? "+" : rounded < 0 ? "\u2212" : ""
  return `${sign}${formatDecimal(Math.abs(rounded), decimals)}`
}

export function formatSeconds(value: number): string {
  const decimals = value < 10 ? 2 : value < 100 ? 1 : 0
  return `${formatDecimal(value, decimals)}${NBSP}s`
}

export function formatMilliseconds(value: number): string {
  return `${Math.round(value)}${NBSP}ms`
}

export function formatPercent(value: number, decimals = 1): string {
  return `${formatDecimal(value, decimals)}${NBSP}%`
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count}${NBSP}${count === 1 ? singular : pluralForm}`
}

// ------------------------------------------------------------------ time basis

/**
 * Scenario onset on the recording clock: the earliest first sample among the
 * scoped series. `ttff_ms`, fixation times and key events come on the
 * recording clock, while the PDF report measures them from this onset
 * (`reports/.../common.scenario_start`). The series are sorted by time, so
 * their first sample is their start; scanning for a minimum instead would pick
 * up the zeros the pupil series writes for rows without a timestamp.
 */
export function scenarioOnsetS(series: ReadonlyArray<ReadonlyArray<number> | null | undefined>): number | null {
  let onset: number | null = null
  for (const times of series) {
    const first = times?.find(isFiniteNumber)
    if (first != null && (onset == null || first < onset)) onset = first
  }
  return onset
}

export function fixationEndS(fixation: Pick<FixationPoint, "time_s" | "t_end_s" | "duration_s">): number | null {
  if (!isFiniteNumber(fixation.time_s)) return null
  if (isFiniteNumber(fixation.t_end_s) && fixation.t_end_s >= fixation.time_s) return fixation.t_end_s
  return fixation.time_s + (isFiniteNumber(fixation.duration_s) && fixation.duration_s > 0 ? fixation.duration_s : 0)
}

/** Last recorded instant of the scenario on the recording clock. */
export function scenarioEndS(
  series: ReadonlyArray<ReadonlyArray<number> | null | undefined>,
  fixations: ReadonlyArray<FixationPoint> = []
): number | null {
  let end: number | null = null
  for (const times of series) {
    if (!times) continue
    for (const value of times) {
      if (isFiniteNumber(value) && (end == null || value > end)) end = value
    }
  }
  for (const fixation of fixations) {
    const value = fixationEndS(fixation)
    if (value != null && (end == null || value > end)) end = value
  }
  return end
}

/** TTFF from scenario onset, as the PDF report prints it (`_relative_ttff_s`). */
export function relativeTtffS(ttffMs: number | null | undefined, onsetS: number | null): number | null {
  if (!isFiniteNumber(ttffMs) || onsetS == null) return null
  return Math.max(0, ttffMs / 1000 - onsetS)
}

export function relativeTimeS(timeS: number | null | undefined, onsetS: number | null): number | null {
  if (!isFiniteNumber(timeS) || onsetS == null) return null
  return Math.max(0, timeS - onsetS)
}

// ------------------------------------------------------------------ sequence

export interface AoiFixationSpan {
  /** 1-based position among the scenario's fixations, as `fixations_to_target` counts it. */
  order: number
  /** First AOI containing the fixation, in the metrics' order; null outside every AOI. */
  aoi: AoiMetricItem | null
  /** Recording clock. */
  startS: number
  endS: number
  durationS: number
  segmentId: string | null
}

/**
 * One span per fixation, assigned to the first AOI that contains it. That is
 * the rule the backend applies to its transition sequence, so a timeline built
 * from these spans agrees with the transition matrix.
 */
export function buildAoiSequence(fixations: ReadonlyArray<FixationPoint>, locate: AoiLocator): AoiFixationSpan[] {
  const spans: AoiFixationSpan[] = []
  fixations.forEach((fixation, index) => {
    const endS = fixationEndS(fixation)
    if (endS == null) return
    const x = isFiniteNumber(fixation.x_norm) ? fixation.x_norm * 100 : null
    const y = isFiniteNumber(fixation.y_norm) ? fixation.y_norm * 100 : null
    spans.push({
      order: index + 1,
      aoi: locate(x, y),
      startS: fixation.time_s,
      endS,
      durationS: isFiniteNumber(fixation.duration_s) && fixation.duration_s > 0
        ? fixation.duration_s
        : endS - fixation.time_s,
      segmentId: fixation.segment_id ?? null,
    })
  })
  return spans
}

/**
 * Visits per AOI id. A visit starts when a fixation lands in the AOI after a
 * fixation anywhere else (another AOI, outside every AOI) or after a break in
 * the recording segment, so `visits - 1` is how many times the gaze came back.
 */
export function countAoiVisits(sequence: ReadonlyArray<AoiFixationSpan>): Map<string, number> {
  const visits = new Map<string, number>()
  let previous: AoiFixationSpan | null = null
  for (const span of sequence) {
    const id = span.aoi?.id ?? null
    const continues = previous != null &&
      previous.segmentId === span.segmentId &&
      (previous.aoi?.id ?? null) === id
    if (id != null && !continues) visits.set(id, (visits.get(id) ?? 0) + 1)
    previous = span
  }
  return visits
}

// ------------------------------------------------------------------ transitions

/**
 * Both directions between two AOIs. A back-and-forth comparison is one link
 * rather than two entries of a ranking, and `a` is oriented so that
 * `forward` (a → b) is the busier direction.
 */
export interface AoiTransitionLink {
  a: AoiMetricItem
  b: AoiMetricItem
  forward: number
  backward: number
  total: number
  /** Share of every AOI-to-AOI transition, 0-100. */
  sharePercent: number
}

export interface AoiTransitionSummary {
  total: number
  /** Largest directed count, for the matrix heat. */
  maxCount: number
  /** Busiest links first. */
  links: AoiTransitionLink[]
  /** Transitions arriving at / leaving each AOI, by AOI id. */
  entries: Map<string, number>
  exits: Map<string, number>
  count: (from: AoiMetricItem, to: AoiMetricItem) => number
}

export function summarizeTransitions(
  rows: ReadonlyArray<AoiTransitionRow>,
  aois: ReadonlyArray<AoiMetricItem>
): AoiTransitionSummary {
  const byRow = new Map<string, AoiTransitionRow>()
  for (const row of rows) if (!byRow.has(row.from_aoi)) byRow.set(row.from_aoi, row)
  const count = (from: AoiMetricItem, to: AoiMetricItem) => {
    if (from.name === to.name) return 0
    const value = byRow.get(from.name)?.counts[to.name]
    return isFiniteNumber(value) && value > 0 ? value : 0
  }

  const entries = new Map<string, number>()
  const exits = new Map<string, number>()
  let total = 0
  let maxCount = 0
  for (const from of aois) {
    for (const to of aois) {
      const value = count(from, to)
      if (value <= 0) continue
      total += value
      maxCount = Math.max(maxCount, value)
      entries.set(to.id, (entries.get(to.id) ?? 0) + value)
      exits.set(from.id, (exits.get(from.id) ?? 0) + value)
    }
  }

  const links: Array<Omit<AoiTransitionLink, "sharePercent"> & { rank: number }> = []
  aois.forEach((first, firstIndex) => {
    aois.slice(firstIndex + 1).forEach((second, offset) => {
      const there = count(first, second)
      const back = count(second, first)
      if (there + back <= 0) return
      const flipped = back > there
      links.push({
        a: flipped ? second : first,
        b: flipped ? first : second,
        forward: Math.max(there, back),
        backward: Math.min(there, back),
        total: there + back,
        rank: firstIndex * aois.length + firstIndex + 1 + offset,
      })
    })
  })
  links.sort((x, y) => y.total - x.total || y.forward - x.forward || x.rank - y.rank)

  return {
    total,
    maxCount,
    links: links.map((link) => ({
      a: link.a,
      b: link.b,
      forward: link.forward,
      backward: link.backward,
      total: link.total,
      sharePercent: total > 0 ? (link.total / total) * 100 : 0,
    })),
    entries,
    exits,
    count,
  }
}

// ------------------------------------------------------------------ discovery

export interface AoiDiscovery {
  aoi: AoiMetricItem
  /** 1-based order in which the AOIs first received a fixation. */
  rank: number
  /** From scenario onset; null while the onset is unknown. */
  ttffS: number | null
}

export function discoveryOrder(
  aois: ReadonlyArray<AoiMetricItem>,
  onsetS: number | null
): { seen: AoiDiscovery[]; unseen: AoiMetricItem[] } {
  const position = new Map(aois.map((aoi, index) => [aoi.id, index]))
  const seen = aois
    .filter((aoi) => aoi.fixation_count > 0 && isFiniteNumber(aoi.ttff_ms))
    .sort((a, b) => (
      (a.ttff_ms as number) - (b.ttff_ms as number) ||
      (a.fixations_to_target ?? Number.MAX_SAFE_INTEGER) - (b.fixations_to_target ?? Number.MAX_SAFE_INTEGER) ||
      (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0)
    ))
    .map((aoi, index) => ({ aoi, rank: index + 1, ttffS: relativeTtffS(aoi.ttff_ms, onsetS) }))
  const seenIds = new Set(seen.map((item) => item.aoi.id))
  return { seen, unseen: aois.filter((aoi) => !seenIds.has(aoi.id)) }
}

// ------------------------------------------------------------------ findings

export interface AoiFindings {
  first: AoiDiscovery | null
  longestFixations: { aoi: AoiMetricItem; avgMs: number; count: number } | null
  mostVisited: { aoi: AoiMetricItem; visits: number } | null
  pupil: { aoi: AoiMetricItem; deltaPercent: number; avgMm: number | null } | null
  topLink: AoiTransitionLink | null
  unseen: AoiMetricItem[]
  total: number
}

function leader<T>(items: ReadonlyArray<T>, score: (item: T) => number, tieBreak: (item: T) => number = () => 0) {
  let best: T | null = null
  for (const item of items) {
    if (
      best == null ||
      score(item) > score(best) ||
      (score(item) === score(best) && tieBreak(item) > tieBreak(best))
    ) {
      best = item
    }
  }
  return best
}

/**
 * The headline facts of the tab. Each one is only reported when the data can
 * support a comparison: fixation length needs AOIs with at least two
 * fixations when any exist, a revisit needs a second visit, and the pupil
 * ranking needs two AOIs with pupil samples.
 */
export function aoiFindings({
  aois,
  discovery,
  visits,
  transitions,
}: {
  aois: ReadonlyArray<AoiMetricItem>
  discovery: { seen: AoiDiscovery[]; unseen: AoiMetricItem[] }
  visits: Map<string, number> | null
  transitions: AoiTransitionSummary
}): AoiFindings {
  const fixated = aois.filter((aoi) => aoi.fixation_count > 0)
  const repeated = fixated.filter((aoi) => aoi.fixation_count >= 2)
  const longest = leader(
    repeated.length > 0 ? repeated : fixated,
    (aoi) => aoi.avg_fixation_duration_ms,
    (aoi) => aoi.fixation_count
  )

  const visited = visits
    ? leader(
        fixated.filter((aoi) => (visits.get(aoi.id) ?? 0) >= 2),
        (aoi) => visits.get(aoi.id) ?? 0,
        (aoi) => aoi.total_dwell_time_ms
      )
    : null

  const withPupil = aois.filter((aoi) => aoi.pupil_sample_count > 0 && isFiniteNumber(aoi.pupil_delta_percent))
  const pupil = withPupil.length >= 2
    ? leader(withPupil, (aoi) => aoi.pupil_delta_percent as number, (aoi) => aoi.pupil_sample_count)
    : null

  return {
    first: discovery.seen[0] ?? null,
    longestFixations: longest
      ? { aoi: longest, avgMs: longest.avg_fixation_duration_ms, count: longest.fixation_count }
      : null,
    mostVisited: visited && visits ? { aoi: visited, visits: visits.get(visited.id) ?? 0 } : null,
    pupil: pupil
      ? { aoi: pupil, deltaPercent: pupil.pupil_delta_percent as number, avgMm: pupil.avg_pupil_mm }
      : null,
    topLink: transitions.links[0] ?? null,
    unseen: discovery.unseen,
    total: aois.length,
  }
}

// ------------------------------------------------------------------ axis

const TIME_STEPS_S = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600]

/** Round tick positions from 0 to `spanS`, about `targetTicks` of them. */
export function timeTicks(spanS: number, targetTicks = 6): number[] {
  if (!isFiniteNumber(spanS) || spanS <= 0) return [0]
  const raw = spanS / Math.max(1, targetTicks)
  const step = TIME_STEPS_S.find((candidate) => candidate >= raw) ?? Math.ceil(raw / 3600) * 3600
  const ticks: number[] = []
  for (let index = 0; index * step <= spanS + step * 1e-9; index += 1) {
    ticks.push(Number((index * step).toFixed(6)))
  }
  return ticks
}

// ------------------------------------------------------------------ key events

/**
 * Signal extremes computed from the time series, for API instances that do
 * not send `events` yet. Mirrors `AoiAnalyticsService._key_events`: the gaze
 * position at the extreme decides the AOI. The gaze series writes a lost
 * sample as (0, 0), which is skipped instead of being reported as an extreme.
 */
export function deriveKeyEvents(
  series: {
    pupil: PupilTimeseriesData | null | undefined
    gaze: GazeTimeseriesData | null | undefined
    distance: DistanceTimeseriesData | null | undefined
  },
  locate: AoiLocator
): AoiEventItem[] {
  const { pupil, gaze, distance } = series
  const gazeValid = (index: number) => {
    const gx = gaze?.gx_clean[index]
    const gy = gaze?.gy_clean[index]
    return isFiniteNumber(gx) && isFiniteNumber(gy) && !(gx === 0 && gy === 0)
  }
  const gazeAt = (index: number) => (
    gazeValid(index)
      ? { gx: gaze!.gx_clean[index], gy: gaze!.gy_clean[index] }
      : { gx: null, gy: null }
  )
  const nearestGaze = (timeS: number) => {
    if (!gaze?.time.length) return { gx: null, gy: null }
    let nearestIndex = -1
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < gaze.time.length; index += 1) {
      if (!gazeValid(index)) continue
      const gap = Math.abs(gaze.time[index] - timeS)
      if (gap < nearestDistance) {
        nearestDistance = gap
        nearestIndex = index
      }
    }
    return nearestIndex >= 0 ? gazeAt(nearestIndex) : { gx: null, gy: null }
  }

  const events: AoiEventItem[] = []
  const addExtrema = (
    metric: string,
    labelBase: string,
    unit: string,
    times: ReadonlyArray<number> | undefined,
    values: ReadonlyArray<number | null | undefined>,
    coordsAt: (index: number, timeS: number) => { gx: number | null; gy: number | null },
    valid: (index: number) => boolean = () => true
  ) => {
    if (!times?.length) return
    let minIndex = -1
    let maxIndex = -1
    values.forEach((value, index) => {
      if (!isFiniteNumber(value) || !valid(index) || !isFiniteNumber(times[index])) return
      if (minIndex < 0 || value < (values[minIndex] as number)) minIndex = index
      if (maxIndex < 0 || value > (values[maxIndex] as number)) maxIndex = index
    })
    if (minIndex < 0) return
    for (const [kind, index] of [["min", minIndex], ["max", maxIndex]] as const) {
      const timeS = times[index]
      const { gx, gy } = coordsAt(index, timeS)
      const aoi = locate(gx, gy)
      events.push({
        id: `${metric}_${kind}_fallback`,
        label: `${labelBase} ${kind === "min" ? "minimo" : "maximo"}`,
        metric,
        kind,
        value: values[index] as number,
        unit,
        time_s: timeS,
        gx,
        gy,
        aoi_id: aoi?.id ?? null,
        aoi_name: aoi?.name ?? null,
        aoi_color: aoi?.color ?? null,
      })
    }
  }

  const pupilValues = pupil?.time.map((_, index) => {
    const average = pupil.average[index]
    const left = pupil.smooth_left[index]
    const right = pupil.smooth_right[index]
    if (isFiniteNumber(average) && average > 0) return average
    if (isFiniteNumber(left) && left > 0 && isFiniteNumber(right) && right > 0) return (left + right) / 2
    if (isFiniteNumber(left) && left > 0) return left
    if (isFiniteNumber(right) && right > 0) return right
    return null
  }) ?? []

  addExtrema("pupil", "Dilatacion pupilar", "mm", pupil?.time, pupilValues, (_index, timeS) => nearestGaze(timeS))
  addExtrema("gaze_x", "Gaze X", "%", gaze?.time, gaze?.gx_clean ?? [], (index) => gazeAt(index), gazeValid)
  addExtrema("gaze_y", "Gaze Y", "%", gaze?.time, gaze?.gy_clean ?? [], (index) => gazeAt(index), gazeValid)
  addExtrema("distance", "Distancia", "cm", distance?.time, distance?.distance_cm ?? [], (_index, timeS) => nearestGaze(timeS))
  return events
}
