/**
 * AOI figures over several participants («Superposición» and «Promedio» of
 * the AOI view). AOIs belong to the scenario, so every participant reports
 * the same areas; a participant whose response lacks one simply does not
 * count toward it.
 */

import { meanByKey, type KeyedMean } from "./groupMode/aggregate"
import type { AoiMetricItem, AoiMetricsData } from "./types"

/** Every AOI any participant reports, by id, in first-seen order. */
export function unionAois(datasets: readonly AoiMetricsData[]): AoiMetricItem[] {
  const byId = new Map<string, AoiMetricItem>()
  for (const data of datasets) for (const aoi of data.aois) if (!byId.has(aoi.id)) byId.set(aoi.id, aoi)
  return [...byId.values()]
}

export const AOI_MEAN_FIELDS = [
  "total_dwell_time_percent",
  "total_dwell_time_ms",
  "fixation_count",
  "avg_fixation_duration_ms",
  "pupil_delta_percent",
  "avg_pupil_mm",
  "avg_distance_cm",
  "distance_delta_from_baseline_cm",
] as const
export type AoiMeanField = (typeof AOI_MEAN_FIELDS)[number]

export interface AveragedAoi {
  /** The area's shape, name and colour. */
  aoi: AoiMetricItem
  /** Participants that report this AOI. */
  n: number
  means: Record<AoiMeanField, KeyedMean>
}

/**
 * One participant's numbers for one AOI, as the individual table reads them:
 * a duration only when the area was fixated, pupil and distance only with
 * samples inside it.
 */
function aoiRecord(aoi: AoiMetricItem): Record<AoiMeanField, number | null> {
  const seen = aoi.fixation_count > 0
  const pupil = aoi.pupil_sample_count > 0
  const distance = aoi.distance_sample_count > 0
  return {
    total_dwell_time_percent: aoi.total_dwell_time_percent,
    total_dwell_time_ms: aoi.total_dwell_time_ms,
    fixation_count: aoi.fixation_count,
    avg_fixation_duration_ms: seen ? aoi.avg_fixation_duration_ms : null,
    pupil_delta_percent: pupil ? aoi.pupil_delta_percent : null,
    avg_pupil_mm: pupil ? aoi.avg_pupil_mm : null,
    avg_distance_cm: distance ? aoi.avg_distance_cm : null,
    distance_delta_from_baseline_cm: distance ? aoi.distance_delta_from_baseline_cm : null,
  }
}

/** Per AOI, the mean of each metric over the participants that have it, with n. */
export function averageAoiMetrics(datasets: readonly AoiMetricsData[]): AveragedAoi[] {
  return unionAois(datasets).map((aoi) => {
    const records = datasets.flatMap((data) => {
      const own = data.aois.find((item) => item.id === aoi.id)
      return own ? [aoiRecord(own)] : []
    })
    return { aoi, n: records.length, means: meanByKey<AoiMeanField>(records, AOI_MEAN_FIELDS) }
  })
}

/** A participant's AOI-tab figures: the KPI cards and each area's share of time. */
export function aoiParticipantFigures(data: AoiMetricsData): Record<string, number | null> {
  const figures: Record<string, number | null> = {
    aois: data.aois.length,
    fixations: data.total_fixations,
    observed: data.observed_aoi_dwell_time_percent,
  }
  for (const aoi of data.aois) figures[`aoi:${aoi.id}`] = aoi.total_dwell_time_percent
  return figures
}
