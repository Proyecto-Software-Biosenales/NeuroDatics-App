"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { Activity, TrendingDown, TrendingUp } from "lucide-react"

import { KpiCard } from "@/components/ui/KpiCard"
import { AnalyticsChartShell } from "./AnalyticsChartShell"
import { useFixationHistogram } from "../hooks/useAnalyticsData"
import type { FixationHistogramBin } from "../types"

interface FixationHistogramTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

interface HistogramTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
}

function HistogramTooltip({ active, payload, label }: HistogramTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0].payload as FixationHistogramBin

  return (
    <div className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-2 font-medium text-gray-300">Rango: {label} ms</p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
          <span>Fijaciones: {data.conteo}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
          <span>Porcentaje: {data.porcentaje.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-300" />
          <span>Promedio: {Math.round(data.promedio_ms)} ms</span>
        </div>
      </div>
    </div>
  )
}

export function FixationHistogramTab({
  projectId,
  participantCode,
  scenario,
}: FixationHistogramTabProps) {
  const { data, loading, error } = useFixationHistogram(
    projectId,
    participantCode,
    scenario
  )

  if (!participantCode) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Selecciona un participante para ver el histograma.
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-900/10">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="analytics-stack">
        <div className="analytics-kpi-grid">
          <div className="h-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="analytics-state-frame-compact w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!data || data.bins.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Sin datos de fijación para este escenario.
        </p>
      </div>
    )
  }

  return (
    <div className="analytics-stack">
      {/* KPIs */}
      <div className="analytics-kpi-grid">
        <KpiCard
          label="Media"
          value={data.mean_duration_ms}
          unit="ms"
          description="Duración promedio de fijación"
          Icon={Activity}
          iconBgClass="bg-indigo-100 dark:bg-indigo-900/40"
          iconColorClass="text-indigo-500"
          labelColorClass="text-indigo-600 dark:text-indigo-400"
          hoverBgClass="hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
          activeBgClass="bg-indigo-50 dark:bg-indigo-950/30"
          active={false}
        />
        <KpiCard
          label="Mínimo"
          value={data.min_duration_ms}
          unit="ms"
          description="Duración más corta registrada"
          Icon={TrendingDown}
          iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
          iconColorClass="text-emerald-500"
          labelColorClass="text-emerald-600 dark:text-emerald-400"
          hoverBgClass="hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30"
          activeBgClass="bg-emerald-50/50 dark:bg-emerald-950/30"
          active={false}
        />
        <KpiCard
          label="Máximo"
          value={data.max_duration_ms}
          unit="ms"
          description="Duración más larga registrada"
          Icon={TrendingUp}
          iconBgClass="bg-rose-100 dark:bg-rose-900/40"
          iconColorClass="text-rose-500"
          labelColorClass="text-rose-600 dark:text-rose-400"
          hoverBgClass="hover:bg-rose-50/50 dark:hover:bg-rose-950/30"
          activeBgClass="bg-rose-50/50 dark:bg-rose-950/30"
          active={false}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Histograma de fijación</CardTitle>
          <CardDescription>
            Distribución de duraciones de fijación en milisegundos. N = {data.n_fixations} fijaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsChartShell xAxisLabel="Duración (ms)" variant="compact">
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <BarChart
                data={data.bins}
                margin={{ top: 16, right: 24, left: 0, bottom: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis
                  dataKey="label"
                  height={36}
                  minTickGap={8}
                  tick={{ fontSize: 12 }}
                  tickMargin={8}
                />
                <YAxis
                  allowDecimals={false}
                  label={{
                    value: "Fijaciones",
                    angle: -90,
                    position: "insideLeft",
                    style: { textAnchor: "middle" },
                  }}
                />
                <RechartsTooltip content={<HistogramTooltip />} cursor={{ fill: "rgba(59, 130, 246, 0.1)" }} />
                <Bar
                  dataKey="conteo"
                  name="Fijaciones"
                  fill="#3B82F6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsChartShell>
        </CardContent>
      </Card>

      {/* Stats Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Rango (ms)</th>
                <th className="px-6 py-3 font-medium">Fijaciones</th>
                <th className="px-6 py-3 font-medium">Porcentaje</th>
                <th className="px-6 py-3 font-medium">Promedio (ms)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.bins.map((bin) => (
                <tr
                  key={bin.label}
                  className="transition-colors hover:bg-muted/30"
                >
                  <td className="px-6 py-3">{bin.label}</td>
                  <td className="px-6 py-3">{bin.conteo}</td>
                  <td className="px-6 py-3">{bin.porcentaje.toFixed(1)}%</td>
                  <td className="px-6 py-3">
                    {Math.round(bin.promedio_ms)} ms
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-medium">
              <tr>
                <td className="px-6 py-3">Total</td>
                <td className="px-6 py-3">{data.n_fixations}</td>
                <td className="px-6 py-3">100%</td>
                <td className="px-6 py-3">{Math.round(data.mean_duration_ms)} ms</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}
