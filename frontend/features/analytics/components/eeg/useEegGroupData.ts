"use client"

import { useMemo } from "react"
import { percentileColorDomain, sliceEegPsd, sliceEegSpectrogram, type ZoomRange } from "../../chartZoom"
import {
  averageFigures,
  buildStats,
  finiteValues,
  psdSeriesStats,
  spectrogramStatsOf,
  topographyFrameStats,
  topographyRowsOf,
  type AveragedFigures,
} from "../../eegPresentation"
import { meanKeyedSeries, meanSpectra, meanSpectrograms, resampleTrace, type KeyedSeriesMean, type SpectrumMean } from "../../groupMode/aggregate"
import type { GroupParticipant } from "../../groupMode/GroupModeProvider"
import type { GroupTrace } from "../../groupMode/GroupTemporalChart"
import type { GroupData } from "../../groupMode/useGroupData"
import type { ColorDomain, EegSpectrogramData, EegTopographyData } from "../../types"
import { EEG_CHANNELS } from "./eegViewShared"

/** One participant's figures in a group table; null when it has none. */
export interface EegGroupEntry<K extends string> {
  participant: GroupParticipant
  values: Partial<Record<K, number | null>> | null
}

export interface EegGroupFigures<K extends string> {
  entries: EegGroupEntry<K>[]
  average: AveragedFigures<K>
}

function figures<K extends string>(entries: EegGroupEntry<K>[], fields: readonly K[], options?: Parameters<typeof averageFigures<K>>[2]): EegGroupFigures<K> {
  return { entries, average: averageFigures(entries.map((entry) => entry.values), fields, options) }
}

const byMontage = (channels: Iterable<string>) => {
  const present = new Set(channels)
  return [...EEG_CHANNELS.filter((channel) => present.has(channel)), ...[...present].filter((channel) => !EEG_CHANNELS.includes(channel))]
}

/** A colour scale for averaged values: the backend's 2nd–98th percentiles, never flat. */
function colorDomainOf(values: Array<number | null | undefined>): ColorDomain {
  const domain = percentileColorDomain(values) ?? { min: 0, max: 1 }
  if (domain.max > domain.min) return domain
  const pad = Math.max(Math.abs(domain.min) * 0.05, 1e-6)
  return { min: domain.min - pad, max: domain.max + pad }
}

const finiteOrNull = (value: number) => (Number.isFinite(value) ? value : null)

// ---------------------------------------------------------------------------
// EEG por canal
// ---------------------------------------------------------------------------

export const TIMESERIES_FIELDS = ["count", "rms", "mean", "std", "median", "min", "max"] as const
export type TimeseriesField = (typeof TIMESERIES_FIELDS)[number]

/**
 * One channel per participant: a mean over channels describes no electrode
 * (channel medians differ by hundreds of µV), so the group modes draw the
 * channel chosen in «Canal», like the view's own cards. Figures are the
 * server's full-resolution ones for that channel and signal.
 */
export function useEegGroupTimeseries(data: GroupData, channel: string | null, signal: "smooth" | "raw") {
  return useMemo(() => {
    const traces: GroupTrace[] = []
    const entries: EegGroupEntry<TimeseriesField>[] = []
    for (const entry of data.entries) {
      const { participant } = entry
      if (entry.status === "empty") entries.push({ participant, values: null })
      if (entry.status !== "success" || entry.result?.type !== "temporal" || !channel) continue
      const result = entry.result
      if (!result.channels.includes(channel)) {
        entries.push({ participant, values: null })
        continue
      }
      const key = `${channel}_${signal}`
      const time = result.points.map((point) => point.time)
      const value = result.points.map((point) => (Number.isFinite(point[key]) ? point[key] : Number.NaN))
      traces.push({ participant, time, value })
      const server = result.statistics?.[signal]?.[channel]
      // Results cached before the statistics were kept fall back to the drawn samples.
      const stats = server && server.count > 0 ? server : buildStats(channel, finiteValues(value))
      entries.push({ participant, values: stats ? { count: stats.count, rms: stats.rms, mean: stats.mean, std: stats.std, median: stats.median, min: stats.min, max: stats.max } : null })
    }
    return { traces, ...figures(entries, TIMESERIES_FIELDS, { round: ["count"] }) }
  }, [channel, data.entries, signal])
}

// ---------------------------------------------------------------------------
// Densidad espectral
// ---------------------------------------------------------------------------

export const PSD_FIELDS = ["count", "peakFrequency", "peakPower", "mean", "std", "median", "min", "max"] as const
export type PsdField = (typeof PSD_FIELDS)[number]
const PSD_LEVELS: PsdField[] = ["peakPower", "mean", "median", "min", "max"]

