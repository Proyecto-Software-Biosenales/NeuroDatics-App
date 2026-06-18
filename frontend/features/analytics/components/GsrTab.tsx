"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
} from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { StatisticsTable } from "@/components/ui/StatisticsTable"
import type { StatRow } from "@/components/ui/StatisticsTable"
import { cn } from "@/lib/utils"
import {
  useGsrStatistics,
  useGsrTimeseries,
} from "../hooks/useAnalyticsData"
import { StimulusFixationCard } from "./StimulusFixationCard"
import {
  EMPTY_TIME_WINDOW,
  EMPTY_TIME_WINDOW_DRAFT,
  TimeWindowControls,
  validateTimeWindowDraft,
  type TimeWindow,
  type TimeWindowDraft,
} from "./TimeWindowControls"

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
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [timeWindowDraft, setTimeWindowDraft] = useState<TimeWindowDraft>(EMPTY_TIME_WINDOW_DRAFT)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(EMPTY_TIME_WINDOW)
  const [timeWindowError, setTimeWindowError] = useState<string | null>(null)

  const { data: timeseriesData, loading: timeseriesLoading } = useGsrTimeseries(
    projectId,
    participantCode,
    scenario,
    timeWindow.start,
    timeWindow.end
  )
  const { data: stats, loading: statsLoading } = useGsrStatistics(
    projectId,
    participantCode,
    scenario,
    timeWindow.start,
    timeWindow.end
  )

  const chartData = useMemo<GsrLinePoint[]>(() => {
    if (!timeseriesData) return []
    return timeseriesData.time.map((time, index) => ({
      time,
      gsr: timeseriesData.gsr[index],
      gsr_smooth: timeseriesData.gsr_smooth[index],
    }))
  }, [timeseriesData])

  const chartDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (chartData.length === 0) return ["dataMin", "dataMax"]
    return [chartData[0].time, chartData[chartData.length - 1].time]
  }, [chartData])

  const minTime = useMemo(() => {
    if (chartData.length === 0) return null
    let minVal = Infinity
    let minT = chartData[0].time
    for (const pt of chartData) {
      if (pt.gsr_smooth < minVal) {
        minVal = pt.gsr_smooth
        minT = pt.time
      }
    }
    return minT
  }, [chartData])

  const maxTime = useMemo(() => {
    if (chartData.length === 0) return null
    let maxVal = -Infinity
    let maxT = chartData[0].time
    for (const pt of chartData) {
      if (pt.gsr_smooth > maxVal) {
        maxVal = pt.gsr_smooth
        maxT = pt.time
      }
    }
    return maxT
  }, [chartData])

  const selectedPoint = useMemo<GsrLinePoint | null>(() => {
    if (selectedTime == null || chartData.length === 0) return null
    let nearest = chartData[0]
    let minDiff = Math.abs(chartData[0].time - selectedTime)
    for (const pt of chartData) {
      const diff = Math.abs(pt.time - selectedTime)
      if (diff < minDiff) {
        minDiff = diff
        nearest = pt
      }
    }
    return nearest
  }, [selectedTime, chartData])

  const tableRows = useMemo<StatRow[]>(() => {
    const gsrRow: StatRow = {
      serie: "GSR",
      count: chartData.length > 0 ? chartData.length : null,
      baseline: stats?.baseline ?? null,
      std: stats?.std ?? null,
      median: stats?.median ?? null,
      min: stats?.min ?? null,
      max: stats?.max ?? null,
      peak:
        stats?.max != null && stats?.baseline != null && stats.baseline !== 0
          ? ((stats.max - stats.baseline) / Math.abs(stats.baseline)) * 100
          : null,
    }
    return [gsrRow]
  }, [chartData.length, stats])

  const handleKpiClick = (time: number | null) => {
    if (time == null) return
    setSelectedTime((current) => (current === time ? null : time))
  }

  const handleChartClick = (state: unknown) => {
    const time = readClickedTime(state)
    if (time == null) return
    setSelectedTime(time)
  }

  const handleApplyTimeWindow = () => {
    const { window, error } = validateTimeWindowDraft(timeWindowDraft)
    if (error || !window) {
      setTimeWindowError(error)
      return
    }

    setTimeWindow(window)
    setTimeWindowError(null)
    setSelectedTime(null)
  }

  const handleResetTimeWindow = () => {
    setTimeWindowDraft(EMPTY_TIME_WINDOW_DRAFT)
    setTimeWindow(EMPTY_TIME_WINDOW)
    setTimeWindowError(null)
    setSelectedTime(null)
  }

  return (
    <div className="space-y-6 py-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Respuesta galvánica</CardTitle>
            <CardDescription>
              Conductancia de la piel a lo largo del tiempo, suavizada con ventana de un segundo.
            </CardDescription>
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            {[
              { key: "smooth", label: "Suavizada" },
              { key: "raw", label: "Cruda" },
              { key: "both", label: "Ambas" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSignalMode(option.key as SignalMode)}
                className={cn(
                  "px-3 py-1.5 text-sm",
                  signalMode === option.key
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          <TimeWindowControls
            draftStart={timeWindowDraft.start}
            draftEnd={timeWindowDraft.end}
            appliedWindow={timeWindow}
            error={timeWindowError}
            loading={timeseriesLoading || statsLoading}
            onDraftStartChange={(value) =>
              setTimeWindowDraft((current) => ({ ...current, start: value }))
            }
            onDraftEndChange={(value) =>
              setTimeWindowDraft((current) => ({ ...current, end: value }))
            }
            onApply={handleApplyTimeWindow}
            onReset={handleResetTimeWindow}
          />

          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
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
                iconBgClass: "bg-cyan-100 dark:bg-cyan-900/40",
                iconColorClass: "text-cyan-600 dark:text-cyan-400",
                labelColorClass: "text-cyan-700 dark:text-cyan-400",
                hoverBgClass: "hover:bg-cyan-50 dark:hover:bg-cyan-950/30",
                activeBgClass: "bg-cyan-50 dark:bg-cyan-950/30",
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
          </div>

          {timeseriesLoading ? (
            <div className="h-[400px] w-full animate-pulse rounded-lg bg-muted" />
          ) : chartData.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
              No hay datos de GSR para los filtros seleccionados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <AreaChart
                data={chartData}
                onClick={handleChartClick}
                margin={{ top: 8, right: 24, left: 16, bottom: 80 }}
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
                  tickFormatter={(value) => String(Math.round(Number(value)))}
                  tickMargin={8}
                  label={{ value: "Tiempo (s)", position: "insideBottom", offset: -8 }}
                />
                <YAxis
                  width={80}
                  label={{ value: "Respuesta galvánica (µS)", angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" } }}
                />
                <RechartsTooltip content={<GsrTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={52}
                  wrapperStyle={{ paddingTop: "36px" }}
                />

                {typeof stats?.mean === "number" ? (
                  <ReferenceLine y={stats.mean} stroke="#9CA3AF" strokeDasharray="4 4" />
                ) : null}

                {selectedTime != null ? (
                  <ReferenceLine
                    x={selectedTime}
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
          )}
        </CardContent>
      </Card>

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
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4"
                >
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", bg)}>
                    <Icon className={cn("h-5 w-5", iconColor)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-normal uppercase tracking-widest text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-bold leading-tight text-foreground">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Estadísticas</CardTitle>
          <CardDescription>
            Resumen numérico de la respuesta galvánica suavizada: tendencia, variabilidad y extremos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <StatisticsTable
            rows={tableRows}
            summaryRow={tableRows[0]}
            loading={statsLoading || !stats}
            unit=" µS"
          />
        </CardContent>
      </Card>
    </div>
  )
}
