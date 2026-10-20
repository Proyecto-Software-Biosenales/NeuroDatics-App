/**
 * What a "Comparar participantes" dialog shows: one chart kind, the source
 * view's parameters and its scenario. Pure data so it can be unit tested with
 * `node --test` and used as part of cache keys.
 */

import type { FixationDurationMs } from "../types"

export interface TimeWindow {
  start: number | null
  end: number | null
}

export interface ZoomRange {
  start: number
  end: number
}

export type ComparisonKind =
  | "pupil"
  | "gaze"
  | "distance"
  | "gsr"
  | "eeg_timeseries"
  | "fixation_histogram"
  | "eeg_psd"
  | "eeg_spectrogram"
  | "eeg_topography"
  | "heatmap"
  | "scanpath"
  | "aoi"

export type SignalMode = "smooth" | "raw" | "both"

export interface PupilParams {
  eyes: "both" | "left" | "right"
  window: TimeWindow
}
export interface GazeParams {
  axes: "both" | "x" | "y"
  window: TimeWindow
}
export interface DistanceParams {
  window: TimeWindow
}
/** The GSR tab counts time from the first valid GSR sample; so does `window`. */
export interface GsrParams {
  signalMode: SignalMode
  window: TimeWindow
}
export interface EegTimeseriesParams {
  channels: string[]
  signalMode: SignalMode
  smoothWindowS: number
  layout: "overlay" | "stacked"
  window: TimeWindow
}
export interface FixationHistogramParams {
  minFixationDurationMs: FixationDurationMs
}
export interface EegPsdParams {
  channels: string[]
  maxFreqHz: number | null
  useDb: boolean
  maxPoints: number
  excludeArtifactWindows: boolean
  window: TimeWindow
  frequencyZoom: ZoomRange | null
}
export interface EegSpectrogramParams {
  channels: string[]
  maxFreqHz: number | null
  useDb: boolean
  normalize: string
  maxTimeBins: number
  maxFrequencyBins: number
  perChannelColorDomain: boolean
  interpolate: boolean
  window: TimeWindow
  /** In recording seconds of the source participant, like `window`. */
  timeZoom: ZoomRange | null
}
export interface EegTopographyParams {
  channels: string[]
  windowS: number
  overlapRatio: number
  removeDc: boolean
  maxFrames: number
  window: TimeWindow
  /** Recording time of the frame shown in the source view. */
  frameTimeS: number | null
}
export interface SpatialParams {
  minFixationDurationMs: FixationDurationMs
  showAois: boolean
}

interface SpecBase<Kind extends ComparisonKind, Params> {
  kind: Kind
  /** Chart title as the source view shows it. */
  title: string
  scenario: string
  /** Participant whose view opened the dialog, if any. */
  sourceParticipant: string | null
  origin: "individual" | "comparativa"
  params: Params
}

export type ParticipantComparisonSpec =
  | SpecBase<"pupil", PupilParams>
  | SpecBase<"gaze", GazeParams>
  | SpecBase<"distance", DistanceParams>
  | SpecBase<"gsr", GsrParams>
  | SpecBase<"eeg_timeseries", EegTimeseriesParams>
  | SpecBase<"fixation_histogram", FixationHistogramParams>
  | SpecBase<"eeg_psd", EegPsdParams>
  | SpecBase<"eeg_spectrogram", EegSpectrogramParams>
  | SpecBase<"eeg_topography", EegTopographyParams>
  | SpecBase<"heatmap", SpatialParams>
  | SpecBase<"scanpath", SpatialParams>
  | SpecBase<"aoi", Pick<SpatialParams, "minFixationDurationMs">>

export interface KindInfo {
  label: string
  sensor: "EyeTracker" | "GSR" | "EEG"
  /** Line charts over time whose x axis can be aligned on the stimulus onset. */
  temporal: boolean
  /** The view only exists for one concrete scenario. */
  requiresConcreteScenario: boolean
  /** Card height in px; placeholders keep it so scrolling never jumps. */
  cardHeight: number
  /** Clicking the chart pins an instant to locate the gaze on the stimulus. */
  pinsStimulusPoint: boolean
}

