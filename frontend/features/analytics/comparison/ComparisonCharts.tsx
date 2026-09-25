"use client"

import { nearestTimeIndex } from "../eegPresentation"

import { Fragment, useEffect, useMemo, useRef } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "@/lib/utils"
import { AnalyticsChartShell } from "../components/AnalyticsChartShell"
import { useChartDragZoom, usePointerDragZoom, ZoomControls } from "../components/ChartDragZoom"
import { useZoomHistory } from "../hooks/useZoomHistory"
import {
  axisTickDecimals,
  formatAxisTick,
  normalizeZoomRange,
  sameZoomRange,
  zoomSpan,
  sliceEegPsd,
  sliceEegSpectrogram,
  type ZoomRange,
} from "../chartZoom"
import type {
  EegPsdData,
  EegSpectrogramData,
  FixationHistogramData,
} from "../types"
import { resolveClickedPoint } from "./chartInteraction"

export const EEG_CHANNEL_COLORS: Record<string, string> = {
  le: "#2563EB",
  f4: "#DC2626",
  c4: "#059669",
  p4: "#7C3AED",
  p3: "#EA580C",
  c3: "#65A30D",
  f3: "#BE123C",
}

export interface TemporalChartPoint {
  time: number
  sourceTime: number
  [key: string]: number
}

export interface TemporalSeries {
  key: string
  label: string
  color: string
  unit: string
}

export interface TemporalPeak {
  kind: "min" | "max"
  series_key: string
  series_label: string
  value: number
  time_s: number
  unit: string
  color: string
  line_style: "dotted" | "dashed"
  label: string
}

interface TooltipPayloadEntry {
  value?: number
  name?: string
  color?: string
  payload?: TemporalChartPoint
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: number
  series: TemporalSeries[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="max-w-[280px] rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-1 font-semibold text-gray-300">
        {Number(label ?? 0).toFixed(2)} s
      </p>
      {payload.map((entry) => {
        const definition = series.find((item) => item.label === entry.name)
        return (
          <p
            key={`${entry.name}-${entry.color}`}
            className="flex items-center gap-2 py-0.5"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">
              {entry.name}: {Number(entry.value).toFixed(3)}{" "}
              {definition?.unit ?? ""}
            </span>
          </p>
        )
      })}
    </div>
  )
}

