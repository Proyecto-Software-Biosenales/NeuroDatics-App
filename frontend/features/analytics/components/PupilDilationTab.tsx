"use client"

import { useEffect, useMemo, useState } from "react"
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
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { cn } from "@/lib/utils"
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

export function PupilDilationTab({
  projectId,
  participantCode,
  scenario,
}: PupilDilationTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("both")
  const [clickedTime, setClickedTime] = useState<number | null>(null)
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

          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
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
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {timeseriesLoading ? (
            <div className="h-[400px] w-full animate-pulse rounded-lg bg-gray-200" />
          ) : chartData.length === 0 ? (
            <div className="flex h-[400px] items-center justify-center text-sm text-gray-500">
              No hay datos de dilatación pupilar para los filtros seleccionados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={chartData} onClick={handleChartClick} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value) => String(Math.round(Number(value)))}
                  label={{ value: "Tiempo (s)", position: "insideBottom", offset: -16 }}
                />
                <YAxis label={{ value: "Amplitud pupilar (mm)", angle: -90, position: "insideLeft" }} />
                <Tooltip content={<PupilTooltip />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: "12px" }} />

                {typeof stats?.mean === "number" ? (
                  <ReferenceLine y={stats.mean} stroke="#9CA3AF" strokeDasharray="4 4" />
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

      <section className="grid grid-cols-3 gap-6">
        {[
          { label: "Media", value: stats?.mean },
          { label: "Mínimo", value: stats?.min },
          { label: "Máximo", value: stats?.max },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-6 text-center">
              {statsLoading || kpi.value == null ? (
                <div className="mx-auto h-8 w-20 animate-pulse rounded bg-gray-200" />
              ) : (
                <p className="text-2xl font-semibold text-gray-900">{kpi.value.toFixed(2)} mm</p>
              )}
              <p className="mt-1 text-sm text-gray-500">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </section>

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

      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Estadísticas</h3>
          <p className="text-sm text-gray-500">
            Resumen numérico de la señal: tendencia, variabilidad y extremos.
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
              { label: "Media", value: stats.mean },
              { label: "Mínimo", value: stats.min },
              { label: "Máximo", value: stats.max },
              { label: "Desv. Estándar", value: stats.std },
              { label: "Mediana", value: stats.median },
              { label: "Línea Base", value: stats.baseline },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {item.value.toFixed(4)}{" "}
                  <span className="text-sm font-normal text-gray-400">mm</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
