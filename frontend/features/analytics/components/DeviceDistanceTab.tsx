"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
import {
  Activity,
  Clock,
  Crosshair,
  Eye,
  MapPin,
  RotateCcw,
  Ruler,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { cn } from "@/lib/utils"
import { KpiCard } from "@/components/ui/KpiCard"
import { StatisticsTable } from "@/components/ui/StatisticsTable"
import type { StatRow } from "@/components/ui/StatisticsTable"
import {
  useAoiMetrics,
  useDistanceStatistics,
  useDistanceTimeseries,
  useGazeAt,
} from "../hooks/useAnalyticsData"
import {
  AoiContextPanel,
  AoiLegend,
  AoiOverlay,
  AoiToggleButton,
  findAoiAtPoint,
  getContainedImageBox,
  imagePointToContainerPercent,
  type ContainedImageBox,
} from "./AoiOverlay"

interface DeviceDistanceTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

interface LinePoint {
  time: number
  distance_cm: number
}

interface DistanceTooltipPayloadEntry {
  value: number
  name: string
  color: string
}

interface DistanceTooltipProps {
  active?: boolean
  payload?: DistanceTooltipPayloadEntry[]
  label?: number
}

function DistanceTooltip({ active, payload, label }: DistanceTooltipProps) {
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
          <span>{entry.name}: {Number(entry.value).toFixed(2)} cm</span>
        </div>
      ))}
    </div>
  )
}

/** Returns true if the scenario name looks like an instruction/non-stimulus screen. */
function isNoImageScenario(name: string | null): boolean {
  if (!name) return false
  const lower = name.toLowerCase().trim()
  return (
    lower.startsWith("instruction") ||
    lower.startsWith("instruccion") ||
    lower.startsWith("instrucción") ||
    lower.startsWith("practice") ||
    lower.startsWith("practica") ||
    lower.startsWith("intro") ||
    lower.startsWith("blank") ||
    lower.startsWith("rest") ||
    lower.startsWith("fixation")
  )
}

