"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"

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
} from "@/components/ui/card"
import { Activity, TrendingDown, TrendingUp } from "lucide-react"

import { KpiCard } from "@/features/analytics/components/KpiCard"
import { AnalyticsChartShell } from "./AnalyticsChartShell"
import { useFixationHistogram } from "../hooks/useAnalyticsData"
import type {
  FixationDurationMs,
  FixationHistogramBin,
  FixationSensitivityData,
} from "../types"

interface FixationHistogramTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  minFixationDurationMs: FixationDurationMs
  onMinFixationDurationChange: (duration: FixationDurationMs) => void
  sensitivityData: FixationSensitivityData | null
  sensitivityLoading: boolean
  sensitivityError: string | null
}

interface HistogramTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
}

interface FixationSensitivityCardProps {
  data: FixationSensitivityData | null
  loading: boolean
  error: string | null
  selectedDurationMs: FixationDurationMs
  onSelectDuration: (duration: FixationDurationMs) => void
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

function formatDwellTime(durationMs: number) {
  return durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(1)} s`
    : `${Math.round(durationMs)} ms`
}

function FixationSensitivityCard({
  data,
  loading,
  error,
  selectedDurationMs,
  onSelectDuration,
}: FixationSensitivityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sensibilidad del umbral</CardTitle>
        <CardDescription>
          Compara cómo cambia la detección al exigir fijaciones más largas.
          Selecciona un umbral para actualizar todas las vistas de fijación.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <Skeleton className="h-44 animate-pulse rounded-lg bg-muted" />
        ) : error && !data ? (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50/50 px-4 text-center text-sm text-red-500 dark:border-red-900/50 dark:bg-red-900/10">
            No se pudo cargar la comparación de umbrales: {error}
          </div>
        ) : !data || data.points.length === 0 ? (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center text-sm text-muted-foreground">
            No hay suficientes fijaciones para comparar los umbrales
            disponibles.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table className="w-full min-w-[760px] text-left text-sm">
              <TableHeader className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <TableRow>
                  <TableHead className="px-4 py-3 font-semibold">Umbral</TableHead>
                  <TableHead className="px-4 py-3 text-right font-semibold">
                    Fijaciones
                  </TableHead>
                  <TableHead className="px-4 py-3 text-right font-semibold">
                    Dwell total
                  </TableHead>
                  <TableHead className="px-4 py-3 text-right font-semibold">Media</TableHead>
                  <TableHead className="px-4 py-3 text-right font-semibold">
                    Mediana
                  </TableHead>
                  <TableHead className="px-4 py-3 text-right font-semibold">
                    Dwell retenido
                  </TableHead>
                  <TableHead className="px-4 py-3 text-right font-semibold">
                    Selección
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {data.points.map((point) => {
                  const selected =
                    point.min_fixation_duration_ms === selectedDurationMs
                  return (
                    <TableRow
                      key={point.min_fixation_duration_ms}
                      className={
                        selected
                          ? "bg-blue-50/70 dark:bg-blue-950/20"
                          : "hover:bg-muted/25"
                      }
                    >
                      <TableCell className="px-4 py-3 font-semibold text-foreground tabular-nums">
                        {point.min_fixation_duration_ms} ms
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        {point.n_fixations}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        {formatDwellTime(point.total_duration_ms)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        {Math.round(point.mean_duration_ms)} ms
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        {Math.round(point.median_duration_ms)} ms
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums">
                        {point.retained_dwell_percent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <Button size="sm" variant="selection"
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            onSelectDuration(point.min_fixation_duration_ms)
                          }
                          className="rounded-full"
                        >
                          {selected ? "Activo" : "Usar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function FixationHistogramTab({
  projectId,
  participantCode,
  scenario,
  minFixationDurationMs,
  onMinFixationDurationChange,
  sensitivityData,
  sensitivityLoading,
  sensitivityError,
}: FixationHistogramTabProps) {
  const { data, loading, error } = useFixationHistogram(
    projectId,
    participantCode,
    scenario,
    minFixationDurationMs
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

  return (
    <div className="analytics-stack">
      <FixationSensitivityCard
        data={sensitivityData}
        loading={sensitivityLoading}
        error={sensitivityError}
        selectedDurationMs={minFixationDurationMs}
        onSelectDuration={onMinFixationDurationChange}
      />

      {loading ? (
        <>
          <div className="analytics-kpi-grid">
            <Skeleton className="h-28 animate-pulse rounded-lg bg-muted" />
            <Skeleton className="h-28 animate-pulse rounded-lg bg-muted" />
            <Skeleton className="h-28 animate-pulse rounded-lg bg-muted" />
          </div>
          <Skeleton className="analytics-state-frame-compact w-full animate-pulse rounded-lg bg-muted" />
          <Skeleton className="h-64 animate-pulse rounded-lg bg-muted" />
        </>
      ) : error ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-red-200 bg-red-50/50 px-4 text-center dark:border-red-900/50 dark:bg-red-900/10">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      ) : !data || data.bins.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center">
          <p className="text-sm text-muted-foreground">
            {!data
              ? "No hay datos de fijación para este escenario."
              : data.min_fixation_duration_ms == null
                ? "Sin fijaciones en los datos históricos para este escenario. El umbral original es desconocido."
                : `Sin fijaciones de al menos ${data.min_fixation_duration_ms} ms para este escenario.`}
          </p>
        </div>
      ) : (
        <>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Histograma de fijación</CardTitle>
              <CardDescription>
                {data.min_fixation_duration_ms == null
                  ? "Distribución reconstruida desde datos históricos; el umbral mínimo original es desconocido."
                  : `Distribución para el umbral de ${data.min_fixation_duration_ms} ms.`}{" "}
                N = {data.n_fixations} fijaciones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnalyticsChartShell xAxisLabel="Duración (ms)" variant="compact">
                <ResponsiveContainer
                  className="analytics-chart-plot-frame"
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={data.bins}
                    margin={{ top: 16, right: 24, left: 0, bottom: 12 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E5E7EB"
                    />
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
                    <RechartsTooltip
                      content={<HistogramTooltip />}
                      cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
                    />
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

          <Card>
            <div className="overflow-x-auto">
              <Table className="w-full text-left text-sm">
                <TableHeader className="bg-muted/50 text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-6 py-3 font-medium">Rango (ms)</TableHead>
                    <TableHead className="px-6 py-3 font-medium">Fijaciones</TableHead>
                    <TableHead className="px-6 py-3 font-medium">Porcentaje</TableHead>
                    <TableHead className="px-6 py-3 font-medium">Promedio (ms)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border">
                  {data.bins.map((bin) => (
                    <TableRow
                      key={bin.label}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="px-6 py-3">{bin.label}</TableCell>
                      <TableCell className="px-6 py-3">{bin.conteo}</TableCell>
                      <TableCell className="px-6 py-3">
                        {bin.porcentaje.toFixed(1)}%
                      </TableCell>
                      <TableCell className="px-6 py-3">
                        {Math.round(bin.promedio_ms)} ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter className="bg-muted/30 font-medium">
                  <TableRow>
                    <TableCell className="px-6 py-3">Total</TableCell>
                    <TableCell className="px-6 py-3">{data.n_fixations}</TableCell>
                    <TableCell className="px-6 py-3">100%</TableCell>
                    <TableCell className="px-6 py-3">
                      {Math.round(data.mean_duration_ms)} ms
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
