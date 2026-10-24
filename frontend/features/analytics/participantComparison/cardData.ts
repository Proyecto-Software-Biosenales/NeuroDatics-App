"use client"

import { ApiError } from "@/lib/api/apiFetch"
import { AnalyticsApi } from "../api/analyticsApi"
import { requestAnalytics } from "../analyticsCache"
import type { TemporalChartPoint } from "../comparison/ComparisonCharts"
import type {
  AoiMetricsData,
  EegMetadata,
  EegPsdData,
  EegSpectrogramData,
  EegTimeseriesData,
  EegTopographyData,
  FixationData,
  FixationHistogramData,
  ScanpathData,
} from "../types"
import {
  CARD_POINT_BUDGET,
  EEG_CARD_POINT_BUDGET,
  isConcreteScenario,
  KIND_INFO,
  sourceTimeBasis,
  type ParticipantComparisonSpec,
} from "./spec"
import {
  axisOffsets,
  participantWindow,
  type ScenarioTiming,
  type WindowTransfer,
} from "./timeAlignment"

export interface CardContext {
  projectId: string
  generation: number | null
  participant: string
  spec: ParticipantComparisonSpec
  transfer: WindowTransfer
  /** Source frame time (seconds since onset) for topography. */
  frameStimulusTime: number | null
}

interface TimeAxis {
  /** Drawn time = data time + displayOffset. */
  displayOffset: number
  /** Recording time = data time + recordingOffset; null if unknown. */
  recordingOffset: number | null
  aligned: boolean
}

export type CardResult =
  | { type: "empty"; message: string }
  | ({
      type: "temporal"
      points: TemporalChartPoint[]
      /** Keys present in `points`, before any display filter. */
      keys: string[]
      channels: string[]
      metadata: EegMetadata | null
      /** EEG only: the server's full-resolution figures per channel, as the EEG view shows them. */
      statistics?: EegTimeseriesData["statistics"] | null
    } & TimeAxis)
  | { type: "histogram"; data: FixationHistogramData }
  | { type: "psd"; data: EegPsdData }
  | ({ type: "spectrogram"; data: EegSpectrogramData } & TimeAxis)
  | ({ type: "topography"; data: EegTopographyData; frameIndex: number } & TimeAxis)
  | { type: "heatmap"; fixation: FixationData; overlay: Blob | null }
  | { type: "scanpath"; data: ScanpathData }
  | { type: "aoi"; data: AoiMetricsData }

const NO_DATA = "No hay datos registrados para este participante."

function emptyScenario(scenario: string) {
  return `Este participante no tiene registros en el escenario «${scenario}».`
}

// One timing request per participant and scenario, shared by every card kind.
export function getScenarioTiming(
  projectId: string,
  generation: number | null,
  participant: string,
  scenario: string,
  signal: AbortSignal
): Promise<ScenarioTiming> {
  return requestAnalytics(projectId, "scenario-timing", [generation, participant, scenario],
    (sharedSignal) => AnalyticsApi.getScenarioTiming(projectId, participant, scenario, sharedSignal), signal)
}

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN
}

function nearestIndex(values: number[], target: number) {
  let best = -1
  let distance = Number.POSITIVE_INFINITY
  values.forEach((value, index) => {
    const gap = Math.abs(value - target)
    if (Number.isFinite(gap) && gap < distance) {
      best = index
      distance = gap
    }
  })
  return best
}

/** Everything one card needs, fetched inside a single queue slot. */
export async function loadCardData(context: CardContext, signal: AbortSignal): Promise<CardResult> {
  try {
    return await loadCardDataUnsafe(context, signal)
  } catch (error) {
    if (isNotFound(error)) return { type: "empty", message: NO_DATA }
    throw error
  }
}

