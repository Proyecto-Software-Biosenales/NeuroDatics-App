"use client"

import type { ComponentProps, ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AnalyticsChartShell, type AnalyticsChartLegendItem } from "./AnalyticsChartShell"
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
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{label}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {headerActions}
        </CardHeader>
        <CardContent>
          <TimeWindowControls {...signal.timeWindowControls} />
          <div className="analytics-kpi-grid">{kpis}</div>
          {signal.timeseriesLoading ? (
            <Skeleton className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
          ) : signal.chartData.length === 0 ? (
            <div className="analytics-state-frame flex items-center justify-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <AnalyticsChartShell legend={legend}>{chart}</AnalyticsChartShell>
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
