"use client"

import type { ComponentProps, ReactNode } from "react"
import { useCompareParticipantsSpec } from "../participantComparison/ParticipantComparisonProvider"
import type { ParticipantComparisonSpec } from "../participantComparison/spec"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AnalyticsChartShell, type AnalyticsChartLegendItem } from "./AnalyticsChartShell"
import type { ChartDragZoom } from "./ChartDragZoom"
import { StatisticsTable, type StatRow } from "./StatisticsTable"
import { TimeWindowControls } from "./TimeWindowControls"

interface SingleSignalTabProps {
  label: string
  description: string
  unit: string
  emptyText: string
  statisticsDescription: string
  signal: {
    chartData: unknown[]
    stats: unknown
    timeseriesLoading: boolean
    statsLoading: boolean
    tableRows: StatRow[]
    timeWindowControls: ComponentProps<typeof TimeWindowControls>
    dragZoom: ChartDragZoom
    onZoomReset?: () => void
    onZoomBack?: () => void
  }
  headerActions?: ReactNode
  /** Opens the same chart for every participant with these parameters. */
  compareSpec?: () => ParticipantComparisonSpec
  kpis: ReactNode
  legend: AnalyticsChartLegendItem[]
  chart: ReactNode
  children: ReactNode
  /**
   * «Superposición» / «Promedio»: replaces the chart area, the stimulus card
   * (children) and the statistics card, and hides the time window, which
   * belongs to one recording.
   */
  group?: {
    active: boolean
    description: string
    chart: ReactNode
    stimulus: ReactNode
    statistics: ReactNode
  }
}

export function SingleSignalTab({
  label, description, unit, emptyText, statisticsDescription, signal,
  headerActions, compareSpec, kpis, legend, chart, children, group,
}: SingleSignalTabProps) {
  useCompareParticipantsSpec(compareSpec ?? null)
  const grouped = group?.active ? group : null
  return (
    <div className="analytics-stack">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <CardTitle className="text-xl">{label}</CardTitle>
            <CardDescription>{grouped ? grouped.description : description}</CardDescription>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {headerActions}
            {/* Recording seconds belong to one recording: no window in a group mode. */}
            {grouped ? null : <TimeWindowControls {...signal.timeWindowControls} />}
          </div>
        </CardHeader>
        <CardContent>
          {grouped ? grouped.chart : <>
          <div className="analytics-kpi-grid">{kpis}</div>
          {signal.timeseriesLoading ? (
            <Skeleton className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
          ) : signal.chartData.length === 0 ? (
            <div className="analytics-state-frame flex items-center justify-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <AnalyticsChartShell
              legend={legend}
              dragZoom={signal.dragZoom}
              onZoomReset={signal.onZoomReset}
              onZoomBack={signal.onZoomBack}
            >
              {chart}
            </AnalyticsChartShell>
          )}
          </>}
        </CardContent>
      </Card>
      {grouped ? <>
      {grouped.stimulus}
      {grouped.statistics}
      </> : <>
      {children}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Estadísticas</CardTitle>
          <CardDescription>{statisticsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <StatisticsTable
            rows={signal.tableRows}
            loading={signal.statsLoading || !signal.stats}
            unit={` ${unit}`}
          />
        </CardContent>
      </Card>
      </>}
    </div>
  )
}
