"use client"
import { AnalyticsModeSelector } from "@/features/analytics/components/AnalyticsModeSelector"

import { useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  Clock,
  Gauge,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { KpiCard } from "@/features/analytics/components/KpiCard"
import { LINE_CHART_MARGIN } from "@/features/analytics/components/AnalyticsChartShell"
import { cn } from "@/lib/utils"
import {
  useGsrStatistics,
  useGsrTimeseries,
} from "../hooks/useAnalyticsData"
import { StimulusFixationCard } from "./StimulusFixationCard"
import type { GsrTimeseriesData } from "../types"
import { useSingleSignalData } from "../hooks/useSingleSignalData"
import { SingleSignalTab } from "./SingleSignalTab"
import { axisTickDecimals, formatAxisTick } from "../chartZoom"

type SignalMode = "smooth" | "raw" | "both"

interface GsrTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

interface GsrLinePoint {
  time: number
  gsr: number
  gsr_smooth: number
}

const GSR_SIGNAL = {
  useTimeseries: useGsrTimeseries,
  useStatistics: useGsrStatistics,
  serie: "GSR",
  toPoints: (data: GsrTimeseriesData): GsrLinePoint[] => data.time.map((time, index) => ({
    time, gsr: data.gsr[index], gsr_smooth: data.gsr_smooth[index],
  })),
  valueOf: (point: GsrLinePoint) => point.gsr_smooth,
}

interface GsrTooltipPayloadEntry {
  value: number
  name: string
  color: string
}

interface GsrTooltipProps {
  active?: boolean
  payload?: GsrTooltipPayloadEntry[]
  label?: number
}

function GsrTooltip({ active, payload, label }: GsrTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      {typeof label === "number" && (
        <p className="mb-1 font-medium text-gray-300">{label.toFixed(1)}s</p>
      )}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.name}: {Number(entry.value).toFixed(4)} µS</span>
        </div>
      ))}
    </div>
  )
}

function readClickedTime(state: unknown): number | null {
  if (!state || typeof state !== "object") return null

  const maybeState = state as {
    activePayload?: Array<{ payload?: { time?: unknown } }>
    activeLabel?: unknown
  }
  const fromPayload = maybeState.activePayload?.[0]?.payload?.time
  const fromLabel = maybeState.activeLabel
  const candidate = typeof fromPayload === "number" ? fromPayload : Number(fromLabel)

  return Number.isFinite(candidate) ? candidate : null
}