export const KIND_INFO: Record<ComparisonKind, KindInfo> = {
  pupil: { label: "Dilatación pupilar", sensor: "EyeTracker", temporal: true, requiresConcreteScenario: false, cardHeight: 400, pinsStimulusPoint: true },
  gaze: { label: "Punto de mirada", sensor: "EyeTracker", temporal: true, requiresConcreteScenario: false, cardHeight: 400, pinsStimulusPoint: true },
  distance: { label: "Distancia al dispositivo", sensor: "EyeTracker", temporal: true, requiresConcreteScenario: false, cardHeight: 400, pinsStimulusPoint: true },
  gsr: { label: "Respuesta galvánica", sensor: "GSR", temporal: true, requiresConcreteScenario: false, cardHeight: 400, pinsStimulusPoint: true },
  eeg_timeseries: { label: "EEG por canal", sensor: "EEG", temporal: true, requiresConcreteScenario: false, cardHeight: 460, pinsStimulusPoint: true },
  fixation_histogram: { label: "Histograma de fijaciones", sensor: "EyeTracker", temporal: false, requiresConcreteScenario: false, cardHeight: 400, pinsStimulusPoint: false },
  eeg_psd: { label: "Densidad espectral EEG", sensor: "EEG", temporal: false, requiresConcreteScenario: false, cardHeight: 420, pinsStimulusPoint: false },
  eeg_spectrogram: { label: "Espectrograma de frecuencias", sensor: "EEG", temporal: false, requiresConcreteScenario: false, cardHeight: 560, pinsStimulusPoint: true },
  eeg_topography: { label: "Topografía EEG", sensor: "EEG", temporal: false, requiresConcreteScenario: true, cardHeight: 440, pinsStimulusPoint: false },
  heatmap: { label: "Mapa de calor", sensor: "EyeTracker", temporal: false, requiresConcreteScenario: true, cardHeight: 560, pinsStimulusPoint: false },
  scanpath: { label: "Mapa de recorridos", sensor: "EyeTracker", temporal: false, requiresConcreteScenario: true, cardHeight: 580, pinsStimulusPoint: false },
  aoi: { label: "Comparativa AOIs", sensor: "EyeTracker", temporal: false, requiresConcreteScenario: true, cardHeight: 400, pinsStimulusPoint: false },
}

/** Card point budgets. The individual views ask for 5,000 points per trace. */
export const CARD_POINT_BUDGET = 2000
export const EEG_CARD_POINT_BUDGET = 1600

/** Minimum fixation duration of fixation-derived charts; null for the rest. */
export function specMinFixationDuration(spec: ParticipantComparisonSpec): FixationDurationMs | null {
  switch (spec.kind) {
    case "fixation_histogram":
    case "heatmap":
    case "scanpath":
    case "aoi":
      return spec.params.minFixationDurationMs
    default:
      return null
  }
}

/** Same spec with another minimum fixation duration; other kinds pass through. */
export function withMinFixationDuration(spec: ParticipantComparisonSpec, value: FixationDurationMs): ParticipantComparisonSpec {
  const current = specMinFixationDuration(spec)
  if (current == null || current === value) return spec
  return { ...spec, params: { ...spec.params, minFixationDurationMs: value } } as ParticipantComparisonSpec
}

export function isConcreteScenario(scenario: string | null | undefined): boolean {
  const value = (scenario ?? "").trim()
  return value.length > 0 && value.toLowerCase() !== "all"
}

export function hasTimeWindow(window: TimeWindow | null | undefined): boolean {
  return window != null && (window.start != null || window.end != null)
}

export function specWindow(spec: ParticipantComparisonSpec): TimeWindow | null {
  const params = spec.params as { window?: TimeWindow }
  return params.window && hasTimeWindow(params.window) ? params.window : null
}

/** GSR keeps its tab's own axis; everything else speaks recording seconds. */
export function sourceTimeBasis(kind: ComparisonKind): "recording" | "gsr_relative" {
  return kind === "gsr" ? "gsr_relative" : "recording"
}

