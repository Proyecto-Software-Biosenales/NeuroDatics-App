"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
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
import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { cn } from "@/lib/utils"
import { KpiCard } from "@/components/ui/KpiCard"
import {
  useGazeAt,
  usePupilStatistics,
  usePupilTimeseries,
} from "../hooks/useAnalyticsData"

type ViewMode = "both" | "left" | "right"

interface PupilDilationTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

interface LinePoint {
  time: number
  smooth_left: number
  smooth_right: number
  average: number
}

interface PupilTooltipPayloadEntry {
  value: number
  name: string
  color: string
}

interface PupilTooltipProps {
  active?: boolean
  payload?: PupilTooltipPayloadEntry[]
  label?: number
}

function PupilTooltip({ active, payload, label }: PupilTooltipProps) {
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
          <span>{entry.name}: {Number(entry.value).toFixed(2)} mm</span>
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

export function PupilDilationTab({
  projectId,
  participantCode,
  scenario,
}: PupilDilationTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("both")
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  // Refs for letterbox-corrected gaze positioning
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  // Gaze position remapped to account for object-contain letterboxing
  const [gazeOffset, setGazeOffset] = useState<{ x: number; y: number } | null>(null)

  const { data: timeseriesData, loading: timeseriesLoading } = usePupilTimeseries(
    projectId,
    participantCode,
    scenario
  )
  const { data: stats, loading: statsLoading } = usePupilStatistics(
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

  const chartData = useMemo<LinePoint[]>(() => {
    if (!timeseriesData) return []
    return timeseriesData.time.map((time, index) => ({
      time,
      smooth_left: timeseriesData.smooth_left[index],
      smooth_right: timeseriesData.smooth_right[index],
      average: timeseriesData.average[index],
    }))
  }, [timeseriesData])

  const minTime = useMemo(() => {
    if (chartData.length === 0) return null
    let minVal = Infinity
    let minT = chartData[0].time
    for (const pt of chartData) {
      const v = (pt.smooth_left + pt.smooth_right) / 2
      if (v < minVal) { minVal = v; minT = pt.time }
    }
    return minT
  }, [chartData])

  const maxTime = useMemo(() => {
    if (chartData.length === 0) return null
    let maxVal = -Infinity
    let maxT = chartData[0].time
    for (const pt of chartData) {
      const v = (pt.smooth_left + pt.smooth_right) / 2
      if (v > maxVal) { maxVal = v; maxT = pt.time }
    }
    return maxT
  }, [chartData])

  /**
   * Remaps gaze coordinates from "% of image" to "% of container".
   *
   * object-contain adds letterbox padding when the image aspect ratio doesn't
   * match the container. Without this correction, dots at extreme x or y values
   * land in the empty letterbox area rather than on the visible image content.
   */
  const computeGazeOffset = useCallback(() => {
    const img = imageRef.current
    const container = imageContainerRef.current
    if (!img || !container || gazeData?.gx == null || gazeData?.gy == null) {
      setGazeOffset(null)
      return
    }

    const cW = container.clientWidth
    const cH = container.clientHeight
    const iW = img.naturalWidth
    const iH = img.naturalHeight

    if (!cW || !cH || !iW || !iH) {
      setGazeOffset(null)
      return
    }

    // Scale factor for object-contain: uniform scale that fits image inside container
    const scale = Math.min(cW / iW, cH / iH)
    const renderedW = iW * scale
    const renderedH = iH * scale
    // Letterbox offsets (may be 0 on one axis)
    const offsetX = (cW - renderedW) / 2
    const offsetY = (cH - renderedH) / 2

    // Map from image-% to container-% through the letterbox transform
    setGazeOffset({
      x: ((offsetX + (gazeData.gx / 100) * renderedW) / cW) * 100,
      y: ((offsetY + (gazeData.gy / 100) * renderedH) / cH) * 100,
    })
  }, [gazeData?.gx, gazeData?.gy])

  // Recompute offset when gazeData changes (image may already be loaded)
  useEffect(() => {
    computeGazeOffset()
  }, [computeGazeOffset])

  const handleKpiClick = (time: number | null) => {
    if (time == null) return
    const next = selectedTime === time ? null : time
    setSelectedTime(next)
    if (next !== null) fetchGaze(next)
  }

  useEffect(() => {
    setGazeOffset(null)
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
            <CardTitle className="text-xl">Dilatación pupilar</CardTitle>
            <CardDescription>
              Diámetro pupilar a lo largo del tiempo (mm), promedio de ambos ojos.
            </CardDescription>
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            {[
              { key: "both", label: "Ambas pupilas" },
              { key: "left", label: "Izquierda" },
              { key: "right", label: "Derecha" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setViewMode(option.key as ViewMode)}
                className={cn(
                  "px-3 py-1.5 text-sm",
                  viewMode === option.key
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
          <div className="mb-6 grid grid-cols-3 gap-10 px-7 ml-13">
            <KpiCard
              label="Media"
              value={stats?.mean}
              tooltip={stats?.raw_mean != null ? `Valor real: ${stats.raw_mean.toFixed(4)} mm` : undefined}
              description="Promedio ambas pupilas"
              Icon={Minus}
              loading={statsLoading}
              bgClass="bg-indigo-50/50 dark:bg-indigo-950/30"
              iconBgClass="bg-indigo-100 dark:bg-indigo-900/40"
              accentClass="text-indigo-400"
              borderCardClass="border border-indigo-50 dark:border-indigo-800/30"
              titleColorClass="text-indigo-600 dark:text-indigo-400"
            />
            <KpiCard
              label="Mínimo"
              value={stats?.min}
              tooltip={stats?.raw_min != null ? `Valor real: ${stats.raw_min.toFixed(4)} mm` : undefined}
              description="Valor más bajo registrado"
              Icon={TrendingDown}
              loading={statsLoading}
              bgClass="bg-violet-50/50 dark:bg-violet-950/30"
              iconBgClass="bg-violet-100 dark:bg-violet-900/40"
              accentClass="text-violet-500"
              borderCardClass="border border-violet-50 dark:border-violet-800/30"
              titleColorClass="text-violet-800 dark:text-violet-400"
              onClick={minTime != null ? () => handleKpiClick(minTime) : undefined}
              active={selectedTime === minTime}
            />
            <KpiCard
              label="Máximo"
              value={stats?.max}
              tooltip={stats?.raw_max != null ? `Valor real: ${stats.raw_max.toFixed(4)} mm` : undefined}
              description="Pico de dilatación"
              Icon={TrendingUp}
              loading={statsLoading}
              bgClass="bg-blue-50/50 dark:bg-blue-950/30"
              iconBgClass="bg-blue-100 dark:bg-blue-900/40"
              accentClass="text-blue-400"
              borderCardClass="border border-blue-50 dark:border-blue-800/30"
              titleColorClass="text-blue-600 dark:text-blue-400"
              onClick={maxTime != null ? () => handleKpiClick(maxTime) : undefined}
              active={selectedTime === maxTime}
            />
          </div>

          {timeseriesLoading ? (
            <div className="h-[400px] w-full animate-pulse rounded-lg bg-muted" />
          ) : chartData.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
              No hay datos de dilatación pupilar para los filtros seleccionados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={460}>
              <LineChart data={chartData} onClick={handleChartClick} margin={{ top: 8, right: 24, left: 16, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value) => String(Math.round(Number(value)))}
                  tickMargin={8}
                  label={{ value: "Tiempo (s)", position: "insideBottom", offset: -8 }}
                />
                <YAxis
                  width={72}
                  label={{ value: "Amplitud pupilar (mm)", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle" } }}
                />
                <Tooltip content={<PupilTooltip />} />
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

                {(viewMode === "both" || viewMode === "left") ? (
                  <Line
                    type="monotone"
                    dataKey="smooth_left"
                    name="Pupila izquierda"
                    stroke="#818CF8"
                    strokeWidth={1.5}
                    dot={false}
                  />
                ) : null}

                {(viewMode === "both" || viewMode === "right") ? (
                  <Line
                    type="monotone"
                    dataKey="smooth_right"
                    name="Pupila derecha"
                    stroke="#F87171"
                    strokeWidth={1.5}
                    dot={false}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Gaze Snapshot Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Instantánea de mirada</h3>
            <p className="text-sm text-gray-500">
              Punto de fijación del participante en el escenario en el instante seleccionado.
            </p>
          </div>
          {gazeData && (
            <button
              type="button"
              onClick={() => { clearGaze(); setSelectedTime(null) }}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Limpiar selección
            </button>
          )}
        </div>

        {!gazeData && !gazeLoading ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
            Haz clic en el gráfico o en Mínimo / Máximo para ver la mirada del participante
          </div>
        ) : gazeLoading ? (
          <div className="h-48 animate-pulse rounded-xl bg-gray-200" />
        ) : gazeData && (gazeData.gx == null || gazeData.gy == null) ? (
          <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
            <span>Sin coordenadas de mirada registradas para t = {gazeData.nearest_time_s.toFixed(1)}s</span>
            {gazeData.scenario && (
              <span className="text-xs text-gray-400">Escenario: {gazeData.scenario}</span>
            )}
          </div>
        ) : gazeData && !gazeData.scenario_file_id ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-6 text-center">
            <span className="text-sm font-medium text-gray-600">
              {isNoImageScenario(gazeData.scenario)
                ? "Pantalla de instrucción — no hay imagen de estímulo asociada a este escenario"
                : `El escenario "${gazeData.scenario ?? "desconocido"}" no tiene imagen de estímulo registrada`}
            </span>
            <span className="text-xs text-gray-400">
              t = {gazeData.nearest_time_s.toFixed(2)}s · Posición de mirada: ({gazeData.gx?.toFixed(1)}, {gazeData.gy?.toFixed(1)})
            </span>
          </div>
        ) : gazeData ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
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
                {gazeOffset && (
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${gazeOffset.x}%`, top: `${gazeOffset.y}%` }}
                  >
                    <div className="h-8 w-8 rounded-full border-4 border-cyan-400 bg-cyan-400/20 shadow-lg" />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                No se pudo cargar la imagen del escenario.
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
              <div>
                <span className="font-medium text-gray-700">Tiempo</span>
                <p>{gazeData.nearest_time_s.toFixed(2)}s</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Escenario</span>
                <p className="truncate">{gazeData.scenario ?? "N/A"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Coordenadas</span>
                <p>({gazeData.gx?.toFixed(1)}, {gazeData.gy?.toFixed(1)})</p>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Statistics Section */}
      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Estadísticas</h3>
          <p className="text-sm text-gray-500">
            Resumen numérico de la señal suavizada: tendencia, variabilidad y extremos.
          </p>
        </div>

        {statsLoading || !stats ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-200" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Media", value: stats.mean, rawValue: stats.raw_mean },
              { label: "Mínimo", value: stats.min, rawValue: stats.raw_min },
              { label: "Máximo", value: stats.max, rawValue: stats.raw_max },
              { label: "Desv. Estándar", value: stats.std, rawValue: stats.raw_std },
              { label: "Mediana", value: stats.median, rawValue: stats.raw_median },
              { label: "Línea Base", value: stats.baseline, rawValue: stats.raw_baseline },
            ].map((item) => (
              <div
                key={item.label}
                className="group relative rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {item.value.toFixed(4)}{" "}
                  <span className="text-sm font-normal text-gray-400">mm</span>
                </p>
                {item.rawValue != null && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                    Valor real: {item.rawValue.toFixed(4)} mm
                    <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