export function GsrTab({ projectId, participantCode, scenario }: GsrTabProps) {
  const [signalMode, setSignalMode] = useState<SignalMode>("smooth")

  const signal = useSingleSignalData(
    { projectId, participantCode, scenario }, GSR_SIGNAL
  )
  const { chartData, chartDomain, minTime, maxTime, selectedPoint, selectedTime, setSelectedTime, stats, statsLoading } = signal
  const chartLegend = [
    ...(signalMode === "smooth" || signalMode === "both"
      ? [{ label: "GSR suavizada", color: "#10B981" }]
      : []),
    ...(signalMode === "raw" || signalMode === "both"
      ? [{ label: "GSR cruda", color: "#6366F1" }]
      : []),
  ]

  const handleKpiClick = (time: number | null) => {
    if (time == null) return
    setSelectedTime((current) => (current === time ? null : time))
  }

  const handleChartClick = (state: unknown) => {
    const time = readClickedTime(state)
    if (time == null) return
    setSelectedTime(time)
  }

  return (
    <SingleSignalTab
      label="Respuesta galvánica"
      description="Conductancia de la piel a lo largo del tiempo, suavizada con ventana de un segundo."
      unit="µS"
      emptyText="No hay datos de GSR para los filtros seleccionados."
      statisticsDescription="Resumen numérico de la respuesta galvánica suavizada: tendencia, variabilidad y extremos."
      signal={signal}
      legend={chartLegend}
      headerActions={
        <AnalyticsModeSelector value={signalMode} onValueChange={setSignalMode} options={[
          { key: "smooth", label: "Suavizada" },
          { key: "raw", label: "Cruda" },
          { key: "both", label: "Ambas" },
        ]} />
      }
      kpis={[
        {
          label: "Media",
          value: stats?.mean,
          description: "Promedio suavizado",
          tooltip: "Promedio de respuesta galvánica en el intervalo visualizado",
          tooltipExtra: stats?.raw_mean != null ? `Valor real: ${stats.raw_mean.toFixed(4)} µS` : undefined,
          Icon: Activity,
          iconBgClass: "bg-emerald-100 dark:bg-emerald-900/40",
          iconColorClass: "text-emerald-600 dark:text-emerald-400",
          labelColorClass: "text-emerald-700 dark:text-emerald-400",
          hoverBgClass: "hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
          activeBgClass: "bg-emerald-50 dark:bg-emerald-950/30",
          onClick: undefined as (() => void) | undefined,
          active: false,
        },
        {
          label: "Mínimo",
          value: stats?.min,
          description: "Valor más bajo",
          tooltip: "Valor mínimo registrado en la señal suavizada",
          tooltipExtra: stats?.raw_min != null ? `Valor real: ${stats.raw_min.toFixed(4)} µS` : undefined,
          Icon: TrendingDown,
          iconBgClass: "bg-emerald-100 dark:bg-emerald-900/40",
          iconColorClass: "text-emerald-600 dark:text-emerald-400",
          labelColorClass: "text-emerald-700 dark:text-emerald-400",
          hoverBgClass: "hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
          activeBgClass: "bg-emerald-50 dark:bg-emerald-950/30",
          onClick: minTime != null ? () => handleKpiClick(minTime) : undefined,
          active: selectedTime === minTime,
        },
        {
          label: "Máximo",
          value: stats?.max,
          description: "Pico de conductancia",
          tooltip: "Valor máximo registrado en la señal suavizada",
          tooltipExtra: stats?.raw_max != null ? `Valor real: ${stats.raw_max.toFixed(4)} µS` : undefined,
          Icon: TrendingUp,
          iconBgClass: "bg-rose-100 dark:bg-rose-900/40",
          iconColorClass: "text-rose-600 dark:text-rose-400",
          labelColorClass: "text-rose-700 dark:text-rose-400",
          hoverBgClass: "hover:bg-rose-50 dark:hover:bg-rose-950/30",
          activeBgClass: "bg-rose-50 dark:bg-rose-950/30",
          onClick: maxTime != null ? () => handleKpiClick(maxTime) : undefined,
          active: selectedTime === maxTime,
        },
      ].map((cardProps) => (
        <KpiCard
          key={cardProps.label}
          loading={statsLoading}
          unit="µS"
          decimals={4}
          {...cardProps}
        />
      ))}
      chart={
        <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
          <AreaChart
            data={chartData}
            {...signal.dragZoom.chartProps(handleChartClick)}
            margin={LINE_CHART_MARGIN}
          >
            <defs>
              <linearGradient id="gsrSmoothFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="time"
              type="number"
              domain={chartDomain}
              tickFormatter={(value) => formatAxisTick(value, axisTickDecimals(chartDomain))}
              tickMargin={8}
            />
            <YAxis
              width={80}
              label={{ value: "Respuesta galvánica (µS)", angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" } }}
            />
            <RechartsTooltip content={<GsrTooltip />} />

            {typeof stats?.mean === "number" ? (
              <ReferenceLine y={stats.mean} stroke="#9CA3AF" strokeDasharray="4 4" />
            ) : null}

            {selectedTime != null ? (
              <ReferenceLine
                x={selectedTime}
                className="analytics-selected-time"
                stroke="#374151"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: `${Math.round(selectedTime)}s`, position: "top", fontSize: 11, fill: "#374151" }}
              />
            ) : null}

            {signalMode === "smooth" || signalMode === "both" ? (
              <Area
                type="monotone"
                dataKey="gsr_smooth"
                name="GSR suavizada"
                stroke="#10B981"
                strokeWidth={1.8}
                fill="url(#gsrSmoothFill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : null}

            {signalMode === "raw" || signalMode === "both" ? (
              <Line
                type="monotone"
                dataKey="gsr"
                name="GSR cruda"
                stroke="#6366F1"
                strokeWidth={signalMode === "raw" ? 1.6 : 1}
                strokeOpacity={signalMode === "raw" ? 1 : 0.45}
                dot={false}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      }
    >
      <StimulusFixationCard
        projectId={projectId}
        participantCode={participantCode}
        scenario={scenario}
        selectedTime={selectedTime}
        selectedValue={selectedPoint?.gsr_smooth ?? null}
        selectedValueLabel="GSR"
        selectedValueSub="µS suavizada"
        selectedValueDecimals={4}
        totalDurationS={chartData[chartData.length - 1]?.time ?? null}
        description="Ubicación de la mirada del participante durante el instante seleccionado de respuesta galvánica."
        emptyText="Haz clic en el gráfico o en Mínimo / Máximo para ver la mirada del participante"
        metricDescription="la respuesta galvánica"
        onClearSelection={() => setSelectedTime(null)}
      />

      {selectedPoint ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Punto seleccionado</CardTitle>
            <CardDescription>
              Lectura puntual de la respuesta galvánica en la señal suavizada y cruda.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  label: "SEGUNDO",
                  value: selectedPoint.time.toFixed(1),
                  sub: "tiempo relativo",
                  Icon: Clock,
                  bg: "bg-blue-50 dark:bg-blue-950/40",
                  iconColor: "text-blue-500",
                },
                {
                  label: "SUAVIZADA",
                  value: selectedPoint.gsr_smooth.toFixed(4),
                  sub: "µS",
                  Icon: Gauge,
                  bg: "bg-emerald-50 dark:bg-emerald-950/40",
                  iconColor: "text-emerald-500",
                },
                {
                  label: "CRUDA",
                  value: selectedPoint.gsr.toFixed(4),
                  sub: "µS",
                  Icon: Zap,
                  bg: "bg-violet-50 dark:bg-violet-950/40",
                  iconColor: "text-violet-500",
                },
              ].map(({ label, value, sub, Icon, bg, iconColor }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 roomy:p-4"
                >
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg roomy:h-10 roomy:w-10 roomy:rounded-xl", bg)}>
                    <Icon className={cn("h-4 w-4 roomy:h-5 roomy:w-5", iconColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-normal uppercase tracking-widest text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-0.5 text-lg font-bold leading-tight text-foreground roomy:mt-1 roomy:text-2xl">
                      {value}
                    </p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </SingleSignalTab>
  )
}