/** A restriction that makes the whole comparison impossible, in Spanish. */
export function specRestriction(spec: ParticipantComparisonSpec): string | null {
  if (!KIND_INFO[spec.kind].requiresConcreteScenario || isConcreteScenario(spec.scenario)) return null
  if (spec.kind === "eeg_topography") {
    return "La topografía compara el mismo instante del estímulo en cada grabación; con «Todos los escenarios» no existe ese instante común. Selecciona un escenario concreto."
  }
  return `${KIND_INFO[spec.kind].label} se calcula sobre la imagen de un estímulo concreto. Selecciona un escenario específico para compararlo entre participantes.`
}

/**
 * The part of the spec that changes what the server returns. Display-only
 * choices (eye, axis, signal mode, layout, zoom, AOI toggle) stay out so the
 * cache reuses one response for all of them.
 */
export function requestParams(spec: ParticipantComparisonSpec): Record<string, unknown> {
  switch (spec.kind) {
    case "pupil":
    case "gaze":
    case "distance":
    case "gsr":
      return { window: spec.params.window }
    case "eeg_timeseries":
      return { channels: spec.params.channels, smoothWindowS: spec.params.smoothWindowS, window: spec.params.window }
    case "fixation_histogram":
    case "aoi":
      return { minFixationDurationMs: spec.params.minFixationDurationMs }
    case "heatmap":
    case "scanpath":
      return { minFixationDurationMs: spec.params.minFixationDurationMs }
    case "eeg_psd": {
      const { channels, maxFreqHz, useDb, maxPoints, excludeArtifactWindows, window } = spec.params
      return { channels, maxFreqHz, useDb, maxPoints, excludeArtifactWindows, window }
    }
    case "eeg_spectrogram": {
      const { channels, maxFreqHz, useDb, normalize, maxTimeBins, maxFrequencyBins, perChannelColorDomain, window } = spec.params
      return { channels, maxFreqHz, useDb, normalize, maxTimeBins, maxFrequencyBins, perChannelColorDomain, window }
    }
    case "eeg_topography": {
      const { channels, windowS, overlapRatio, removeDc, maxFrames, window } = spec.params
      return { channels, windowS, overlapRatio, removeDc, maxFrames, window }
    }
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    )
  }
  return value
}

/** Deterministic JSON: equal objects give equal strings regardless of key order. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonical(value))
}

export interface CacheContext {
  projectId: string
  /** Ingestion generation: a re-processed project never reuses old results. */
  generation: number | null
}

/**
 * Identity of one card's result. Project, generation, participant, chart,
 * scenario and request parameters are all part of it; so is the source
 * participant whenever its timing is used to translate a time window.
 */
export function cardCacheKey(context: CacheContext, participant: string, spec: ParticipantComparisonSpec, budget: number): string {
  const windowed = specWindow(spec) != null && isConcreteScenario(spec.scenario)
  return stableStringify({
    v: 1,
    project: context.projectId,
    generation: context.generation,
    participant,
    kind: spec.kind,
    scenario: spec.scenario,
    params: requestParams(spec),
    windowSource: windowed ? spec.sourceParticipant : null,
    budget,
  })
}

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" })

/** Real participant codes, de-duplicated, in natural order (P2 before P10). */
export function orderParticipants(codes: readonly string[]): string[] {
  return [...new Set(codes.filter((code) => code.trim().length > 0))].sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0))
}

export type ParticipantLabels = Readonly<Record<string, string>>

/** Visible text for a participant code: its name or document label, or "Participante <code>". */
export function participantDisplay(code: string, labels?: ParticipantLabels): string {
  return labels?.[code] ?? `Participante ${code}`
}

/** Case- and accent-insensitive participant search over the code and its visible label. */
export function filterParticipants(codes: readonly string[], query: string, labels?: ParticipantLabels): string[] {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const needle = normalize(query.trim())
  if (!needle) return [...codes]
  return codes.filter((code) => normalize(code).includes(needle) || normalize(labels?.[code] ?? "").includes(needle))
}