export interface GroupPsdSeries {
  participant: GroupParticipant
  /** On `GroupPsd.frequency`; NaN outside the participant's own range. */
  power: ArrayLike<number>
}

export interface GroupPsd extends EegGroupFigures<PsdField> {
  series: GroupPsdSeries[]
  mean: SpectrumMean
  /** Full (unzoomed) frequency axis, to validate a drag zoom. */
  fullFrequency: number[]
  unit: string
  db: boolean
}

function sameValues(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false
  return true
}

/**
 * Each participant's spectrum is the mean of its selected channels, taken in
 * linear power; the group mean is again in linear power, shown in dB after.
 * A frequency zoom narrows every spectrum and every figure.
 */
export function useEegGroupPsd(data: GroupData, zoom: ZoomRange | null): GroupPsd {
  return useMemo(() => {
    const spectra: Array<{ participant: GroupParticipant; frequency: Float64Array; power: Float64Array }> = []
    const entries: EegGroupEntry<PsdField>[] = []
    let db = true
    let unit = "dB"
    let fullFrequency: number[] = []
    for (const entry of data.entries) {
      const { participant } = entry
      if (entry.status === "empty") entries.push({ participant, values: null })
      if (entry.status !== "success" || entry.result?.type !== "psd") continue
      const full = entry.result.data
      if (spectra.length === 0) {
        db = full.use_db
        unit = full.unit
        fullFrequency = full.frequency
      }
      const psd = sliceEegPsd(full, zoom) ?? full
      const own = meanSpectra(
        psd.channels.map((channel) => ({ frequency: psd.frequency, power: (psd.power[channel] ?? []).map((value) => value ?? Number.NaN) })),
        { db: full.use_db }
      )
      if (own.frequency.length === 0) {
        entries.push({ participant, values: null })
        continue
      }
      spectra.push({ participant, frequency: own.frequency, power: own.mean })
      const stats = psdSeriesStats(participant.code, own.frequency, own.mean)
      entries.push({ participant, values: stats })
    }
    const mean = meanSpectra(spectra, { db })
    const series = spectra.map(({ participant, frequency, power }) => ({
      participant,
      power: sameValues(frequency, mean.frequency) ? power : resampleTrace({ x: frequency, y: power }, mean.frequency),
    }))
    return { series, mean, fullFrequency, unit, db, ...figures(entries, PSD_FIELDS, { round: ["count"], db: db ? PSD_LEVELS : [] }) }
  }, [data.entries, zoom])
}

// ---------------------------------------------------------------------------
// Espectrograma
// ---------------------------------------------------------------------------

export const SPECTROGRAM_FIELDS = [
  "maxFrequency", "peakFrequency", "peakTime", "peakPower", "meanPower", "stdPower", "medianPower", "minPower", "maxPower",
] as const
export type SpectrogramField = (typeof SPECTROGRAM_FIELDS)[number]
const SPECTROGRAM_LEVELS: SpectrogramField[] = ["peakPower", "meanPower", "medianPower", "minPower", "maxPower"]

/** Most windows and frequency bins the averaged spectrogram keeps, like the view's own request. */
const MAX_TIME_BINS = 600
const MAX_FREQUENCY_BINS = 256

/**
 * The averaged spectrogram as the view's own data, so the same panels draw
 * it: a cell-wise mean in linear power on a common stimulus-time × frequency
 * grid. Figures pool every visible channel of each participant, inside the
 * time zoom.
 */
