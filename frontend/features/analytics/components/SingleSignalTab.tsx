"use client"

import type { ComponentProps, ReactNode } from "react"
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
  kpis: ReactNode
  legend: AnalyticsChartLegendItem[]
  chart: ReactNode
  children: ReactNode
}

export function SingleSignalTab({
  label, description, unit, emptyText, statisticsDescription, signal,
  headerActions, kpis, legend, chart, children,
}: SingleSignalTabProps) {
  return (
    <div className="analytics-stack">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <CardTitle className="text-xl">{label}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {headerActions}
            <TimeWindowControls {...signal.timeWindowControls} />
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
      {children}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Estadísticas</CardTitle>
          <CardDescription>{statisticsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <StatisticsTable
            rows={signal.tableRows}
            summaryRow={signal.tableRows[0]}
            loading={signal.statsLoading || !signal.stats}
            unit={` ${unit}`}
          />
        </CardContent>
      </Card>
    </div>
  )
}
