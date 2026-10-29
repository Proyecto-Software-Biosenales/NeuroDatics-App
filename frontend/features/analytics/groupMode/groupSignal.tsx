"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { requestAnalytics } from "../analyticsCache"
import type { StatRow } from "../components/StatisticsTable"
import type { FittedAxis } from "../fittedAxis"
import { useAnalyticsRevision } from "../hooks/useAnalyticsContext"
import { useGroupMode } from "./GroupModeProvider"
import { GroupKpiGrid, GroupStatsCard, type GroupKpi, type GroupStatEntry } from "./GroupStats"
import { GroupTemporalChart, type GroupTrace } from "./GroupTemporalChart"
import type { GroupView } from "./useGroupData"

/**
 * Group modes of the single-series views whose figures come from a statistics
 * endpoint (gaze, distance, GSR): one drawn series per participant plus that
 * participant's own statistics, asked exactly like its individual view asks.
 */

/** A view's statistics request, as `AnalyticsApi` declares it. */
export type StatisticsRequest<T> = (
  projectId: string,
  participantCode: string,
  scenario: string,
  startTimeS: number | null,
  endTimeS: number | null,
  signal?: AbortSignal
) => Promise<T>

type StatisticsState<T> = { status: "success"; data: T } | { status: "error"; data: null }

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError"

/**
 * Each participant's statistics over the whole scenario. Same operation and
 * arguments as the individual view's hook (`makeAnalyticsHook` with no time
 * window), so both share one cached answer. Returns a lookup by code; null
 * while that participant's answer is pending.
 */
export function useGroupStatistics<T>(
  operation: string,
  request: StatisticsRequest<T>,
  scenario: string,
  codes: readonly string[]
): (code: string) => StatisticsState<T> | null {
  const { projectId } = useGroupMode()
  const revision = useAnalyticsRevision()
  const [states, setStates] = useState<Record<string, StatisticsState<T>>>({})
  const codesKey = codes.join("\n")

  useEffect(() => {
    if (!projectId || !codesKey) return
    const controller = new AbortController()
    for (const code of codesKey.split("\n")) {
      const args: [string, string, string, null, null] = [projectId, code, scenario, null, null]
      const key = JSON.stringify([operation, revision, ...args])
      requestAnalytics(projectId, operation, args, (shared) => request(...args, shared), controller.signal, revision).then(
        (data) => {
          if (!controller.signal.aborted) setStates((current) => ({ ...current, [key]: { status: "success", data } }))
        },
        (error: unknown) => {
          if (controller.signal.aborted || isAbort(error)) return
          setStates((current) => ({ ...current, [key]: { status: "error", data: null } }))
        }
      )
    }
    return () => controller.abort()
  }, [codesKey, operation, projectId, request, revision, scenario])

  return useCallback(
    (code: string) => states[JSON.stringify([operation, revision, projectId, code, scenario, null, null])] ?? null,
    [operation, projectId, revision, scenario, states]
  )
}

export interface GroupSignalResults {
  traces: GroupTrace[]
  stats: GroupStatEntry[]
  /** Some drawn participant still waits for its statistics. */
  statsLoading: boolean
}

/**
 * The drawn series `column` of every participant (on `view.timeAxis`: aligned
 * on the scenario onset, or each recording's own time with «Todos los
 * escenarios») and a table row per participant built by `statRow` from its
 * own statistics, the same function the individual view uses. With a concrete
 * scenario, a participant whose recording could not be aligned is left out of
 * the chart, with an empty row, like one without data.
 */
export function useGroupSignal<T>(
  view: GroupView,
  {
    scenario,
    column,
    operation,
    request,
    statRow,
  }: {
    scenario: string
    column: string
    operation: string
    request: StatisticsRequest<T>
    statRow: (serie: string, stats: T | null, count: number | null) => StatRow
  }
): GroupSignalResults {
  const entries = view.data.entries
  const needsAlignment = view.timeAxis.aligned
  const drawn = useMemo(() => {
    const series = new Map<string, GroupTrace & { count: number }>()
    for (const entry of entries) {
      const result = entry.result
      if (entry.status !== "success" || result?.type !== "temporal" || (needsAlignment && !result.aligned)) continue
      const time = result.points.map((point) => point.time)
      const value = result.points.map((point) => {
        const sample = point[column]
        return typeof sample === "number" && Number.isFinite(sample) ? sample : Number.NaN
      })
      const count = value.reduce((total, sample) => (Number.isFinite(sample) ? total + 1 : total), 0)
      series.set(entry.participant.code, { participant: entry.participant, time, value, count })
    }
    return series
  }, [column, entries, needsAlignment])
  const codes = useMemo(() => [...drawn.keys()], [drawn])
  const statisticsOf = useGroupStatistics(operation, request, scenario, codes)

  return useMemo(() => {
    const stats: GroupStatEntry[] = []
    let statsLoading = false
    for (const entry of entries) {
      const series = drawn.get(entry.participant.code)
      if (!series) {
        if (entry.status === "empty" || entry.status === "success") stats.push({ participant: entry.participant, row: null })
        continue
      }
      const state = statisticsOf(entry.participant.code)
      if (!state) {
        statsLoading = true
        continue
      }
      stats.push({ participant: entry.participant, row: statRow(entry.participant.label, state.data, series.count) })
    }
    const traces = [...drawn.values()].map(({ participant, time, value }) => ({ participant, time, value }))
    return { traces, stats, statsLoading }
  }, [drawn, entries, statRow, statisticsOf])
}

/** What a participant row of these views is computed from; `scope` is `GroupTimeAxis.scope`. */
export const signalStatsBasis = (scope: string) =>
  `Cada fila se calcula sobre la señal completa de ese participante en ${scope}, igual que en su vista individual; «Número» cuenta las muestras dibujadas.`

/**
 * The chart area in a group mode: the averaged KPI cards and the group
 * chart, where a click picks the instant `GroupStimulusCard` shows.
 */
export function GroupSignalChart({
  view,
  results,
  kpis,
  unit,
  yLabel,
  yAxis,
  decimals,
  averageDetail,
  averageColor,
}: {
  view: GroupView
  results: GroupSignalResults
  kpis: GroupKpi[]
  unit: string
  yLabel: string
  yAxis: (values: number[]) => FittedAxis | null
  decimals?: number
  averageDetail?: ReactNode
  /** The mean line in «Promedio»: the colour of the view's own line. */
  averageColor?: string
}) {
  if (!view.mode) return null
  return (
    <>
      <GroupKpiGrid
        kpis={kpis}
        entries={results.stats}
        loading={results.stats.length === 0 && (view.data.loading || results.statsLoading)}
      />
      <GroupTemporalChart
        mode={view.mode}
        traces={results.traces}
        data={view.data}
        timeAxis={view.timeAxis}
        unit={unit}
        yLabel={yLabel}
        yAxis={yAxis}
        decimals={decimals}
        averageDetail={averageDetail}
        averageColor={averageColor}
        selectedTime={view.selectedTime}
        onSelectTime={view.selectTime}
      />
    </>
  )
}

/** The statistics card in a group mode. */
export function GroupSignalStats({
  view,
  results,
  unit,
  detail,
}: {
  view: GroupView
  results: GroupSignalResults
  unit: string
  detail?: ReactNode
}) {
  if (!view.mode) return null
  return (
    <GroupStatsCard
      entries={results.stats}
      loading={results.stats.length === 0 && (view.data.loading || results.statsLoading)}
      unit={unit}
      detail={detail}
      basis={signalStatsBasis(view.timeAxis.scope)}
    />
  )
}