export function DeviceDistanceTab({
  projectId,
  participantCode,
  scenario,
}: DeviceDistanceTabProps) {
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  const [showAois, setShowAois] = useState(true)
  // Refs for letterbox-corrected gaze positioning
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  // Gaze position remapped to account for object-contain letterboxing
  const [gazeOffset, setGazeOffset] = useState<{ x: number; y: number } | null>(null)
  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)

  const { data: timeseriesData, loading: timeseriesLoading } = useDistanceTimeseries(
    projectId,
    participantCode,
    scenario
  )
  const { data: stats, loading: statsLoading } = useDistanceStatistics(
    projectId,
    participantCode,
    scenario
  )
  const {
    data: gazeData,
    loading: gazeLoading,
    fetchGaze,
    clear: clearGaze,
  } = useGazeAt(projectId, participantCode)
  const aoiScenario = scenario !== "all" ? scenario : gazeData?.scenario ?? "all"
  const { data: aoiData, loading: aoiLoading, error: aoiError } = useAoiMetrics(
    projectId,
    participantCode,
    aoiScenario
  )
  const aois = aoiData?.aois ?? []
  const gazeX = gazeData?.gx
  const gazeY = gazeData?.gy
  const currentAoi = findAoiAtPoint(aois, gazeX, gazeY)

  const chartData = useMemo<LinePoint[]>(() => {
    if (!timeseriesData) return []
    return timeseriesData.time.map((time, index) => ({
      time,
      distance_cm: timeseriesData.distance_cm[index],
    }))
  }, [timeseriesData])

  // Pin the XAxis domain to the full data range so ReferenceLine never causes zoom.
  const chartDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (chartData.length === 0) return ["dataMin", "dataMax"]
    return [chartData[0].time, chartData[chartData.length - 1].time]
  }, [chartData])

  const minTime = useMemo(() => {
    if (chartData.length === 0) return null
    let minVal = Infinity
    let minT = chartData[0].time
    for (const pt of chartData) {
      if (pt.distance_cm < minVal) {
        minVal = pt.distance_cm
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
      if (pt.distance_cm > maxVal) {
        maxVal = pt.distance_cm
        maxT = pt.time
      }
    }
    return maxT
  }, [chartData])

  const selectedValue = useMemo<number | null>(() => {
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
    return nearest.distance_cm
  }, [selectedTime, chartData])

  const tableRows = useMemo<StatRow[]>(() => {
    const distRow: StatRow = {
      serie: "Distancia",
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
    return [distRow]
  }, [stats, chartData])

  /**
   * Remaps gaze coordinates from "% of image" to "% of container".
   *
   * object-contain adds letterbox padding when the image aspect ratio doesn't
   * match the container. Without this correction, dots at extreme x or y values
   * land in the empty letterbox area rather than on the visible image content.
   */
  const computeGazeOffset = useCallback(() => {
    const box = getContainedImageBox(imageRef.current, imageContainerRef.current)
    setLetterbox(box)

    if (!box || gazeX == null || gazeY == null) {
      setGazeOffset(null)
      return
    }

    setGazeOffset(imagePointToContainerPercent(box, gazeX, gazeY))
  }, [gazeX, gazeY])

  // Recompute offset when gazeData changes (image may already be loaded)
  useEffect(() => {
    computeGazeOffset()
  }, [computeGazeOffset])

  useEffect(() => {
    const frame = requestAnimationFrame(() => computeGazeOffset())
    const container = imageContainerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame)
    }
    const observer = new ResizeObserver(() => computeGazeOffset())
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [computeGazeOffset, scenarioImageUrl])

  const handleKpiClick = (time: number | null) => {
    if (time == null) return
    const next = selectedTime === time ? null : time
    setSelectedTime(next)
    if (next !== null) fetchGaze(next)
  }

  useEffect(() => {
    if (!gazeData?.scenario_file_id) {
      return
    }

    let cancelled = false
    let currentUrl: string | null = null

    apiFetchBlob(`/api/projects/${projectId}/files/${gazeData.scenario_file_id}/image`)
      .then((blob) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setScenarioImageUrl(currentUrl)
      })
      .catch(() => {
        if (!cancelled) setScenarioImageUrl(null)
      })

    return () => {
      cancelled = true
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [gazeData?.scenario_file_id, projectId])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartClick = (state: any) => {
    if (!state) return
    // Primary: from payload (when tooltip cursor was active on hover)
    const fromPayload = state?.activePayload?.[0]?.payload?.time
    // Fallback: activeLabel is the XAxis value at the clicked position
    const fromLabel =
      state?.activeLabel != null && !Number.isNaN(Number(state.activeLabel))
        ? Number(state.activeLabel)
        : null
    const time = fromPayload ?? fromLabel
    if (typeof time !== "number" || Number.isNaN(time)) return
    setSelectedTime(time)
    fetchGaze(time)
  }

  return (
    <div className="space-y-6 py-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Distancia dispositivo</CardTitle>
            <CardDescription>
              Distancia ojo-pantalla (cm) a lo largo del tiempo.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-6 grid grid-cols-3 gap-15 mr-6 ml-20">
            {[
              {
                label: "Media",
                value: stats?.mean,
                description: "Promedio de distancia",
                tooltip: "Promedio de distancia ojo-pantalla en el intervalo visualizado",
                Icon: Activity,
                iconBgClass: "bg-indigo-100 dark:bg-indigo-900/40",
                iconColorClass: "text-indigo-500",
                labelColorClass: "text-indigo-600 dark:text-indigo-400",
                hoverBgClass: "hover:bg-indigo-50 dark:hover:bg-indigo-950/30",
                activeBgClass: "bg-indigo-50 dark:bg-indigo-950/30",
                onClick: undefined as (() => void) | undefined,
                active: false,
              },
              {
                label: "Mínimo",
                value: stats?.min,
                description: "Valor más bajo registrado",
                tooltip: "Valor mínimo registrado en la distancia ojo-pantalla",
                Icon: TrendingDown,
                iconBgClass: "bg-cyan-100 dark:bg-cyan-900/40",
                iconColorClass: "text-cyan-500",
                labelColorClass: "text-cyan-600 dark:text-cyan-400",
                hoverBgClass: "hover:bg-cyan-50/50 dark:hover:bg-cyan-950/30",
                activeBgClass: "bg-cyan-50/50 dark:bg-cyan-950/30",
                onClick: minTime != null ? () => handleKpiClick(minTime) : undefined,
                active: selectedTime === minTime,
              },
              {
                label: "Máximo",
                value: stats?.max,
                description: "Distancia más alta registrada",
                tooltip: "Valor máximo registrado en la distancia ojo-pantalla",
                Icon: TrendingUp,
                iconBgClass: "bg-rose-100 dark:bg-rose-900/40",
                iconColorClass: "text-rose-500",
                labelColorClass: "text-rose-600 dark:text-rose-400",
                hoverBgClass: "hover:bg-rose-50/50 dark:hover:bg-rose-950/30",
                activeBgClass: "bg-rose-50/50 dark:bg-rose-950/30",
                onClick: maxTime != null ? () => handleKpiClick(maxTime) : undefined,
                active: selectedTime === maxTime,
              },
            ].map((cardProps) => (
              <KpiCard key={cardProps.label} loading={statsLoading} unit="cm" {...cardProps} />
            ))}
          </div>

          {timeseriesLoading ? (
            <div className="h-[400px] w-full animate-pulse rounded-lg bg-muted" />
          ) : chartData.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
              No hay datos de distancia para los filtros seleccionados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <LineChart data={chartData} onClick={handleChartClick} margin={{ top: 8, right: 24, left: 16, bottom: 80 }}>
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
                  width={72}
                  label={{ value: "Distancia (cm)", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle" } }}
                />
                <RechartsTooltip content={<DistanceTooltip />} />
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

                <Line
                  type="monotone"
                  dataKey="distance_cm"
                  name="Distancia ojo-pantalla"
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Gaze Snapshot Section */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">Punto de fijación sobre estímulo visual</CardTitle>
              {gazeData?.scenario && (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-100 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {gazeData.scenario}
                </span>
              )}
            </div>
            <CardDescription>
              Ubicación del punto de dilatación pupilar durante la visualización del estímulo.
            </CardDescription>
          </div>
          {gazeData && (
            <div className="flex shrink-0 items-center gap-2">
              <AoiToggleButton
                enabled={showAois}
                onToggle={() => setShowAois((value) => !value)}
                disabled={aois.length === 0 || aoiLoading}
                count={aois.length}
              />
              <button
                type="button"
                onClick={() => {
                  clearGaze()
                  setSelectedTime(null)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpiar selección
              </button>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4 mt-4">
          {/* 4-metric summary row */}
          {gazeData && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "SEGUNDO",
                  value: `${gazeData.nearest_time_s.toFixed(0)}`,
                  sub: `de ${Math.round(chartData[chartData.length - 1]?.time ?? 0)} segundos`,
                  Icon: Clock,
                  bg: "bg-blue-50 dark:bg-blue-950/40",
                  iconColor: "text-blue-500",
                },
                {
                  label: "VALOR",
                  value: selectedValue != null ? `${selectedValue.toFixed(2)}` : "—",
                  sub: "cm distancia",
                  Icon: Ruler,
                  bg: "bg-teal-50 dark:bg-teal-950/40",
                  iconColor: "text-teal-500",
                },
                {
                  label: "POS X",
                  value: gazeData.gx != null ? `${gazeData.gx.toFixed(0)}%` : "—",
                  sub: "horizontal",
                  Icon: Crosshair,
                  bg: "bg-violet-50 dark:bg-violet-950/40",
                  iconColor: "text-violet-500",
                },
                {
                  label: "POS Y",
                  value: gazeData.gy != null ? `${gazeData.gy.toFixed(0)}%` : "—",
                  sub: "vertical",
                  Icon: Crosshair,
                  bg: "bg-sky-50 dark:bg-sky-950/40",
                  iconColor: "text-sky-500",
                },
              ].map(({ label, value, sub, Icon, bg, iconColor }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", bg)}>
                    <Icon className={cn("h-5 w-5", iconColor)} />
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <p className="text-xs font-normal uppercase tracking-widest text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-2 text-3xl font-bold leading-tight text-foreground">{value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conditional rendering states */}
          {!gazeData && !gazeLoading ? (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              Haz clic en el gráfico o en Mínimo / Máximo para ver la mirada del participante
            </div>
          ) : gazeLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
          ) : gazeData && (gazeData.gx == null || gazeData.gy == null) ? (
            <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
              <span>Sin coordenadas de mirada registradas para t = {gazeData.nearest_time_s.toFixed(1)}s</span>
              {gazeData.scenario && (
                <span className="text-xs text-muted-foreground/60">Escenario: {gazeData.scenario}</span>
              )}
            </div>
          ) : gazeData && !gazeData.scenario_file_id ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-6 text-center">
              <span className="text-sm font-medium text-foreground">
                {isNoImageScenario(gazeData.scenario)
                  ? "Pantalla de instrucción - no hay imagen de estímulo asociada a este escenario"
                  : `El escenario "${gazeData.scenario ?? "desconocido"}" no tiene imagen de estímulo registrada`}
              </span>
              <span className="text-xs text-muted-foreground">
                t = {gazeData.nearest_time_s.toFixed(2)}s - Posición de mirada: ({gazeData.gx?.toFixed(1)}, {gazeData.gy?.toFixed(1)})
              </span>
            </div>
          ) : gazeData ? (
            <div className="overflow-hidden rounded-xl bg-card">
              {scenarioImageUrl ? (
                <div className="relative" ref={imageContainerRef}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imageRef}
                    src={scenarioImageUrl}
                    alt="Escenario"
                    className="max-h-[500px] w-full object-contain"
                    onLoad={computeGazeOffset}
                  />
                  {showAois && (
                    <AoiOverlay aois={aois} box={letterbox} />
                  )}
                  {gazeOffset && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-crosshair"
                            style={{ left: `${gazeOffset.x}%`, top: `${gazeOffset.y}%` }}
                          >
                            <div className="h-8 w-8 rounded-full border-4 border-cyan-400 bg-cyan-400/20 shadow-lg" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-950">
                            <Crosshair className="h-4 w-4 text-cyan-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold leading-none">Punto de atención</p>
                            <p className="mt-1 text-xs leading-none text-muted-foreground">
                              ({gazeData.gx?.toFixed(0)}, {gazeData.gy?.toFixed(0)})
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                  No se pudo cargar la imagen del escenario.
                </div>
              )}
            </div>
          ) : null}

          {gazeData && showAois ? <AoiLegend aois={aois} /> : null}

          {/* Bottom callout - only when gaze data is loaded */}
          {gazeData && (
            <div className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50/60 px-4 py-3.5 dark:border-cyan-800/40 dark:bg-cyan-950/30">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-600 dark:bg-cyan-600">
                <Eye className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-base font-medium text-cyan-700 dark:text-cyan-400">Punto de atención</p>
                <p className="text-sm text-cyan-600 dark:text-cyan-500">
                  {selectedValue != null
                    ? `El indicador aguamarina marca la ubicación exacta donde se registró la distancia ojo-pantalla (${selectedValue.toFixed(1)} cm) en el segundo ${Math.round(gazeData.nearest_time_s)} de la visualización.`
                    : "El indicador aguamarina marca la ubicación exacta donde se registró la fijación en el instante seleccionado sobre el estímulo visual."}
                  {currentAoi ? ` Cae dentro del AOI "${currentAoi.name}".` : aois.length > 0 ? " No cae dentro de un AOI delimitado." : ""}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Estadísticas</CardTitle>
          <CardDescription>
            Resumen numérico de la señal de distancia ojo-pantalla: tendencia, variabilidad y extremos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <StatisticsTable
            rows={tableRows}
            summaryRow={tableRows[0]}
            loading={statsLoading || !stats}
            unit=" cm"
          />
        </CardContent>
      </Card>

      {participantCode && scenario !== "all" ? (
        <AoiContextPanel
          data={aoiData}
          loading={aoiLoading}
          error={aoiError}
          title="AOIs en distancia dispositivo"
          description="Relaciona la distancia ojo-pantalla con las areas que recibieron atencion visual."
        />
      ) : null}
    </div>
  )
}
