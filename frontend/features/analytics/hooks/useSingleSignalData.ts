"use client"

import { useMemo, useState } from "react"
import type { StatRow } from "../components/StatisticsTable"
import { useChartDragZoom } from "../components/ChartDragZoom"
import { useTimeWindow } from "./useZoomHistory"

interface SignalStatistics {
  mean: number
  baseline: number
  std: number
  median: number
  min: number
  max: number
}

type SignalHook<T> = (
  projectId: string,
  participantCode: string | null,
  scenario: string,
  start: number | null,
  end: number | null
) => { data: T | null; loading: boolean }

// Each tab keeps its scientific series and gaze controller. Only the common
// request/window and sample selection lifecycle is shared here.
export function useSingleSignalData<T, Point extends { time: number }, Stats extends SignalStatistics>(
  { projectId, participantCode, scenario }: {
    projectId: string
    participantCode: string | null
    scenario: string
  },
  { useTimeseries, useStatistics, toPoints, valueOf, serie }: {
    useTimeseries: SignalHook<T>
    useStatistics: SignalHook<Stats>
    toPoints: (data: T) => Point[]
    valueOf: (point: Point) => number
    serie: string
  },
  onTimeWindowChange?: () => void
) {
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const windowState = useTimeWindow(() => {
    setSelectedTime(null)
    onTimeWindowChange?.()
  })
  const timeWindow = windowState.window
  const { data, loading: timeseriesLoading } = useTimeseries(
    projectId, participantCode, scenario, timeWindow.start, timeWindow.end
  )
  const { data: stats, loading: statsLoading } = useStatistics(
    projectId, participantCode, scenario, timeWindow.start, timeWindow.end
  )
  const chartData = useMemo(() => data ? toPoints(data) : [], [data, toPoints])
  // A selection reference line must never expand the plotted time range.
  const chartDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (!chartData.length) return ["dataMin", "dataMax"]
    return [chartData[0].time, chartData[chartData.length - 1].time]
  }, [chartData])
  const { minTime, maxTime } = useMemo(() => {
    if (!chartData.length) return { minTime: null, maxTime: null }
    let min = Infinity
    let max = -Infinity
    let minTime = chartData[0].time
    let maxTime = chartData[0].time
    for (const point of chartData) {
      const value = valueOf(point)
      if (value < min) {
        min = value
        minTime = point.time
      }
      if (value > max) {
        max = value
        maxTime = point.time
      }
    }
    return { minTime, maxTime }
  }, [chartData, valueOf])
  const selectedPoint = useMemo(() => {
    if (selectedTime == null || !chartData.length) return null
    let nearest = chartData[0]
    let minDiff = Math.abs(nearest.time - selectedTime)
    for (const point of chartData) {
      const diff = Math.abs(point.time - selectedTime)
      if (diff < minDiff) {
        minDiff = diff
        nearest = point
      }
    }
    return nearest
  }, [selectedTime, chartData])
  const tableRows = useMemo<StatRow[]>(() => [{
    serie,
    count: chartData.length || null,
    baseline: stats?.baseline ?? null,
    std: stats?.std ?? null,
    median: stats?.median ?? null,
    min: stats?.min ?? null,
    max: stats?.max ?? null,
    peak: stats?.max != null && stats?.baseline != null && stats.baseline !== 0
      ? ((stats.max - stats.baseline) / Math.abs(stats.baseline)) * 100
      : null,
  }], [serie, chartData.length, stats])

  // A dragged range behaves exactly like typing it into the window controls.
  const dragZoom = useChartDragZoom(windowState.zoomTo)

  return {
    chartData, chartDomain, minTime, maxTime, selectedPoint, selectedTime, setSelectedTime,
    stats, statsLoading, timeseriesLoading, tableRows,
    dragZoom,
    onZoomReset: windowState.isZoomed ? windowState.reset : undefined,
    onZoomBack: windowState.canGoBack ? windowState.back : undefined,
    timeWindowControls: {
      draftStart: windowState.draft.start,
      draftEnd: windowState.draft.end,
      appliedWindow: timeWindow,
      error: windowState.error,
      loading: timeseriesLoading || statsLoading,
      onDraftStartChange: (start: string) => windowState.setDraft(current => ({ ...current, start })),
      onDraftEndChange: (end: string) => windowState.setDraft(current => ({ ...current, end })),
      onApply: windowState.apply,
      onReset: windowState.reset,
    },
  }
}