export function useEegGroupSpectrogram(data: GroupData, perChannelColorDomain: boolean, zoom: ZoomRange | null) {
  const averaged = useMemo<EegSpectrogramData | null>(() => {
    const results = data.successes.flatMap(({ result }) => (result.type === "spectrogram" ? [result.data] : []))
    if (results.length === 0) return null
    const first = results[0]
    const channels = byMontage(results.flatMap((result) => result.channels))
    const average = meanSpectrograms(
      results.map((result) => ({ time: result.time, frequency: result.frequency, power: result.power })),
      channels,
      { db: first.use_db, maxTimePoints: MAX_TIME_BINS, maxFrequencyPoints: MAX_FREQUENCY_BINS }
    )
    if (average.time.length === 0 || average.frequency.length === 0) return null
    const power = Object.fromEntries(channels.map((channel) => [channel, average.mean[channel].map((row) => row.map(finiteOrNull))]))
    const drawn = channels.filter((channel) => power[channel].some((row) => row.some((value) => value != null)))
    return {
      time: Array.from(average.time),
      frequency: Array.from(average.frequency),
      channels: drawn,
      available_channels: byMontage(results.flatMap((result) => result.available_channels)),
      sampling_rate_hz: first.sampling_rate_hz,
      use_db: first.use_db,
      normalize: first.normalize,
      unit: first.unit,
      power,
      color_domain: colorDomainOf(drawn.flatMap((channel) => power[channel].flat())),
      channel_color_domain: perChannelColorDomain
        ? Object.fromEntries(drawn.map((channel) => [channel, colorDomainOf(power[channel].flat())]))
        : undefined,
    }
  }, [data.successes, perChannelColorDomain])

  const stats = useMemo(() => {
    const entries: EegGroupEntry<SpectrogramField>[] = []
    let db = true
    for (const entry of data.entries) {
      const { participant } = entry
      if (entry.status === "empty") entries.push({ participant, values: null })
      if (entry.status !== "success" || entry.result?.type !== "spectrogram") continue
      const spectrogram = sliceEegSpectrogram(entry.result.data, zoom) ?? entry.result.data
      db = spectrogram.use_db
      const matrices = spectrogram.channels.flatMap((channel) => (spectrogram.power[channel] ? [spectrogram.power[channel]] : []))
      const row = spectrogramStatsOf(participant.code, spectrogram.frequency, spectrogram.time, matrices)
      entries.push({
        participant,
        values: row ? { ...row, maxFrequency: spectrogram.frequency[spectrogram.frequency.length - 1] ?? null } : null,
      })
    }
    return figures(entries, SPECTROGRAM_FIELDS, { db: db ? SPECTROGRAM_LEVELS : [] })
  }, [data.entries, zoom])

  return { averaged, ...stats }
}

// ---------------------------------------------------------------------------
// Topografía
// ---------------------------------------------------------------------------

export const TOPOGRAPHY_FIELDS = ["strongest", "meanPower", "minPower", "maxPower"] as const
export type TopographyField = (typeof TOPOGRAPHY_FIELDS)[number]

export interface GroupTopography {
  /** The averaged topography as the view's own data; its frames are the common grid. */
  averaged: EegTopographyData | null
  series: KeyedSeriesMean | null
  /** Participants in `series` input order. */
  participants: GroupParticipant[]
}

/**
 * Per electrode, the mean over participants on a common stimulus-time grid of
 * windows (linear interpolation between a participant's own windows, never
 * across a gap). The slider then moves over that grid.
 */
export function useEegGroupTopography(data: GroupData): GroupTopography {
  return useMemo(() => {
    const successes = data.successes.flatMap(({ participant, result }) => (result.type === "topography" ? [{ participant, data: result.data }] : []))
    if (successes.length === 0) return { averaged: null, series: null, participants: [] }
    const first = successes[0].data
    const channels = byMontage(successes.flatMap(({ data: topography }) => topography.channels))
    const series = meanKeyedSeries(
      successes.map(({ data: topography }) => ({ time: topography.time, values: topography.power })),
      channels,
      MAX_TIME_BINS
    )
    const positions: Record<string, number[]> = {}
    for (const { data: topography } of successes) {
      for (const [channel, position] of Object.entries(topography.positions)) positions[channel] ??= position
    }
    const power = Object.fromEntries(channels.map((channel) => [channel, Array.from(series.mean[channel], finiteOrNull)]))
    return {
      series,
      participants: successes.map(({ participant }) => participant),
      averaged: {
        time: Array.from(series.grid),
        channels,
        available_channels: byMontage(successes.flatMap(({ data: topography }) => topography.available_channels)),
        sampling_rate_hz: first.sampling_rate_hz,
        unit: first.unit,
        positions,
        power,
        color_domain: colorDomainOf(Object.values(power).flat()),
        window_s: first.window_s,
        overlap_ratio: first.overlap_ratio,
        remove_dc: first.remove_dc,
      },
    }
  }, [data.successes])
}

/** Each participant's topography figures at one frame of the common grid, as the view computes them. */
export function groupTopographyFigures(group: GroupTopography, data: GroupData, frameIndex: number): EegGroupFigures<TopographyField> {
  const { series, averaged } = group
  const entries: EegGroupEntry<TopographyField>[] = []
  for (const entry of data.entries) {
    const { participant } = entry
    if (entry.status === "empty") entries.push({ participant, values: null })
    if (entry.status !== "success" || !series || !averaged) continue
    const position = group.participants.findIndex((item) => item.code === participant.code)
    if (position < 0) continue
    const rows = topographyRowsOf(averaged.channels, averaged.positions, (channel) => series.resampled[channel]?.[position]?.[frameIndex])
    const stats = topographyFrameStats(rows, series.grid[frameIndex] ?? null)
    entries.push({
      participant,
      values: rows.length > 0 ? { strongest: stats.strongest?.value ?? null, meanPower: stats.meanPower, minPower: stats.minPower, maxPower: stats.maxPower } : null,
    })
  }
  return figures(entries, TOPOGRAPHY_FIELDS)
}