async function loadCardDataUnsafe(context: CardContext, signal: AbortSignal): Promise<CardResult> {
  const { projectId, generation, participant, spec, transfer } = context
  const scenario = spec.scenario
  const concrete = isConcreteScenario(scenario)
  const basis = sourceTimeBasis(spec.kind)
  const needsTiming =
    (concrete && (KIND_INFO[spec.kind].temporal || spec.kind === "eeg_spectrogram" || spec.kind === "eeg_topography" || transfer.kind === "relative")) ||
    spec.kind === "gsr"
  const timing = needsTiming ? await getScenarioTiming(projectId, generation, participant, scenario, signal) : null
  if (concrete && needsTiming && timing?.onset_s == null) return { type: "empty", message: emptyScenario(scenario) }
  const window = participantWindow(transfer, basis, timing)
  if (!window) return { type: "empty", message: "Sin registros de este participante en la ventana temporal seleccionada." }
  const axis = axisOffsets(basis, scenario, timing)

  switch (spec.kind) {
    case "pupil":
    case "gaze":
    case "distance":
    case "gsr": {
      const kind = spec.kind
      const data = await AnalyticsApi.getDisplayTimeseries(
        kind,
        projectId,
        participant,
        scenario,
        { startTimeS: window.start, endTimeS: window.end, maxPoints: CARD_POINT_BUDGET, decimation: "minmax_envelope" },
        signal
      )
      const columns: Record<string, ReadonlyArray<number | null>> =
        kind === "pupil"
          ? {
              left: (data as { smooth_left: number[] }).smooth_left,
              right: (data as { smooth_right: number[] }).smooth_right,
              // Raw diameters: the group modes validate samples like the pupil view does.
              raw_left: (data as { left: number[] }).left,
              raw_right: (data as { right: number[] }).right,
            }
          : kind === "gaze"
            ? { x: (data as { gx_clean: (number | null)[] }).gx_clean, y: (data as { gy_clean: (number | null)[] }).gy_clean }
            : kind === "distance"
              ? { distance: (data as { distance_cm: number[] }).distance_cm }
              : { smooth: (data as { gsr_smooth: number[] }).gsr_smooth, raw: (data as { gsr: number[] }).gsr }
      if (!data.time.length) return { type: "empty", message: `Sin datos de ${KIND_INFO[kind].label.toLowerCase()} para este participante.` }
      const points = data.time.map((time, index) => {
        const point: TemporalChartPoint = {
          time: time + axis.displayOffset,
          sourceTime: axis.recordingOffset == null ? Number.NaN : time + axis.recordingOffset,
        }
        for (const [key, values] of Object.entries(columns)) point[key] = finite(values[index])
        return point
      })
      return { type: "temporal", points, keys: Object.keys(columns), channels: [], metadata: null, ...axis }
    }
    case "eeg_timeseries": {
      const { channels, smoothWindowS } = spec.params
      const data = await AnalyticsApi.getEegTimeseries(
        projectId, participant, scenario, channels, smoothWindowS, EEG_CARD_POINT_BUDGET,
        window.start, window.end, "minmax_envelope", signal
      )
      if (!data.time.length || !data.channels.length) return { type: "empty", message: "Sin datos EEG para este participante." }
      const keys = data.channels.flatMap((channel) => [`${channel}_raw`, `${channel}_smooth`])
      const points = data.time.map((time, index) => {
        const point: TemporalChartPoint = {
          time: time + axis.displayOffset,
          sourceTime: time + (axis.recordingOffset ?? 0),
        }
        for (const channel of data.channels) {
          point[`${channel}_raw`] = finite(data.raw[channel]?.[index])
          point[`${channel}_smooth`] = finite(data.smooth[channel]?.[index])
        }
        return point
      })
      return {
        type: "temporal", points, keys, channels: data.channels, metadata: data.metadata ?? null,
        statistics: data.statistics ?? null, ...axis,
      }
    }
    case "fixation_histogram": {
      const data = await AnalyticsApi.getFixationHistogram(projectId, participant, scenario, spec.params.minFixationDurationMs, signal)
      if (!data.bins.length || !data.n_fixations) return { type: "empty", message: "Sin fijaciones para este participante con el umbral seleccionado." }
      return { type: "histogram", data }
    }
    case "eeg_psd": {
      const { channels, maxFreqHz, useDb, maxPoints, excludeArtifactWindows } = spec.params
      const data = await AnalyticsApi.getEegPsd(
        projectId, participant, scenario, channels, maxFreqHz, useDb, maxPoints,
        window.start, window.end, excludeArtifactWindows, signal
      )
      if (!data.frequency.length || !data.channels.length) return { type: "empty", message: "Sin datos EEG para este participante." }
      return { type: "psd", data }
    }
    case "eeg_spectrogram": {
      const { channels, maxFreqHz, useDb, normalize, maxTimeBins, maxFrequencyBins, perChannelColorDomain } = spec.params
      const data = await AnalyticsApi.getEegSpectrogram(
        projectId, participant, scenario, channels, maxFreqHz, useDb, normalize, maxTimeBins, maxFrequencyBins,
        window.start, window.end, perChannelColorDomain, signal
      )
      if (!data.time.length || !data.channels.length || !data.frequency.length) return { type: "empty", message: "Sin datos EEG para este participante." }
      return { type: "spectrogram", data: { ...data, time: data.time.map((time) => time + axis.displayOffset) }, ...axis }
    }
    case "eeg_topography": {
      const { channels, windowS, overlapRatio, removeDc, maxFrames } = spec.params
      const data = await AnalyticsApi.getEegTopography(
        projectId, participant, scenario, channels, windowS, overlapRatio, removeDc, maxFrames,
        window.start, window.end, signal
      )
      if (!data.time.length || !data.channels.length) return { type: "empty", message: "Sin datos EEG para este participante." }
      const displayTimes = data.time.map((time) => time + axis.displayOffset)
      const target = context.frameStimulusTime
      const frameIndex = target == null ? 0 : nearestIndex(displayTimes, target)
      if (frameIndex < 0 || (target != null && Math.abs(displayTimes[frameIndex] - target) > Math.max(windowS, 0.5))) {
        return { type: "empty", message: "Este participante no tiene una ventana EEG en ese instante del estímulo." }
      }
      return { type: "topography", data: { ...data, time: displayTimes }, frameIndex, ...axis }
    }
    case "heatmap": {
      const minimum = spec.params.minFixationDurationMs
      const fixation = await AnalyticsApi.getFixationData(projectId, participant, scenario, minimum, signal)
      if (!fixation.fixations.length) return { type: "empty", message: "Sin fijaciones para este participante en el escenario." }
      // The group modes draw the fixations or one group map: no image per participant.
      if (spec.params.overlay === false) return { type: "heatmap", fixation, overlay: null }
      const token =
        fixation.coordinate_transform?.contract_fingerprint ?? fixation.coordinate_transform?.status ?? "screen-stimulus-v1"
      let overlay: Blob | null = null
      try {
        overlay = (
          await AnalyticsApi.getHeatmapOverlay(projectId, participant, scenario, token, fixation.cache_generation ?? 0, minimum, signal)
        ).blob
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
      return { type: "heatmap", fixation, overlay }
    }
    case "scanpath": {
      const data = await AnalyticsApi.getScanpath(projectId, participant, scenario, spec.params.minFixationDurationMs, signal)
      if (!data.objectives.length) return { type: "empty", message: "Sin recorridos para este participante en el escenario." }
      return { type: "scanpath", data }
    }
    case "aoi": {
      const data = await AnalyticsApi.getAoiMetrics(projectId, participant, scenario, spec.params.minFixationDurationMs, signal)
      return { type: "aoi", data }
    }
  }
}
