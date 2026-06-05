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
  useGazeAt,
  usePupilTimeseries,
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

type ViewMode = "both" | "left" | "right"

interface PupilDilationTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

interface LinePoint {
  time: number
  left: number
  right: number
  smooth_left: number
  smooth_right: number
}

interface PupilSample {
  time: number
  value: number
  rawValue: number
}

interface ActivePupilStats {
  count: number
  mean: number
  min: number
  max: number
  std: number
  median: number
  baseline: number
  raw_mean: number | null
  raw_min: number | null
  raw_max: number | null
  raw_std: number | null
  raw_median: number | null
  raw_baseline: number | null
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

function isValidPupilValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) return 0
  const position = (percentileValue / 100) * (sortedValues.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedValues[lower]
  const weight = position - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

function robustBaseline(values: number[]): number {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  if (finiteValues.length === 0) return 0
  const sorted = [...finiteValues].sort((a, b) => a - b)
  const low = percentile(sorted, 5)
  const high = percentile(sorted, 20)
  const baselineValues = finiteValues.filter((value) => value >= low && value <= high)
  const source = baselineValues.length > 0 ? baselineValues : finiteValues
  return source.reduce((sum, value) => sum + value, 0) / source.length
}

function computeStats(samples: PupilSample[]): ActivePupilStats | null {
  const values = samples.map((sample) => sample.value).filter((value) => Number.isFinite(value))
  if (values.length === 0) return null

  const rawValues = samples.map((sample) => sample.rawValue).filter((value) => Number.isFinite(value))
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const varianceDivisor = values.length > 1 ? values.length - 1 : values.length
  const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / varianceDivisor)
  const median = values.length % 2 === 0
    ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
    : sorted[Math.floor(values.length / 2)]

  const rawSorted = [...rawValues].sort((a, b) => a - b)
  const rawMean = rawValues.length > 0
    ? rawValues.reduce((sum, value) => sum + value, 0) / rawValues.length
    : null
  const rawVarianceDivisor = rawValues.length > 1 ? rawValues.length - 1 : rawValues.length
  const rawStd = rawValues.length > 0
    ? Math.sqrt(rawValues.reduce((sum, value) => sum + (value - (rawMean ?? 0)) ** 2, 0) / rawVarianceDivisor)
    : null
  const rawMedian = rawValues.length > 0
    ? rawValues.length % 2 === 0
      ? (rawSorted[rawValues.length / 2 - 1] + rawSorted[rawValues.length / 2]) / 2
      : rawSorted[Math.floor(rawValues.length / 2)]
    : null

  return {
    count: values.length,
    mean: roundMetric(mean),
    min: roundMetric(sorted[0]),
    max: roundMetric(sorted[sorted.length - 1]),
    std: roundMetric(std),
    median: roundMetric(median),
    baseline: roundMetric(robustBaseline(values)),
    raw_mean: rawMean != null ? roundMetric(rawMean) : null,
    raw_min: rawValues.length > 0 ? roundMetric(rawSorted[0]) : null,
    raw_max: rawValues.length > 0 ? roundMetric(rawSorted[rawSorted.length - 1]) : null,
    raw_std: rawStd != null ? roundMetric(rawStd) : null,
    raw_median: rawMedian != null ? roundMetric(rawMedian) : null,
    raw_baseline: rawValues.length > 0 ? roundMetric(robustBaseline(rawValues)) : null,
  }
}

function getSamplesForMode(chartData: LinePoint[], mode: ViewMode): PupilSample[] {
  return chartData.flatMap((point) => {
    const leftValid = isValidPupilValue(point.left) && isValidPupilValue(point.smooth_left)
    const rightValid = isValidPupilValue(point.right) && isValidPupilValue(point.smooth_right)

    if (mode === "left") {
      return leftValid ? [{ time: point.time, value: point.smooth_left, rawValue: point.left }] : []
    }

    if (mode === "right") {
      return rightValid ? [{ time: point.time, value: point.smooth_right, rawValue: point.right }] : []
    }

    if (leftValid && rightValid) {
      return [{
        time: point.time,
        value: (point.smooth_left + point.smooth_right) / 2,
        rawValue: (point.left + point.right) / 2,
      }]
    }

    if (leftValid) {
      return [{ time: point.time, value: point.smooth_left, rawValue: point.left }]
    }

    if (rightValid) {
      return [{ time: point.time, value: point.smooth_right, rawValue: point.right }]
    }

    return []
  })
}