export function TemporalLineChart({
  data,
  series,
  yLabel,
  xLabel = "Tiempo (s)",
  xDomain,
  peaks = [],
  pinnedTime,
  onPin,
  interactionHint,
  synchronized = true,
  height = 320,
}: {
  data: TemporalChartPoint[]
  series: TemporalSeries[]
  yLabel: string
  xLabel?: string
  xDomain?: [number, number] | null
  peaks?: TemporalPeak[]
  pinnedTime: number | null
  onPin?: (point: TemporalChartPoint) => void
  interactionHint?: string
  synchronized?: boolean
  height?: number
}) {
  const zoomHistory = useZoomHistory<ZoomRange>(sameZoomRange)
  const zoomRange = zoomHistory.range
  const times = useMemo(() => data.map((point) => point.time), [data])
  // A zoom that no longer covers two observations (new data) shows the full view.
  const zoom = zoomRange && zoomSpan(times, zoomRange) ? zoomRange : null
  const visibleData = useMemo(
    () => (zoom ? data.filter((point) => point.time >= zoom.start && point.time <= zoom.end) : data),
    [data, zoom]
  )
  const dragZoom = useChartDragZoom((start, end) => {
    const range = normalizeZoomRange(start, end)
    if (range && zoomSpan(times, range)) zoomHistory.zoomTo(range)
  })
  const domain: [number, number] | ["dataMin", "dataMax"] = zoom
    ? [zoom.start, zoom.end]
    : data.length
      ? (xDomain ?? [data[0].time, data[data.length - 1].time])
      : ["dataMin", "dataMax"]
  const chartVariant = height >= 380 ? "eeg" : "mid"
  const chartLegend = series.map((item) => ({
    label: item.label,
    color: item.color,
  }))

  return (
    <div className="relative">
    <div
      role="img"
      aria-label={`${yLabel}. ${data.length} observaciones; eje horizontal en segundos absolutos.${interactionHint ? ` ${interactionHint}` : ""}`}
      className={onPin ? "cursor-crosshair" : undefined}
    >
      <AnalyticsChartShell
        legend={chartLegend}
        xAxisLabel={xLabel}
        variant={chartVariant}
        dragZoom={dragZoom}
      >
      <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
        <LineChart
          data={visibleData}
          syncId={synchronized ? "comparison-temporal-signals" : undefined}
          syncMethod={synchronized ? "value" : undefined}
          margin={{ top: 24, right: 22, left: 12, bottom: 12 }}
          {...dragZoom.chartProps((state) => {
            const point = resolveClickedPoint(visibleData, state)
            if (point) onPin?.(point)
          })}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            type="number"
            domain={domain}
            height={32}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(value) => formatAxisTick(value, axisTickDecimals(domain))}
          />
          <YAxis
            width={62}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            label={{
              value: yLabel,
              angle: -90,
              position: "insideLeft",
              fontSize: 11,
            }}
          />
          <RechartsTooltip content={<ChartTooltip series={series} />} />
          {pinnedTime != null ? (
            <ReferenceLine
              x={pinnedTime}
              stroke="#EF4444"
              strokeDasharray="4 3"
              label={{
                value: `${pinnedTime.toFixed(1)} s`,
                position: "top",
                fill: "#EF4444",
                fontSize: 10,
              }}
            />
          ) : null}
          {peaks.map((peak) => {
            if (!Number.isFinite(peak.time_s) || !Number.isFinite(peak.value)) {
              return null
            }
            const dasharray =
              peak.line_style === "dotted" ? "2 3" : "5 3"
            return (
              <Fragment key={`${peak.kind}-${peak.series_key}-${peak.time_s}`}>
                <ReferenceLine
                  x={peak.time_s}
                  stroke={peak.color}
                  strokeDasharray={dasharray}
                  strokeWidth={1.3}
                  label={{
                    value: `${peak.value.toFixed(2)} ${peak.unit} ${peak.label} - ${peak.time_s.toFixed(1)} s`,
                    position: "top",
                    fill: peak.color,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
                <ReferenceDot
                  x={peak.time_s}
                  y={peak.value}
                  r={4}
                  fill={peak.color}
                  stroke="#FFFFFF"
                  strokeWidth={2}
                />
              </Fragment>
            )
          })}
          {series.map((item) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={1.7}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 3.5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </AnalyticsChartShell>
      {interactionHint ? <span className="sr-only">{interactionHint}</span> : null}
    </div>
    {zoom ? (
      <ZoomControls onBack={zoomHistory.canGoBack ? zoomHistory.back : undefined} onReset={zoomHistory.reset} />
    ) : null}
    </div>
  )
}

export function FixationHistogramChart({
  data,
}: {
  data: FixationHistogramData
}) {
  return (
    <div
      role="img"
      aria-label={`Histograma de ${data.n_fixations} fijaciones.`}
    >
      <AnalyticsChartShell xAxisLabel="Duración (ms)" variant="compact">
      <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
        <BarChart
          data={data.bins}
          margin={{ top: 12, right: 20, left: 8, bottom: 10 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            interval={0}
            angle={-24}
            textAnchor="end"
            height={62}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <RechartsTooltip
            formatter={(value, name) => [
              Number(value).toLocaleString("es-CO"),
              name === "conteo" ? "Fijaciones" : name,
            ]}
          />
          <Bar
            dataKey="conteo"
            name="Fijaciones"
            fill="#8B5CF6"
            radius={[5, 5, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      </AnalyticsChartShell>
    </div>
  )
}

export function EegPsdChart({ data: fullData }: { data: EegPsdData }) {
  const zoomHistory = useZoomHistory<ZoomRange>(sameZoomRange)
  const zoom = zoomHistory.range && zoomSpan(fullData.frequency, zoomHistory.range) ? zoomHistory.range : null
  const data = sliceEegPsd(fullData, zoom) ?? fullData
  const dragZoom = useChartDragZoom((start, end) => {
    const range = normalizeZoomRange(start, end, { decimals: 2 })
    if (range && zoomSpan(fullData.frequency, range)) zoomHistory.zoomTo(range)
  })
  const points = data.frequency.map((frequency, index) => {
    const row: Record<string, number> = { frequency }
    for (const channel of data.channels) {
      const value = data.power[channel]?.[index]
      if (typeof value === "number" && Number.isFinite(value)) row[channel] = value
    }
    return row
  })
  const chartLegend = data.channels.map((channel) => ({
    label: channel.toUpperCase(),
    color: EEG_CHANNEL_COLORS[channel] ?? "#64748B",
  }))
  return (
    <div className="relative">
    <div
      role="img"
      aria-label={`Densidad espectral de ${data.channels.length} canales EEG.`}
    >
      <AnalyticsChartShell legend={chartLegend} xAxisLabel="Frecuencia (Hz)" variant="mid" dragZoom={dragZoom}>
      <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 18, right: 20, left: 12, bottom: 12 }}
          {...dragZoom.chartProps()}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="frequency"
            type="number"
            domain={["dataMin", "dataMax"]}
            height={32}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            width={72}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            label={{
              value: data.unit,
              angle: -90,
              position: "insideLeft",
              fontSize: 11,
            }}
          />
          <RechartsTooltip
            labelFormatter={(value) => `${Number(value).toFixed(2)} Hz`}
            formatter={(value, name) => [
              `${Number(value).toFixed(3)} ${data.unit}`,
              String(name).toUpperCase(),
            ]}
          />
          {data.channels.map((channel) => (
            <Line
              key={channel}
              type="monotone"
              dataKey={channel}
              name={channel.toUpperCase()}
              stroke={EEG_CHANNEL_COLORS[channel] ?? "#64748B"}
              strokeWidth={1.5}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      </AnalyticsChartShell>
    </div>
    {zoom ? (
      <ZoomControls onBack={zoomHistory.canGoBack ? zoomHistory.back : undefined} onReset={zoomHistory.reset} />
    ) : null}
    </div>
  )
}

const VIRIDIS = ["#440154", "#3B528B", "#21918C", "#5EC962", "#FDE725"]

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function spectrogramColor(ratio: number) {
  const clamped = Math.max(0, Math.min(1, ratio))
  const scaled = clamped * (VIRIDIS.length - 1)
  const startIndex = Math.min(VIRIDIS.length - 2, Math.floor(scaled))
  const mix = scaled - startIndex
  const start = hexToRgb(VIRIDIS[startIndex])
  const end = hexToRgb(VIRIDIS[startIndex + 1])
  return {
    r: Math.round(start.r + (end.r - start.r) * mix),
    g: Math.round(start.g + (end.g - start.g) * mix),
    b: Math.round(start.b + (end.b - start.b) * mix),
  }
}

function SpectrogramCanvas({
  matrix,
  time,
  hopS,
  domain,
  label,
  onTimeZoom,
  onZoomReset,
  onZoomBack,
}: {
  matrix: Array<Array<number | null>>
  time: number[]
  hopS?: number
  domain: { min: number; max: number }
  label: string
  onTimeZoom?: (start: number, end: number) => void
  onZoomReset?: () => void
  onZoomBack?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const firstTime = time[0] ?? 0
  const lastTime = time.at(-1) ?? 0
  const dragZoom = usePointerDragZoom(
    onTimeZoom
      ? (from, to) => onTimeZoom(firstTime + from * (lastTime - firstTime), firstTime + to * (lastTime - firstTime))
      : undefined
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const context = canvas.getContext("2d")
      if (!context) return
      const pixelRatio = window.devicePixelRatio || 1
      const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio))
      const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const frequencyCount = matrix.length
      const timeCount = matrix[0]?.length ?? 0
      if (!frequencyCount || !timeCount) {
        context.clearRect(0, 0, width, height)
        return
      }
      const image = context.createImageData(width, height)
      const span = domain.max - domain.min || 1
      for (let y = 0; y < height; y += 1) {
        const frequencyIndex = Math.min(
          frequencyCount - 1,
          Math.round((1 - y / Math.max(1, height - 1)) * (frequencyCount - 1))
        )
        for (let x = 0; x < width; x += 1) {
          const target = (time[0] ?? 0) + x / Math.max(1, width - 1) * ((time.at(-1) ?? 0) - (time[0] ?? 0))
          const timeIndex = nearestTimeIndex(time, target, hopS)
          const value = matrix[frequencyIndex]?.[timeIndex]
          if (typeof value !== "number" || !Number.isFinite(value)) continue
          const color = spectrogramColor((value - domain.min) / span)
          const offset = (y * width + x) * 4
          image.data[offset] = color.r
          image.data[offset + 1] = color.g
          image.data[offset + 2] = color.b
          image.data[offset + 3] = 255
        }
      }
      context.putImageData(image, 0, 0)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [domain.max, domain.min, matrix, time, hopS])

  return (
    <div className="relative select-none">
      <canvas
        ref={canvasRef}
        aria-label={label}
        className={cn("eeg-spectrogram-canvas w-full rounded-md bg-gray-950", onTimeZoom && "cursor-crosshair")}
        onClick={dragZoom.consumeDragClick}
        {...dragZoom.handlers}
      />
      {dragZoom.bandElement}
      <ZoomControls onBack={onZoomBack} onReset={onZoomReset} />
    </div>
  )
}

export function EegSpectrogramGrid({ data: fullData }: { data: EegSpectrogramData }) {
  const zoomHistory = useZoomHistory<ZoomRange>(sameZoomRange)
  const zoom = zoomHistory.range && zoomSpan(fullData.time, zoomHistory.range) ? zoomHistory.range : null
  const data = sliceEegSpectrogram(fullData, zoom) ?? fullData
  const zoomTo = (start: number, end: number) => {
    const range = normalizeZoomRange(start, end)
    if (range && zoomSpan(fullData.time, range)) zoomHistory.zoomTo(range)
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:gap-4">
      {data.channels.map((channel) => (
        <div
          key={channel}
          className="rounded-lg border border-border bg-background p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-foreground">
              {channel.toUpperCase()}
            </span>
            <span className="text-muted-foreground">
              {data.frequency[0]?.toFixed(1) ?? "0"}–
              {data.frequency.at(-1)?.toFixed(1) ?? "0"} Hz
            </span>
          </div>
          <SpectrogramCanvas
            matrix={data.power[channel] ?? []}
            time={data.time}
            hopS={Number(data.metadata?.display_hop_s ?? data.metadata?.hop_s)}
            domain={data.color_domain}
            label={`Espectrograma del canal ${channel.toUpperCase()}`}
            onTimeZoom={zoomTo}
            onZoomReset={zoom ? zoomHistory.reset : undefined}
            onZoomBack={zoom && zoomHistory.canGoBack ? zoomHistory.back : undefined}
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{data.time[0]?.toFixed(1) ?? "0"} s</span>
            <span>Tiempo</span>
            <span>{data.time.at(-1)?.toFixed(1) ?? "0"} s</span>
          </div>
        </div>
      ))}
    </div>
  )
}
