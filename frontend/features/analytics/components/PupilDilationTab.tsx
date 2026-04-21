"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
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
import { AnalyticsApi } from "../api/analyticsApi"
import {
  useGazeAt,
  usePupilStatistics,
  usePupilTimeseries,
} from "../hooks/useAnalyticsData"
import { PupilStatsSection } from "./PupilStatsSection"

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

export function PupilDilationTab({
  projectId,
  participantCode,
  scenario,
}: PupilDilationTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("both")
  const [clickedTime, setClickedTime] = useState<number | null>(null)
  const [pinnedTime, setPinnedTime] = useState<number | null>(null)
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)

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
      const v = Math.min(pt.smooth_left, pt.smooth_right)
      if (v < minVal) { minVal = v; minT = pt.time }
    }
    return minT
  }, [chartData])

  const maxTime = useMemo(() => {
    if (chartData.length === 0) return null
    let maxVal = -Infinity
    let maxT = chartData[0].time
    for (const pt of chartData) {
      const v = Math.max(pt.smooth_left, pt.smooth_right)
      if (v > maxVal) { maxVal = v; maxT = pt.time }
    }
    return maxT
  }, [chartData])

  const [maxGaze, setMaxGaze] = useState<{ gx: number | null; gy: number | null } | null>(null)
  const [minGaze, setMinGaze] = useState<{ gx: number | null; gy: number | null } | null>(null)

  useEffect(() => {
    if (!projectId || !participantCode || maxTime == null) return
    let cancelled = false
    AnalyticsApi.getGazeAt(projectId, participantCode, maxTime)
      .then((data) => { if (!cancelled && data) setMaxGaze({ gx: data.gx, gy: data.gy }) })
      .catch(() => { if (!cancelled) setMaxGaze(null) })
    return () => { cancelled = true }
  }, [projectId, participantCode, maxTime])

  useEffect(() => {
    if (!projectId || !participantCode || minTime == null) return
    let cancelled = false
    AnalyticsApi.getGazeAt(projectId, participantCode, minTime)
      .then((data) => { if (!cancelled && data) setMinGaze({ gx: data.gx, gy: data.gy }) })
      .catch(() => { if (!cancelled) setMinGaze(null) })
    return () => { cancelled = true }
  }, [projectId, participantCode, minTime])

  const handleKpiClick = (time: number | null) => {
    if (time == null) return
    setPinnedTime((prev) => (prev === time ? null : time))
    setClickedTime(time)
    fetchGaze(time)
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
    const time = state?.activePayload?.[0]?.payload?.time
    if (typeof time !== "number") return
    setClickedTime(time)
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

        <CardContent className="grid grid-cols-1 gap-7 mt-2">
          <div className="mb-6 grid grid-cols-3 gap-15 px-7 ml-13">
            <KpiCard
              label="Media"
              value={stats?.mean}
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
              loading={statsLoading}
              bgClass="bg-violet-50/50 dark:bg-violet-950/30"
              iconBgClass="bg-violet-100 dark:bg-violet-900/40"
              accentClass="text-violet-500"
              borderCardClass="border border-violet-50 dark:border-violet-800/30"
              titleColorClass="text-violet-800 dark:text-violet-400"
              onClick={minTime != null ? () => handleKpiClick(minTime) : undefined}
              active={pinnedTime != null && pinnedTime === minTime}
            />
            <KpiCard
              label="Máximo"
              value={stats?.max}
              loading={statsLoading}
              bgClass="bg-blue-50/50 dark:bg-blue-950/30"
              iconBgClass="bg-blue-100 dark:bg-blue-900/40"
              accentClass="text-blue-400"
              borderCardClass="border border-blue-50 dark:border-blue-800/30"
              titleColorClass="text-blue-600 dark:text-blue-400"
              onClick={maxTime != null ? () => handleKpiClick(maxTime) : undefined}
              active={pinnedTime != null && pinnedTime === maxTime}
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

                {pinnedTime != null ? (
                  <ReferenceLine
                    x={pinnedTime}
                    stroke="#374151"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{ value: `${Math.round(pinnedTime)}s`, position: "top", fontSize: 11, fill: "#374151" }}
                  />
                ) : null}

                {pinnedTime != null && stats?.min != null && (viewMode === "both" || viewMode === "right") ? (
                  <ReferenceDot x={pinnedTime} y={stats.min} r={5} fill="#6366F1" stroke="white" strokeWidth={2} ifOverflow="visible" />
                ) : null}

                {pinnedTime != null && stats?.max != null && (viewMode === "both" || viewMode === "right") ? (
                  <ReferenceDot x={pinnedTime} y={stats.max} r={5} fill="#F43F5E" stroke="white" strokeWidth={2} ifOverflow="visible" />
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

      {gazeData ? (
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Mirada en t = {gazeData.nearest_time_s}s
            </h3>

            {gazeData.gx == null || gazeData.gy == null ? (
              <p className="text-sm text-gray-500">Sin datos de mirada válidos para este instante.</p>
            ) : (
              <>
                {scenarioImageUrl ? (
                  <div className="relative overflow-hidden rounded-lg border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={scenarioImageUrl}
                      alt="Escenario"
                      className="max-h-[420px] w-full object-contain"
                    />
                    <div
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500"
                      style={{ left: `${gazeData.gx}%`, top: `${gazeData.gy}%` }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No se pudo cargar la imagen del escenario para este punto de mirada.
                  </p>
                )}

                <div className="mt-4 space-y-1 text-sm text-gray-600">
                  <p>Tiempo más cercano: {gazeData.nearest_time_s}s</p>
                  <p>Escenario: {gazeData.scenario ?? "N/A"}</p>
                  <p>Coordenadas: ({gazeData.gx}, {gazeData.gy})</p>
                </div>
              </>
            )}

            {gazeLoading && clickedTime != null ? (
              <p className="mt-3 text-xs text-gray-500">Buscando mirada para t = {clickedTime}s...</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <PupilStatsSection
        stats={stats}
        loading={statsLoading}
        maxTime={maxTime}
        minTime={minTime}
        maxGaze={maxGaze}
        minGaze={minGaze}
      />
    </div>
  )
}