function getExtremeSample(samples: PupilSample[], kind: "min" | "max"): PupilSample | null {
  if (samples.length === 0) return null
  return samples.reduce((best, sample) => {
    if (kind === "min") return sample.value < best.value ? sample : best
    return sample.value > best.value ? sample : best
  }, samples[0])
}

export function PupilDilationTab({
  projectId,
  participantCode,
  scenario,
}: PupilDilationTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("both")
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  const [scenarioPreviewLoading, setScenarioPreviewLoading] = useState(false)
  const [scenarioPreviewError, setScenarioPreviewError] = useState<string | null>(null)
  const [showAois, setShowAois] = useState(true)
  // Refs for letterbox-corrected gaze positioning
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  // Gaze position remapped to account for object-contain letterboxing
  const [gazeOffset, setGazeOffset] = useState<{ x: number; y: number } | null>(null)
  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)

  const { data: timeseriesData, loading: timeseriesLoading } = usePupilTimeseries(
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
  const isVideoScenario = String(gazeData?.scenario_type || "").toLowerCase() === "video"
  const aoiScenario = isVideoScenario
    ? "all"
    : scenario !== "all" ? scenario : gazeData?.scenario ?? "all"
  const { data: aoiData, loading: aoiLoading, error: aoiError } = useAoiMetrics(
    projectId,
    participantCode,
    aoiScenario
  )
  const aois = aoiData?.aois ?? []
  const canUseAois = !isVideoScenario
  const canShowAois = canUseAois && showAois
  const gazeX = gazeData?.gx
  const gazeY = gazeData?.gy
  const currentAoi = canUseAois ? findAoiAtPoint(aois, gazeX, gazeY) : null
  let aoiStatusText = ""
  if (canUseAois) {
    if (currentAoi) {
      aoiStatusText = ` Cae dentro del AOI "${currentAoi.name}".`
    } else if (aois.length > 0) {
      aoiStatusText = " No cae dentro de un AOI delimitado."
    }
  }

  const chartData = useMemo<LinePoint[]>(() => {
    if (!timeseriesData) return []
    return timeseriesData.time.map((time, index) => ({
      time,
      left: timeseriesData.left[index] ?? 0,
      right: timeseriesData.right[index] ?? 0,
      smooth_left: timeseriesData.smooth_left[index] ?? 0,
      smooth_right: timeseriesData.smooth_right[index] ?? 0,
    }))
  }, [timeseriesData])

  const pupilModeData = useMemo(() => {
    const both = getSamplesForMode(chartData, "both")
    const left = getSamplesForMode(chartData, "left")
    const right = getSamplesForMode(chartData, "right")
    return {
      both: { samples: both, stats: computeStats(both) },
      left: { samples: left, stats: computeStats(left) },
      right: { samples: right, stats: computeStats(right) },
    }
  }, [chartData])

  const activeModeData = pupilModeData[viewMode]
  const activeStats = activeModeData.stats
  const activeModeLabel = viewMode === "both"
    ? "ambas pupilas"
    : viewMode === "left"
      ? "pupila izquierda"
      : "pupila derecha"
  const activeSerie = viewMode === "both"
    ? "Promedio"
    : viewMode === "left"
      ? "Izquierda"
      : "Derecha"

  // Pin the XAxis domain to the full data range so ReferenceLine never causes zoom.
  const chartDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (chartData.length === 0) return ["dataMin", "dataMax"]
    return [chartData[0].time, chartData[chartData.length - 1].time]
  }, [chartData])

  const minTime = useMemo(() => {
    return getExtremeSample(activeModeData.samples, "min")?.time ?? null
  }, [activeModeData.samples])

  const maxTime = useMemo(() => {
    return getExtremeSample(activeModeData.samples, "max")?.time ?? null
  }, [activeModeData.samples])

  const selectedValue = useMemo<number | null>(() => {
    if (selectedTime == null || activeModeData.samples.length === 0) return null
    let nearest = activeModeData.samples[0]
    let minDiff = Math.abs(activeModeData.samples[0].time - selectedTime)
    for (const sample of activeModeData.samples) {
      const diff = Math.abs(sample.time - selectedTime)
      if (diff < minDiff) { minDiff = diff; nearest = sample }
    }
    return nearest.value
  }, [selectedTime, activeModeData.samples])

  const tableRows = useMemo<StatRow[]>(() => {
    const toPeak = (rowStats: ActivePupilStats | null) =>
      rowStats?.max != null && rowStats?.baseline != null && rowStats.baseline !== 0
        ? ((rowStats.max - rowStats.baseline) / Math.abs(rowStats.baseline)) * 100
        : null
    const toRow = (serie: string, rowStats: ActivePupilStats | null): StatRow => ({
      serie,
      count: rowStats?.count ?? null,
      baseline: rowStats?.baseline ?? null,
      mean: rowStats?.mean ?? null,
      std: rowStats?.std ?? null,
      median: rowStats?.median ?? null,
      min: rowStats?.min ?? null,
      max: rowStats?.max ?? null,
      peak: toPeak(rowStats),
    })

    const promedioRow = toRow("Promedio", pupilModeData.both.stats)
    const leftRow = toRow("Izquierda", pupilModeData.left.stats)
    const rightRow = toRow("Derecha", pupilModeData.right.stats)
    return [promedioRow, leftRow, rightRow]
  }, [pupilModeData])

  const summaryRow = useMemo(
    () => tableRows.find((row) => row.serie === activeSerie) ?? tableRows[0],
    [activeSerie, tableRows]
  )

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
      setScenarioImageUrl(null)
      setScenarioPreviewLoading(false)
      setScenarioPreviewError(null)
      return
    }

    let cancelled = false
    let currentUrl: string | null = null

    setScenarioImageUrl(null)
    setScenarioPreviewLoading(true)
    setScenarioPreviewError(null)

    const params = new URLSearchParams({
      time_s: String(gazeData.nearest_time_s),
    })
    if (participantCode) params.set("participant_code", participantCode)
    if (gazeData.scenario) params.set("scenario", gazeData.scenario)

    apiFetchBlob(`/api/projects/${projectId}/files/${gazeData.scenario_file_id}/preview?${params}`)
      .then((blob) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setScenarioImageUrl(currentUrl)
      })
      .catch((error) => {
        if (!cancelled) {
          setScenarioImageUrl(null)
          setScenarioPreviewError(error?.message || "No se pudo cargar el estímulo visual")
        }
      })
      .finally(() => {
        if (!cancelled) setScenarioPreviewLoading(false)
      })

    return () => {
      cancelled = true
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [
    gazeData?.nearest_time_s,
    gazeData?.scenario,
    gazeData?.scenario_file_id,
    participantCode,
    projectId,
  ])

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
              Diámetro pupilar a lo largo del tiempo (mm), {activeModeLabel}.
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
          <div className="mb-6 grid grid-cols-3 gap-15 mr-6 ml-20">
            {[
              {
                label: "Media",
                value: activeStats?.mean,
                description: `Promedio ${activeModeLabel}`,
                tooltip: "Promedio del diámetro pupilar en el intervalo visualizado",
                tooltipExtra: activeStats?.raw_mean != null ? `Valor real: ${activeStats.raw_mean.toFixed(4)} mm` : undefined,
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
                value: activeStats?.min,
                description: "Valor más bajo registrado",
                tooltip: "Valor mínimo registrado en la señal suavizada",
                tooltipExtra: activeStats?.raw_min != null ? `Valor real: ${activeStats.raw_min.toFixed(4)} mm` : undefined,
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
                value: activeStats?.max,
                description: "Pico de dilatación",
                tooltip: "Valor máximo o pico de dilatación registrado",
                tooltipExtra: activeStats?.raw_max != null ? `Valor real: ${activeStats.raw_max.toFixed(4)} mm` : undefined,
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
              <KpiCard key={cardProps.label} loading={timeseriesLoading} {...cardProps} />
            ))}
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
                  domain={chartDomain}
                  tickFormatter={(value) => String(Math.round(Number(value)))}
                  tickMargin={8}
                  label={{ value: "Tiempo (s)", position: "insideBottom", offset: -8 }}
                />
                <YAxis
                  width={72}
                  label={{ value: "Amplitud pupilar (mm)", angle: -90, position: "insideLeft", offset: 10, style: { textAnchor: "middle" } }}
                />
                <RechartsTooltip content={<PupilTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={52}
                  wrapperStyle={{ paddingTop: "36px" }}
                />

                {typeof activeStats?.mean === "number" ? (
                  <ReferenceLine y={activeStats.mean} stroke="#9CA3AF" strokeDasharray="4 4" />
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
              {canUseAois ? (
                <AoiToggleButton
                  enabled={showAois}
                  onToggle={() => setShowAois((value) => !value)}
                  disabled={aois.length === 0 || aoiLoading}
                  count={aois.length}
                />
              ) : null}
              <button
                type="button"
                onClick={() => { clearGaze(); setSelectedTime(null) }}
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
                  sub: "mm dilatación",
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
                  ? "Pantalla de instrucción — no hay estímulo visual asociado a este escenario"
                  : `El escenario "${gazeData.scenario ?? "desconocido"}" no tiene estímulo visual registrado`}
              </span>
              <span className="text-xs text-muted-foreground">
                t = {gazeData.nearest_time_s.toFixed(2)}s · Posición de mirada: ({gazeData.gx?.toFixed(1)}, {gazeData.gy?.toFixed(1)})
              </span>
            </div>
          ) : gazeData ? (
            <div className="overflow-hidden rounded-xl bg-card">
              {scenarioPreviewLoading ? (
                <div className="h-48 animate-pulse rounded-xl bg-muted" />
              ) : scenarioImageUrl ? (
                <div className="relative" ref={imageContainerRef}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imageRef}
                    src={scenarioImageUrl}
                    alt="Escenario"
                    className="max-h-[500px] w-full object-contain"
                    onLoad={computeGazeOffset}
                  />
                  {canShowAois && (
                    <AoiOverlay aois={aois} box={letterbox} />
                  )}
                  {gazeOffset && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-crosshair"
                            style={{ left: `${gazeOffset.x}%`, top: `${gazeOffset.y}%` }}
                          >
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(15,23,42,0.3)]">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-950">
                                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="flex items-center gap-3 px-3 py-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900">
                            <Crosshair className="h-4 w-4 text-slate-800 dark:text-slate-100" />
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
                  {isVideoScenario
                    ? "No se pudo cargar el frame del video."
                    : scenarioPreviewError || "No se pudo cargar la imagen del escenario."}
                </div>
              )}
            </div>
          ) : null}

          {gazeData && canShowAois ? <AoiLegend aois={aois} /> : null}

          {/* Bottom callout — only when gaze data is loaded */}
          {gazeData && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 dark:bg-slate-100">
                <Eye className="h-5 w-5 text-white dark:text-slate-950" />
              </div>
              <div>
                <p className="text-base font-medium text-slate-900 dark:text-slate-100">Punto de atención</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {selectedValue != null
                    ? `El indicador de alto contraste marca la ubicación exacta donde se registró la dilatación pupilar (${selectedValue.toFixed(2)} mm) en el segundo ${Math.round(gazeData.nearest_time_s)} de la visualización.`
                    : "El indicador de alto contraste marca la ubicación exacta donde se registró la fijación en el instante seleccionado sobre el estímulo visual."}
                  {aoiStatusText}
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
            Resumen numérico de la señal suavizada: tendencia, variabilidad y extremos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <StatisticsTable
            rows={tableRows}
            summaryRow={summaryRow}
            activeSerie={activeSerie}
            loading={timeseriesLoading}
          />
        </CardContent>
      </Card>

      {participantCode && scenario !== "all" && canUseAois ? (
        <AoiContextPanel
          data={aoiData}
          loading={aoiLoading}
          error={aoiError}
          title="AOIs en dilatación pupilar"
          description="Cruza la fijación espacial por AOI con la respuesta pupilar del participante."
        />
      ) : null}
    </div>
  )
}
