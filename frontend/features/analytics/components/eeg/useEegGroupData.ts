"use client"

import { useMemo } from "react"
import { percentileColorDomain, sliceEegPsd, sliceEegSpectrogram, type ZoomRange } from "../../chartZoom"
import {
  averageFigures,
  buildStats,
  finiteValues,
  psdSeriesStats,
  spectrogramStatsOf,
  type AveragedFigures,
} from "../../eegPresentation"
import { meanKeyedSeries, meanSpectra, meanSpectrograms, resampleTrace, typicalStep, type SpectrumMean } from "../../groupMode/aggregate"
import type { GroupParticipant } from "../../groupMode/GroupModeProvider"
import type { GroupData } from "../../groupMode/useGroupData"
import type { ColorDomain, EegSpectrogramData, EegTimeseriesData } from "../../types"
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
 * «Promedio» as the view's own data: per channel and signal, the mean over
 * participants on one common time grid (a participant without the channel
 * does not count), so the view draws every selected channel in its colour.
 * A drag zoom keeps the grid points inside it.
 */
export function useEegGroupTimeseriesAverage(data: GroupData, zoom: ZoomRange | null): EegTimeseriesData | null {
  const averaged = useMemo<EegTimeseriesData | null>(() => {
    const results = data.successes.flatMap(({ result }) => (result.type === "temporal" ? [result] : []))
    if (results.length === 0) return null
    const channels = byMontage(results.flatMap((result) => result.channels))
    const keys = channels.flatMap((channel) => [`${channel}_raw`, `${channel}_smooth`])
    const series = meanKeyedSeries(
      results.map((result) => {
        const present = new Set(result.keys)
        return {
          time: result.points.map((point) => point.time),
          values: Object.fromEntries(
            keys.filter((key) => present.has(key)).map((key) => [key, result.points.map((point) => (Number.isFinite(point[key]) ? point[key] : Number.NaN))])
          ),
        }
      }),
      keys
    )
    const column = (key: string) => Array.from(series.mean[key], finiteOrNull)
    const drawn = channels.filter((channel) => [`${channel}_raw`, `${channel}_smooth`].some((key) => series.n[key].some((count) => count > 0)))
    const step = typicalStep(series.grid)
    return {
      time: Array.from(series.grid),
      channels: drawn,
      // Every electrode stays selectable: a chip toggled off is simply not requested.
      available_channels: EEG_CHANNELS,
      sampling_rate_hz: Number.isFinite(step) && step > 0 ? 1 / step : 0,
      raw: Object.fromEntries(drawn.map((channel) => [channel, column(`${channel}_raw`)])),
      smooth: Object.fromEntries(drawn.map((channel) => [channel, column(`${channel}_smooth`)])),
    }
  }, [data.successes])
  return useMemo(() => {
    if (!averaged || !zoom) return averaged
    const inside = averaged.time.flatMap((time, index) => (time >= zoom.start && time <= zoom.end ? [index] : []))
    if (inside.length < 2) return averaged
    const pick = (values: Array<number | null>) => inside.map((index) => values[index])
    return {
      ...averaged,
      time: pick(averaged.time) as number[],
      raw: Object.fromEntries(Object.entries(averaged.raw).map(([channel, values]) => [channel, pick(values)])),
      smooth: Object.fromEntries(Object.entries(averaged.smooth).map(([channel, values]) => [channel, pick(values)])),
    }
  }, [averaged, zoom])
}

/**
 * Each participant's figures for the channel chosen in «Estadísticas de»: a
 * mean over channels describes no electrode (channel medians differ by
 * hundreds of µV). Figures are the server's full-resolution ones for that
 * channel and signal.
 */
export function useEegGroupTimeseries(data: GroupData, channel: string | null, signal: "smooth" | "raw") {
  return useMemo(() => {
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
      const value = result.points.map((point) => (Number.isFinite(point[key]) ? point[key] : Number.NaN))
      const server = result.statistics?.[signal]?.[channel]
      // Results cached before the statistics were kept fall back to the drawn samples.
      const stats = server && server.count > 0 ? server : buildStats(channel, finiteValues(value))
      entries.push({ participant, values: stats ? { count: stats.count, rms: stats.rms, mean: stats.mean, std: stats.std, median: stats.median, min: stats.min, max: stats.max } : null })
    }
    return figures(entries, TIMESERIES_FIELDS, { round: ["count"] })
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
 * it: a cell-wise mean in linear power on a common time × frequency
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
