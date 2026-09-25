import type {
  EegArtifactSpan,
  EegChannelQuality,
  EegMetadata,
  EegTimeseriesData,
} from "./types"

export interface ChannelStats {
  channel: string
  count: number
  mean: number
  std: number
  median: number
  min: number
  max: number
  rms: number
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

export function finiteValues(values: Array<number | null | undefined>) {
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

export function buildStats(channel: string, values: number[]): ChannelStats | null {
  if (values.length === 0) return null
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)

  return {
    channel,
    count: values.length,
    mean: mean(values),
    std: std(values),
    median: median(values),
    min: minValue,
    max: maxValue,
    rms: Math.sqrt(mean(values.map((value) => value ** 2))),
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


/** Summaries are computed by the backend before plot reduction. Both-mode uses raw. */
export function fullResolutionStats(data: EegTimeseriesData | null, mode: string): ChannelStats[] {
  if (!data?.statistics) return []
  const statistics = mode === "smooth" ? data.statistics.smooth : data.statistics.raw
  return data.channels.flatMap((channel) => {
    const stats = statistics[channel]
    return stats && stats.count > 0 ? [{ channel, ...stats }] : []
  })
}

/** Locate the real window center; points farther than half a hop are unobserved. */
export function nearestTimeIndex(times: number[], target: number, hopS?: number): number {
  if (times.length === 0 || !Number.isFinite(target)) return -1
  let low = 0
  let high = times.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (times[middle] < target) low = middle + 1
    else high = middle
  }
  const right = Math.min(low, times.length - 1)
  const left = Math.max(0, low - 1)
  const index = Math.abs(times[left] - target) <= Math.abs(times[right] - target) ? left : right
  const fallbackHop = times.length > 1
    ? median(times.slice(1).map((time, i) => time - times[i]).filter((delta) => delta > 0))
    : 0
  const hop = hopS != null && Number.isFinite(hopS) && hopS > 0 ? hopS : fallbackHop
  return Math.abs(times[index] - target) <= hop / 2 + 1e-9 ? index : -1
}

/** Shared y range that one sample cannot stretch, plus what it leaves outside.
 *
 *  Recharts auto-scales to the extremes, so SAIO block 5 pushed the axis to
 *  9,640 uV and flattened the other six channels living inside +-1,500. A
 *  percentile domain keeps the rhythms readable. Clipping the *view* must never
 *  clip the *data*: `clippedLow`/`clippedHigh` exist so the chart can say so,
 *  and the tooltip keeps reading the real value.
 *
 *  Percentiles alone always leave ~1 % of samples outside, so every recording
 *  reported a clipped axis. Samples within `reach` of the band's height beyond
 *  either edge are ordinary signal and are drawn; only what lies further out,
 *  a real excursion, is clipped, and the ordinary tail beside it stays visible.
 */
export function robustDomain(
  values: number[],
  lowPercentile = 0.5,
  highPercentile = 99.5,
  reach = 0.25
): { min: number; max: number; clippedLow: number; clippedHigh: number } | null {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return null
  const sorted = [...finite].sort((a, b) => a - b)
  const at = (percentile: number) => {
    const position = ((sorted.length - 1) * percentile) / 100
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  }
  let min = at(Math.max(0, Math.min(100, lowPercentile)))
  let max = at(Math.max(0, Math.min(100, highPercentile)))
  if (!(max > min)) {
    // A constant or near-constant channel still needs a drawable band.
    const pad = Math.max(Math.abs(min) * 0.05, 1)
    min -= pad
    max += pad
  } else {
    const slack = (max - min) * reach
    const lowLimit = min - slack
    const highLimit = max + slack
    min = sorted.find((value) => value >= lowLimit) ?? min
    max = sorted.findLast((value) => value <= highLimit) ?? max
  }
  return {
    min,
    max,
    clippedLow: finite.filter((value) => value < min).length,
    clippedHigh: finite.filter((value) => value > max).length,
  }
}

/** Spans of the channels actually on screen, in time order. */
export function visibleArtifactSpans(
  metadata: EegMetadata | undefined,
  channels: string[]
): EegArtifactSpan[] {
  const wanted = new Set(channels)
  return (metadata?.artifact_spans ?? [])
    .filter((span) => wanted.has(span.channel))
    .slice()
    .sort((a, b) => a.start_s - b.start_s)
}

const DETECTOR_LABELS: Record<EegArtifactSpan["detector"], string> = {
  amplitude: "amplitud (z robusto)",
  step: "escalón entre muestras",
  peak_to_peak: "pico a pico en ventana",
}

export function describeArtifactSpan(span: EegArtifactSpan) {
  const detector = DETECTOR_LABELS[span.detector] ?? span.detector
  const peak = span.peak_uV == null ? "—" : `${span.peak_uV.toFixed(1)} uV`
  const z = span.z == null ? "" : `, z ${span.z.toFixed(1)}`
  return `${formatChannel(span.channel)} ${span.start_s.toFixed(2)}–${span.end_s.toFixed(
    2
  )} s · pico ${peak}${z} · ${detector}`
}

const DETECTOR_ORDER: EegArtifactSpan["detector"][] = ["amplitude", "step", "peak_to_peak"]

/** One event on one channel, however many detector runs it left behind. */
export interface ArtifactSpanCluster {
  channel: string
  start_s: number
  end_s: number
  spans: EegArtifactSpan[]
  detectors: EegArtifactSpan["detector"][]
  /** The span peak furthest from zero, with its sign. */
  peak_uV: number | null
  z: number | null
}

/**
 * SAIO b5 F3 reports 16 spans between 119.4 s and 125.6 s: one excursion, then a
 * dozen sub-second amplitude runs 10 ms apart. Read as a list they bury the two
 * events that matter. Spans of a channel that overlap or sit within `maxGapS`
 * of each other become one cluster; the spans themselves are kept.
 */
export function clusterArtifactSpans(
  spans: EegArtifactSpan[],
  maxGapS = 0.5
): ArtifactSpanCluster[] {
  const byChannel = new Map<string, EegArtifactSpan[]>()
  for (const span of spans) {
    const list = byChannel.get(span.channel) ?? []
    list.push(span)
    byChannel.set(span.channel, list)
  }

  const clusters: ArtifactSpanCluster[] = []
  for (const [channel, list] of byChannel) {
    let current: ArtifactSpanCluster | null = null
    for (const span of [...list].sort((a, b) => a.start_s - b.start_s)) {
      if (current && span.start_s <= current.end_s + maxGapS) {
        current.spans.push(span)
        current.end_s = Math.max(current.end_s, span.end_s)
        continue
      }
      current = {
        channel,
        start_s: span.start_s,
        end_s: span.end_s,
        spans: [span],
        detectors: [],
        peak_uV: null,
        z: null,
      }
      clusters.push(current)
    }
  }

  for (const cluster of clusters) {
    const present = new Set(cluster.spans.map((span) => span.detector))
    cluster.detectors = DETECTOR_ORDER.filter((detector) => present.has(detector))
    for (const span of cluster.spans) {
      if (span.peak_uV != null && (cluster.peak_uV == null || Math.abs(span.peak_uV) > Math.abs(cluster.peak_uV))) {
        cluster.peak_uV = span.peak_uV
      }
      if (span.z != null && (cluster.z == null || span.z > cluster.z)) cluster.z = span.z
    }
  }
  return clusters.sort((a, b) => a.start_s - b.start_s || a.channel.localeCompare(b.channel))
}

/** "7.7–9.5 s", or one instant when the span is shorter than a tenth of a second. */
export function formatSpanRange(startS: number, endS: number) {
  return endS - startS < 0.1
    ? `${startS.toFixed(2)} s`
    : `${startS.toFixed(1)}–${endS.toFixed(1)} s`
}

export function describeArtifactCluster(cluster: ArtifactSpanCluster) {
  if (cluster.spans.length === 1) return describeArtifactSpan(cluster.spans[0])
  const peak = cluster.peak_uV == null ? "—" : `${cluster.peak_uV.toFixed(1)} uV`
  const z = cluster.z == null ? "" : `, z máx. ${cluster.z.toFixed(1)}`
  const detectors = cluster.detectors.map((detector) => DETECTOR_LABELS[detector] ?? detector).join(", ")
  return `${formatChannel(cluster.channel)} ${cluster.start_s.toFixed(2)}–${cluster.end_s.toFixed(
    2
  )} s · ${cluster.spans.length} tramos · pico ${peak}${z} · ${detectors}`
}

export interface ChannelQualityRow {
  channel: string
  quantizationStepUV: number | null
  repeatedFraction: number | null
  missingSamples: number
  validSamples: number
  medianOffset: number | null
  amplitudeZMax: number | null
  amplitudeOutlierSamples: number
  transientCandidates: number
  peakToPeakMaxUV: number | null
  peakToPeakExcursions: number
  /** The export declared no unit, or declared one that needed rescaling. */
  assumedUnit: boolean
  sourceUnit: string | null
  /** Coarser than its peers by more than an order of magnitude. */
  coarselyQuantized: boolean
}

/** Everything the backend already measured per channel, ready to be shown.
 *
 *  None of this is new computation; it was reported and never rendered.
 */
export function channelQualityRows(
  metadata: EegMetadata | undefined,
  channels: string[]
): ChannelQualityRow[] {
  const quality = metadata?.channels
  if (!quality) return []
  const assumed = new Set(metadata?.assumed_uV_channels ?? [])
  const steps = channels
    .map((channel) => quality[channel]?.quantization_step_uV)
    .filter((step): step is number => Number.isFinite(step) && (step as number) > 0)
  const finest = steps.length > 0 ? Math.min(...steps) : null
  return channels.flatMap((channel) => {
    const record: EegChannelQuality | undefined = quality[channel]
    if (!record) return []
    const step = record.quantization_step_uV
    return [
      {
        channel,
        quantizationStepUV: step,
        repeatedFraction:
          record.valid_samples > 0
            ? record.repeated_adjacent_samples / record.valid_samples
            : null,
        missingSamples: record.missing_samples,
        validSamples: record.valid_samples,
        medianOffset: record.median_offset,
        amplitudeZMax: record.amplitude_z_max,
        amplitudeOutlierSamples: record.amplitude_outlier_samples,
        transientCandidates: record.transient_candidates,
        peakToPeakMaxUV: record.peak_to_peak_max_uV,
        peakToPeakExcursions: record.peak_to_peak_excursions,
        assumedUnit: assumed.has(channel),
        sourceUnit: metadata?.source_units?.[channel] ?? null,
        coarselyQuantized:
          finest != null && step != null && step >= finest * 10,
      },
    ]
  })
}

/** Whether this participant predates the unit correction and needs re-ingesting.
 *
 *  `assumed_uV_channels` and `source_units` already say so; nothing in the UI
 *  did. Comparing a corrected participant against an uncorrected one is exactly
 *  the mistake this notice exists to prevent.
 */
export function reingestionNotice(metadata: EegMetadata | undefined): {
  needed: boolean
  rescaledChannels: string[]
  assumedChannels: string[]
  excludedChannels: string[]
} {
  const units = metadata?.source_units ?? {}
  const rescaled = Object.keys(units)
    .filter((channel) => {
      const unit = (units[channel] ?? "").toLowerCase()
      return unit === "kilo" || unit === "mv" || unit === "v"
    })
    .sort()
  const assumed = [...(metadata?.assumed_uV_channels ?? [])].sort()
  const excluded = [...(metadata?.excluded_channels ?? [])].sort()
  return {
    needed: rescaled.length > 0 || assumed.length > 0 || excluded.length > 0,
    rescaledChannels: rescaled,
    assumedChannels: assumed,
    excludedChannels: excluded,
  }
}

/** The backend repeats as prose some facts the tab already shows from
 *  structured fields: the unit caveats, the PSD incomplete-channel chip and the
 *  envelope chip. Prefixes follow `eeg_signal.py` and `eeg_analytics_service.py`;
 *  a prefix that drifts only lets a duplicate back in, it never hides a fact. */
const SHOWN_ELSEWHERE: { prefix: string; shown: (metadata: EegMetadata) => boolean }[] = [
  { prefix: "Unidad EEG no declarada", shown: (m) => reingestionNotice(m).assumedChannels.length > 0 },
  { prefix: "Canales con unidad ambigua excluidos", shown: (m) => reingestionNotice(m).excludedChannels.length > 0 },
  {
    prefix: "Escala kilo corregida",
    shown: (m) => Object.values(m.source_units ?? {}).some((unit) => (unit ?? "").toLowerCase() === "kilo"),
  },
  { prefix: "Canales sin un tramo válido suficiente", shown: (m) => (m.incomplete_channels?.length ?? 0) > 0 },
  { prefix: "El gráfico muestra la envolvente", shown: (m) => m.display_reduction === ENVELOPE_REDUCTION },
]

export const ENVELOPE_REDUCTION = "min_max_envelope_per_bucket"

/** Warnings for the quality card, without the ones another element already states. */
export function qualityCardWarnings(metadata: EegMetadata | undefined): string[] {
  if (!metadata) return []
  const hidden = SHOWN_ELSEWHERE.filter((rule) => rule.shown(metadata)).map((rule) => rule.prefix)
  return (metadata.warnings ?? []).filter((warning) => !hidden.some((prefix) => warning.startsWith(prefix)))
}

/** The backend's own sentence for the display envelope, when it applies. */
export function envelopeWarning(metadata: EegMetadata | undefined): string | null {
  if (metadata?.display_reduction !== ENVELOPE_REDUCTION) return null
  return (
    metadata.warnings?.find((warning) => warning.startsWith("El gráfico muestra la envolvente")) ??
    "El gráfico muestra la envolvente (mínimo y máximo) de cada tramo; las estadísticas usan toda la señal válida."
  )
}

export interface MontageLane {
  channel: string
  offset: number
}

/** One lane per channel, evenly spaced, so a shared axis cannot flatten anyone.
 *
 *  `spacing` is the vertical distance between lanes in uV, taken from the
 *  widest robust span among the channels shown, so every lane is drawn at the
 *  same uV-per-pixel and the scale bar means one thing for all of them.
 */
export function montageLanes(
  channels: string[],
  spans: Record<string, number>
): { lanes: MontageLane[]; spacing: number; domain: [number, number] } {
  const widest = Math.max(
    ...channels.map((channel) => spans[channel] ?? 0).filter(Number.isFinite),
    0
  )
  const spacing = widest > 0 ? widest * 1.2 : 1
  const lanes = channels.map((channel, index) => ({
    channel,
    offset: (channels.length - 1 - index) * spacing,
  }))
  return {
    lanes,
    spacing,
    domain: [-spacing / 2, (channels.length - 1) * spacing + spacing / 2],
  }
}
