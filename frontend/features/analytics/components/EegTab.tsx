"use client"

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  Brain,
  Clock,
  Gauge,
  Radio,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { cn } from "@/lib/utils"
import { useEegPsd, useEegSpectrogram, useEegTimeseries, useEegTopography } from "../hooks/useAnalyticsData"
import { StimulusFixationCard, StimulusPreviewSurface } from "./StimulusFixationCard"
import {
  EMPTY_TIME_WINDOW,
  EMPTY_TIME_WINDOW_DRAFT,
  parseTimeWindowValue,
  TimeWindowControls,
  validateTimeWindowDraft,
  type TimeWindow,
  type TimeWindowDraft,
} from "./TimeWindowControls"
import { AnalyticsChartShell } from "./AnalyticsChartShell"

const EEG_CHANNELS = ["le", "f4", "c4", "p4", "p3", "c3", "f3"]
const TOPOGRAPHY_CHANNELS = ["f3", "f4", "c3", "c4", "p3", "p4"]
const EMPTY_CHANNELS: string[] = []
const CHANNEL_COLORS: Record<string, string> = {
  le: "#2563EB",
  f4: "#DC2626",
  c4: "#059669",
  p4: "#7C3AED",
  p3: "#EA580C",
  c3: "#65A30D",
  f3: "#BE123C",
}

type SignalMode = "smooth" | "raw" | "both"
type EegView = "timeseries" | "psd" | "spectrogram" | "topography"

interface EegTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  view: EegView
}

interface EegChartPoint {
  time: number
  [key: string]: number
}

interface EegPsdChartPoint {
  frequency: number
  [key: string]: number
}

interface ChannelStats {
  channel: string
  count: number
  mean: number
  std: number
  median: number
  min: number
  max: number
  baseline: number
  peakPercent: number | null
}

interface PsdStats extends ChannelStats {
  peakFrequency: number
  peakPower: number
}

interface SpectrogramStats {
  channel: string
  frequencyBins: number
  timeBins: number
  peakFrequency: number
  peakTime: number
  peakPower: number
  meanPower: number
  stdPower: number
  medianPower: number
  minPower: number
  maxPower: number
}

interface TopographyFrameRow {
  channel: string
  value: number
  x: number
  y: number
}

interface EegTooltipPayloadEntry {
  value: number
  name: string
  color: string
}

interface EegTooltipProps {
  active?: boolean
  payload?: EegTooltipPayloadEntry[]
  label?: number
}

function formatChannel(channel: string) {
  return channel.toUpperCase()
}

function finiteValues(values: Array<number | undefined>) {
  return values.filter((value): value is number => Number.isFinite(value))
}

function mean(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function std(values: number[]) {
  if (values.length <= 1) return 0
  const avg = mean(values)
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function baseline(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const start = Math.floor(sorted.length * 0.05)
  const end = Math.max(start + 1, Math.ceil(sorted.length * 0.2))
  return mean(sorted.slice(start, end))
}

function peakPercent(maxValue: number, baseValue: number) {
  if (!Number.isFinite(baseValue) || baseValue === 0) return null
  return ((maxValue - baseValue) / Math.abs(baseValue)) * 100
}

function buildStats(channel: string, values: number[]): ChannelStats | null {
  if (values.length === 0) return null
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const baseValue = baseline(values)

  return {
    channel,
    count: values.length,
    mean: mean(values),
    std: std(values),
    median: median(values),
    min: minValue,
    max: maxValue,
    baseline: baseValue,
    peakPercent: peakPercent(maxValue, baseValue),
  }
}

function formatNumber(value: number | null | undefined, decimals = 4, unit = "") {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${value.toFixed(decimals)}${unit}`
}

function EegTooltip({ active, payload, label }: EegTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="max-w-[280px] rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      {typeof label === "number" && (
        <p className="mb-1 font-medium text-gray-300">{label.toFixed(2)}s</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">
              {entry.name}: {Number(entry.value).toFixed(4)} uV
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PsdTooltip({
  active,
  payload,
  label,
  unit,
}: EegTooltipProps & { unit: string }) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="max-w-[280px] rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">
      {typeof label === "number" && (
        <p className="mb-1 font-medium text-gray-300">{label.toFixed(2)} Hz</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="truncate">
              {entry.name}: {Number(entry.value).toFixed(4)} {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const VIRIDIS_STOPS = [
  { point: 0, color: "#440154" },
  { point: 0.13, color: "#482878" },
  { point: 0.25, color: "#3E4989" },
  { point: 0.38, color: "#31688E" },
  { point: 0.5, color: "#26828E" },
  { point: 0.63, color: "#1F9E89" },
  { point: 0.75, color: "#35B779" },
  { point: 0.88, color: "#6DCD59" },
  { point: 1, color: "#FDE725" },
]

const VIRIDIS_GRADIENT = `linear-gradient(to right, ${VIRIDIS_STOPS.map(
  (stop) => `${stop.color} ${Math.round(stop.point * 100)}%`
).join(", ")})`

interface RgbColor {
  r: number
  g: number
  b: number
}

interface SpectrogramHover {
  x: number
  y: number
  time: number
  frequency: number
  value: number
}

interface TopographyHover {
  x: number
  y: number
  value: number
  nearestChannel: string
  nearestValue: number
}

function hexToRgb(hex: string): RgbColor {
  const value = Number.parseInt(hex.slice(1), 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function interpolateColor(position: number) {
  const clamped = Math.max(0, Math.min(1, position))
  const upperIndex = VIRIDIS_STOPS.findIndex((stop) => stop.point >= clamped)
  if (upperIndex <= 0) return hexToRgb(VIRIDIS_STOPS[0].color)

  const lower = VIRIDIS_STOPS[upperIndex - 1]
  const upper = VIRIDIS_STOPS[upperIndex]
  const span = upper.point - lower.point || 1
  const local = (clamped - lower.point) / span
  const lowerRgb = hexToRgb(lower.color)
  const upperRgb = hexToRgb(upper.color)

  return {
    r: Math.round(lowerRgb.r + (upperRgb.r - lowerRgb.r) * local),
    g: Math.round(lowerRgb.g + (upperRgb.g - lowerRgb.g) * local),
    b: Math.round(lowerRgb.b + (upperRgb.b - lowerRgb.b) * local),
  }
}

function scaleSpectrogramValue(value: number, domain: { min: number; max: number }) {
  if (!Number.isFinite(value)) return 0
  const span = domain.max - domain.min
  if (!Number.isFinite(span) || span <= 0) return 0.5
  return Math.max(0, Math.min(1, (value - domain.min) / span))
}

function interpolateTopographyValue(x: number, y: number, rows: TopographyFrameRow[]) {
  let weightedSum = 0
  let weightTotal = 0
  let nearest: TopographyFrameRow | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const row of rows) {
    if (!Number.isFinite(row.value)) continue
    const distance = Math.hypot(x - row.x, y - row.y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = row
    }
    if (distance < 0.001) {
      return { value: row.value, nearest }
    }
    const weight = 1 / Math.max(distance ** 2, 1e-6)
    weightedSum += row.value * weight
    weightTotal += weight
  }

  return {
    value: weightTotal > 0 ? weightedSum / weightTotal : 0,
    nearest,
  }
}

function rotateTopographyPositionClockwise(x: number, y: number) {
  // Backend layout points front of head toward +Y; this view turns the face toward +X.
  return {
    x: y,
    y: -x,
  }
}

function SpectrogramPanel({
  channel,
  time,
  frequency,
  matrix,
  colorDomain,
  unit,
  selectedTime,
  onTimeSelect,
}: {
  channel: string
  time: number[]
  frequency: number[]
  matrix: number[][]
  colorDomain: { min: number; max: number }
  unit: string
  selectedTime?: number | null
  onTimeSelect?: (time: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<SpectrogramHover | null>(null)
  const minTime = time[0] ?? 0
  const maxTime = time[time.length - 1] ?? 0
  const minFrequency = frequency[0] ?? 0
  const maxFrequency = frequency[frequency.length - 1] ?? 0
  const selectedTimeRatio =
    selectedTime != null && maxTime > minTime
      ? Math.max(0, Math.min(1, (selectedTime - minTime) / (maxTime - minTime)))
      : null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = () => {
      const widthCss = Math.max(1, canvas.clientWidth)
      const heightCss = Math.max(1, canvas.clientHeight)
      const dpr = window.devicePixelRatio || 1
      const width = Math.max(1, Math.floor(widthCss * dpr))
      const height = Math.max(1, Math.floor(heightCss * dpr))
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      const freqCount = matrix.length
      const timeCount = matrix[0]?.length ?? 0
      if (freqCount === 0 || timeCount === 0) {
        ctx.clearRect(0, 0, width, height)
        return
      }

      const image = ctx.createImageData(width, height)
      for (let y = 0; y < height; y += 1) {
        const freqRatio = 1 - y / Math.max(1, height - 1)
        const freqIndex = Math.min(freqCount - 1, Math.max(0, Math.round(freqRatio * (freqCount - 1))))
        for (let x = 0; x < width; x += 1) {
          const timeRatio = x / Math.max(1, width - 1)
          const timeIndex = Math.min(timeCount - 1, Math.max(0, Math.round(timeRatio * (timeCount - 1))))
          const value = matrix[freqIndex]?.[timeIndex] ?? 0
          const color = interpolateColor(scaleSpectrogramValue(value, colorDomain))
          const offset = (y * width + x) * 4
          image.data[offset] = color.r
          image.data[offset + 1] = color.g
          image.data[offset + 2] = color.b
          image.data[offset + 3] = 255
        }
      }
      ctx.putImageData(image, 0, 0)
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)

    return () => {
      observer.disconnect()
    }
  }, [colorDomain, matrix])

  const getPointFromEvent = (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (time.length === 0 || frequency.length === 0) return null

    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const xRatio = Math.max(0, Math.min(1, x / rect.width))
    const yRatio = Math.max(0, Math.min(1, y / rect.height))
    const timeIndex = Math.min(time.length - 1, Math.max(0, Math.round(xRatio * (time.length - 1))))
    const frequencyIndex = Math.min(
      frequency.length - 1,
      Math.max(0, Math.round((1 - yRatio) * (frequency.length - 1)))
    )
    const value = matrix[frequencyIndex]?.[timeIndex]
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null
    }

    return {
      x,
      y,
      time: time[timeIndex],
      frequency: frequency[frequencyIndex],
      value,
    }
  }

  const handleMove = (event: MouseEvent<HTMLCanvasElement>) => {
    const point = getPointFromEvent(event)
    if (!point) {
      setHover(null)
      return
    }

    setHover({
      x: point.x,
      y: point.y,
      time: point.time,
      frequency: point.frequency,
      value: point.value,
    })
  }

  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const point = getPointFromEvent(event)
    if (!point) return
    onTimeSelect?.(point.time)
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CHANNEL_COLORS[channel] ?? "#4B5563" }}
          />
          <span className="text-sm font-semibold text-foreground">{formatChannel(channel)}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {matrix.length} x {matrix[0]?.length ?? 0}
        </span>
      </div>

      <div className="grid grid-cols-[44px_1fr] gap-2">
        <div className="flex flex-col items-end justify-between py-1 text-[11px] text-muted-foreground">
          <span>{maxFrequency.toFixed(1)} Hz</span>
          <span>{minFrequency.toFixed(1)} Hz</span>
        </div>
        <div className="relative h-64 overflow-hidden rounded-md bg-gray-950">
          <canvas
            ref={canvasRef}
            className={cn("h-full w-full", onTimeSelect && "cursor-crosshair")}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            onClick={handleClick}
          />
          {selectedTimeRatio != null ? (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
              style={{ left: `${selectedTimeRatio * 100}%` }}
            />
          ) : null}
          {hover ? (
            <div
              className="pointer-events-none absolute z-10 min-w-40 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
              style={{
                left: Math.min(hover.x + 12, 230),
                top: Math.max(8, hover.y - 74),
              }}
            >
              <p className="font-semibold">{formatChannel(channel)}</p>
              <p>Tiempo: {hover.time.toFixed(2)}s</p>
              <p>Frecuencia: {hover.frequency.toFixed(2)} Hz</p>
              <p>
                Potencia: {hover.value.toFixed(4)} {unit}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ml-[52px] mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{minTime.toFixed(1)}s</span>
        <span>{maxTime.toFixed(1)}s</span>
      </div>
    </div>
  )
}

function TopographyPanel({
  rows,
  colorDomain,
  unit,
  className,
}: {
  rows: TopographyFrameRow[]
  colorDomain: { min: number; max: number }
  unit: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<TopographyHover | null>(null)
  const range = 1.15

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = () => {
      const widthCss = Math.max(1, canvas.clientWidth)
      const heightCss = Math.max(1, canvas.clientHeight)
      const dpr = window.devicePixelRatio || 1
      const width = Math.max(1, Math.floor(widthCss * dpr))
      const height = Math.max(1, Math.floor(heightCss * dpr))
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      ctx.clearRect(0, 0, width, height)
      if (rows.length === 0) return

      const image = ctx.createImageData(width, height)
      for (let py = 0; py < height; py += 1) {
        const y = range - (py / Math.max(1, height - 1)) * range * 2
        for (let px = 0; px < width; px += 1) {
          const x = (px / Math.max(1, width - 1)) * range * 2 - range
          const offset = (py * width + px) * 4
          if (x * x + y * y > 1) {
            image.data[offset + 3] = 0
            continue
          }
          const { value } = interpolateTopographyValue(x, y, rows)
          const color = interpolateColor(scaleSpectrogramValue(value, colorDomain))
          image.data[offset] = color.r
          image.data[offset + 1] = color.g
          image.data[offset + 2] = color.b
          image.data[offset + 3] = 255
        }
      }
      ctx.putImageData(image, 0, 0)

      const toCanvas = (x: number, y: number) => ({
        x: ((x + range) / (range * 2)) * width,
        y: ((range - y) / (range * 2)) * height,
      })

      ctx.save()
      ctx.lineWidth = 2 * dpr
      ctx.strokeStyle = "#111827"
      ctx.fillStyle = "#111827"

      const center = toCanvas(0, 0)
      const radius = (1 / (range * 2)) * Math.min(width, height)
      ctx.beginPath()
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
      ctx.stroke()

      const topEar = toCanvas(0, 1)
      const bottomEar = toCanvas(0, -1)
      ctx.beginPath()
      ctx.ellipse(topEar.x, topEar.y, 0.15 * width, 0.08 * height, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(bottomEar.x, bottomEar.y, 0.15 * width, 0.08 * height, 0, 0, Math.PI * 2)
      ctx.stroke()

      const noseTip = toCanvas(1.08, 0)
      const noseTop = toCanvas(0.92, 0.07)
      const noseBottom = toCanvas(0.92, -0.07)
      ctx.beginPath()
      ctx.moveTo(noseTop.x, noseTop.y)
      ctx.lineTo(noseTip.x, noseTip.y)
      ctx.lineTo(noseBottom.x, noseBottom.y)
      ctx.stroke()

      ctx.font = `${12 * dpr}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (const row of rows) {
        const point = toCanvas(row.x, row.y)
        ctx.beginPath()
        ctx.fillStyle = "#111827"
        ctx.arc(point.x, point.y, 4.5 * dpr, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = 2 * dpr
        ctx.strokeStyle = "#FFFFFF"
        ctx.stroke()
        ctx.fillStyle = "#111827"
        ctx.fillText(formatChannel(row.channel), point.x, point.y + 16 * dpr)
      }
      ctx.restore()
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)

    return () => {
      observer.disconnect()
    }
  }, [colorDomain, rows])

  const handleMove = (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const xRatio = (event.clientX - rect.left) / Math.max(1, rect.width)
    const yRatio = (event.clientY - rect.top) / Math.max(1, rect.height)
    const x = xRatio * range * 2 - range
    const y = range - yRatio * range * 2
    if (x * x + y * y > 1 || rows.length === 0) {
      setHover(null)
      return
    }

    const { value, nearest } = interpolateTopographyValue(x, y, rows)
    setHover({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      value,
      nearestChannel: nearest?.channel ?? "",
      nearestValue: nearest?.value ?? value,
    })
  }

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      />
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 min-w-44 rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: Math.min(hover.x + 12, 330),
            top: Math.max(8, hover.y - 74),
          }}
        >
          <p className="font-semibold">Topografia EEG</p>
          <p>
            Potencia: {hover.value.toFixed(4)} {unit}
          </p>
          {hover.nearestChannel ? (
            <p>
              Electrodo cercano: {formatChannel(hover.nearestChannel)} ({hover.nearestValue.toFixed(4)} {unit})
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TelevisionFrame({
  projectId,
  participantCode,
  selectedTime,
}: {
  projectId: string
  participantCode: string | null
  selectedTime: number | null
}) {
  return (
    <div className="relative mx-auto w-full max-w-[700px] px-4 pb-7 pt-7">
      <svg
        className="pointer-events-none absolute left-1/2 top-0 h-9 w-32 -translate-x-1/2 text-gray-900 dark:text-gray-100"
        viewBox="0 0 112 40"
        aria-hidden="true"
      >
        <path
          d="M56 39 L35 4 M56 39 L77 4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>

      <div className="relative rounded-md border-2 border-gray-900 bg-gray-950 p-2.5 shadow-sm dark:border-gray-100">
        <div className="aspect-video overflow-hidden rounded-sm bg-gray-950">
          <StimulusPreviewSurface
            projectId={projectId}
            participantCode={participantCode}
            selectedTime={selectedTime}
            emptyText="Sin ventana seleccionada."
            className="min-h-0 text-xs"
          />
        </div>
      </div>

      <svg
        className="pointer-events-none absolute bottom-0 left-1/2 h-7 w-40 -translate-x-1/2 text-gray-900 dark:text-gray-100"
        viewBox="0 0 144 32"
        aria-hidden="true"
      >
        <path
          d="M48 1 L35 30 M96 1 L109 30 M31 30 H50 M94 30 H113"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </div>
  )
}

function TopographyScene({
  rows,
  colorDomain,
  unit,
  projectId,
  participantCode,
  selectedTime,
}: {
  rows: TopographyFrameRow[]
  colorDomain: { min: number; max: number }
  unit: string
  projectId: string
  participantCode: string | null
  selectedTime: number | null
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30 p-2 sm:p-3">
      <div className="grid min-h-[360px] grid-cols-1 items-center gap-4 lg:h-[560px] lg:min-h-0 lg:grid-cols-[minmax(300px,0.46fr)_minmax(360px,0.54fr)] xl:h-[600px] 2xl:h-[620px]">
        <div className="flex min-w-0 items-center justify-center">
          <TopographyPanel
            rows={rows}
            colorDomain={colorDomain}
            unit={unit}
            className="max-w-[550px]"
          />
        </div>
        <div className="flex min-w-0 items-center justify-center">
          <TelevisionFrame
            projectId={projectId}
            participantCode={participantCode}
            selectedTime={selectedTime}
          />
        </div>
      </div>
    </div>
  )
}

function EegStatsTable({ rows }: { rows: ChannelStats[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {["Canal", "N", "Base", "Media", "Desv.", "Mediana", "Min", "Max", "Pico %"].map((header, index) => (
              <th
                key={header}
                className={cn(
                  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.channel} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                  />
                  <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                </div>
              </td>
              <td className="px-4 py-4 text-right text-muted-foreground">{row.count}</td>
              <td className="px-4 py-4 text-right text-muted-foreground">{formatNumber(row.baseline, 4, " uV")}</td>
              <td className="px-4 py-4 text-right font-semibold text-foreground">{formatNumber(row.mean, 4, " uV")}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.std, 4, " uV")}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.median, 4, " uV")}</td>
              <td className="px-4 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">{formatNumber(row.min, 4, " uV")}</td>
              <td className="px-4 py-4 text-right font-medium text-rose-500 dark:text-rose-400">{formatNumber(row.max, 4, " uV")}</td>
              <td className="px-4 py-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                {row.peakPercent != null ? `${row.peakPercent >= 0 ? "+" : ""}${row.peakPercent.toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PsdStatsTable({ rows, unit }: { rows: PsdStats[]; unit: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {["Canal", "Bins", "Freq. pico", "Pot. pico", "Pot. media", "Desv.", "Mediana", "Min", "Max"].map((header, index) => (
              <th
                key={header}
                className={cn(
                  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.channel} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                  />
                  <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                </div>
              </td>
              <td className="px-4 py-4 text-right text-muted-foreground">{row.count}</td>
              <td className="px-4 py-4 text-right font-semibold text-foreground">{formatNumber(row.peakFrequency, 2, " Hz")}</td>
              <td className="px-4 py-4 text-right font-semibold text-rose-500 dark:text-rose-400">{formatNumber(row.peakPower, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.mean, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.std, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right text-foreground/80">{formatNumber(row.median, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">{formatNumber(row.min, 4, ` ${unit}`)}</td>
              <td className="px-4 py-4 text-right font-medium text-rose-500 dark:text-rose-400">{formatNumber(row.max, 4, ` ${unit}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SpectrogramStatsTable({ rows, unit }: { rows: SpectrogramStats[]; unit: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {[
              "Canal",
              "Matriz",
              "Freq. pico",
              "Tiempo pico",
              "Pot. pico",
              "Pot. media",
              "Desv.",
              "Mediana",
              "Min",
              "Max",
            ].map((header, index) => (
              <th
                key={header}
                className={cn(
                  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  index === 0 ? "text-left" : "text-right"
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.channel} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                  />
                  <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                </div>
              </td>
              <td className="px-4 py-4 text-right text-muted-foreground">
                {row.frequencyBins} x {row.timeBins}
              </td>
              <td className="px-4 py-4 text-right font-semibold text-foreground">
                {formatNumber(row.peakFrequency, 2, " Hz")}
              </td>
              <td className="px-4 py-4 text-right text-foreground/80">
                {formatNumber(row.peakTime, 2, " s")}
              </td>
              <td className="px-4 py-4 text-right font-semibold text-rose-500 dark:text-rose-400">
                {formatNumber(row.peakPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right text-foreground/80">
                {formatNumber(row.meanPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right text-foreground/80">
                {formatNumber(row.stdPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right text-foreground/80">
                {formatNumber(row.medianPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">
                {formatNumber(row.minPower, 4, ` ${unit}`)}
              </td>
              <td className="px-4 py-4 text-right font-medium text-rose-500 dark:text-rose-400">
                {formatNumber(row.maxPower, 4, ` ${unit}`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

export function EegTab({ projectId, participantCode, scenario, view }: EegTabProps) {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(EEG_CHANNELS)
  const [signalMode, setSignalMode] = useState<SignalMode>("smooth")
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [selectedTopographyFrame, setSelectedTopographyFrame] = useState(0)
  const [timeseriesWindowDraft, setTimeseriesWindowDraft] = useState<TimeWindowDraft>(EMPTY_TIME_WINDOW_DRAFT)
  const [timeseriesWindow, setTimeseriesWindow] = useState<TimeWindow>(EMPTY_TIME_WINDOW)
  const [timeseriesWindowError, setTimeseriesWindowError] = useState<string | null>(null)
  const [psdWindowDraft, setPsdWindowDraft] = useState<TimeWindowDraft>(EMPTY_TIME_WINDOW_DRAFT)
  const [psdWindow, setPsdWindow] = useState<TimeWindow>(EMPTY_TIME_WINDOW)
  const [psdWindowError, setPsdWindowError] = useState<string | null>(null)

  const {
    data: timeseriesData,
    loading: timeseriesLoading,
    error: timeseriesError,
  } = useEegTimeseries(
    projectId,
    participantCode,
    scenario,
    selectedChannels,
    0.2,
    5000,
    timeseriesWindow.start,
    timeseriesWindow.end
  )
  const {
    data: psdData,
    loading: psdLoading,
    error: psdError,
  } = useEegPsd(
    projectId,
    participantCode,
    scenario,
    selectedChannels,
    null,
    true,
    5000,
    psdWindow.start,
    psdWindow.end
  )
  const {
    data: spectrogramData,
    loading: spectrogramLoading,
    error: spectrogramError,
  } = useEegSpectrogram(
    projectId,
    view === "spectrogram" ? participantCode : null,
    scenario,
    selectedChannels
  )
  const {
    data: topographyData,
    loading: topographyLoading,
    error: topographyError,
  } = useEegTopography(
    projectId,
    view === "topography" ? participantCode : null,
    scenario,
    selectedChannels
  )

  const chartData = useMemo<EegChartPoint[]>(() => {
    if (!timeseriesData) return []

    return timeseriesData.time.map((time, index) => {
      const point: EegChartPoint = { time }
      for (const channel of timeseriesData.channels) {
        point[`${channel}_raw`] = timeseriesData.raw[channel]?.[index] ?? 0
        point[`${channel}_smooth`] = timeseriesData.smooth[channel]?.[index] ?? 0
      }
      return point
    })
  }, [timeseriesData])

  const chartDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (chartData.length === 0) return ["dataMin", "dataMax"]
    return [chartData[0].time, chartData[chartData.length - 1].time]
  }, [chartData])

  const psdChartData = useMemo<EegPsdChartPoint[]>(() => {
    if (!psdData) return []

    return psdData.frequency.map((frequency, index) => {
      const point: EegPsdChartPoint = { frequency }
      for (const channel of psdData.channels) {
        point[channel] = psdData.power[channel]?.[index] ?? 0
      }
      return point
    })
  }, [psdData])

  const psdDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (psdChartData.length === 0) return ["dataMin", "dataMax"]
    return [psdChartData[0].frequency, psdChartData[psdChartData.length - 1].frequency]
  }, [psdChartData])

  const selectedPoint = useMemo<EegChartPoint | null>(() => {
    if (selectedTime == null || chartData.length === 0) return null
    let nearest = chartData[0]
    let minDiff = Math.abs(chartData[0].time - selectedTime)
    for (const point of chartData) {
      const diff = Math.abs(point.time - selectedTime)
      if (diff < minDiff) {
        minDiff = diff
        nearest = point
      }
    }
    return nearest
  }, [chartData, selectedTime])

  const channelStats = useMemo<ChannelStats[]>(() => {
    if (!timeseriesData) return []
    return timeseriesData.channels
      .map((channel) => {
        const values = finiteValues(timeseriesData.smooth[channel] ?? [])
        return buildStats(channel, values)
      })
      .filter((row): row is ChannelStats => row != null)
  }, [timeseriesData])

  const timeRepresentativeStats = useMemo(() => {
    const values = channelStats.flatMap((row) =>
      finiteValues(timeseriesData?.smooth[row.channel] ?? [])
    )
    if (values.length === 0) {
      return {
        meanValue: null,
        minValue: null,
        maxValue: null,
      }
    }

    return {
      meanValue: mean(values),
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
    }
  }, [channelStats, timeseriesData])

  const psdStats = useMemo<PsdStats[]>(() => {
    if (!psdData) return []
    return psdData.channels
      .map((channel) => {
        const values = finiteValues(psdData.power[channel] ?? [])
        const stats = buildStats(channel, values)
        if (!stats || values.length === 0) return null

        let peakIndex = 0
        for (let index = 1; index < values.length; index += 1) {
          if (values[index] > values[peakIndex]) {
            peakIndex = index
          }
        }

        return {
          ...stats,
          peakFrequency: psdData.frequency[peakIndex] ?? 0,
          peakPower: values[peakIndex],
        }
      })
      .filter((row): row is PsdStats => row != null)
  }, [psdData])

  const psdRepresentativeStats = useMemo(() => {
    if (psdStats.length === 0) {
      return {
        peakFrequency: null,
        peakPower: null,
        meanPower: null,
      }
    }

    const peak = psdStats.reduce((best, row) =>
      row.peakPower > best.peakPower ? row : best
    )
    const allPower = psdStats.flatMap((row) => finiteValues(psdData?.power[row.channel] ?? []))

    return {
      peakFrequency: peak.peakFrequency,
      peakPower: peak.peakPower,
      meanPower: allPower.length > 0 ? mean(allPower) : null,
    }
  }, [psdData, psdStats])

  const spectrogramRepresentativeStats = useMemo(() => {
    if (!spectrogramData) {
      return {
        maxPower: null,
        meanPower: null,
        maxFrequency: null,
      }
    }

    const values = spectrogramData.channels.flatMap((channel) =>
      (spectrogramData.power[channel] ?? []).flatMap((row) => finiteValues(row))
    )
    const maxPower = values.reduce(
      (currentMax, value) => (value > currentMax ? value : currentMax),
      values[0] ?? 0
    )

    return {
      maxPower: values.length > 0 ? maxPower : null,
      meanPower: values.length > 0 ? mean(values) : null,
      maxFrequency:
        spectrogramData.frequency.length > 0
          ? spectrogramData.frequency[spectrogramData.frequency.length - 1]
      : null,
    }
  }, [spectrogramData])

  const spectrogramStats = useMemo<SpectrogramStats[]>(() => {
    if (!spectrogramData) return []

    return spectrogramData.channels
      .map((channel) => {
        const matrix = spectrogramData.power[channel] ?? []
        const values = matrix.flatMap((row) => finiteValues(row))
        if (values.length === 0) return null

        let peakPower = values[0]
        let peakFrequencyIndex = 0
        let peakTimeIndex = 0
        let minPower = values[0]

        matrix.forEach((row, frequencyIndex) => {
          row.forEach((value, timeIndex) => {
            if (!Number.isFinite(value)) return
            if (value > peakPower) {
              peakPower = value
              peakFrequencyIndex = frequencyIndex
              peakTimeIndex = timeIndex
            }
            if (value < minPower) {
              minPower = value
            }
          })
        })

        return {
          channel,
          frequencyBins: matrix.length,
          timeBins: matrix[0]?.length ?? 0,
          peakFrequency: spectrogramData.frequency[peakFrequencyIndex] ?? 0,
          peakTime: spectrogramData.time[peakTimeIndex] ?? 0,
          peakPower,
          meanPower: mean(values),
          stdPower: std(values),
          medianPower: median(values),
          minPower,
          maxPower: peakPower,
        }
      })
      .filter((row): row is SpectrogramStats => row != null)
  }, [spectrogramData])

  const spectrogramPeak = useMemo(() => {
    if (spectrogramStats.length === 0) return null
    return spectrogramStats.reduce((best, row) =>
      row.peakPower > best.peakPower ? row : best
    )
  }, [spectrogramStats])

  const topographyFrameIndex = useMemo(() => {
    const frameCount = topographyData?.time.length ?? 0
    if (frameCount === 0) return 0
    return Math.max(0, Math.min(selectedTopographyFrame, frameCount - 1))
  }, [selectedTopographyFrame, topographyData])

  const topographyRows = useMemo<TopographyFrameRow[]>(() => {
    if (!topographyData) return []

    return topographyData.channels
      .map((channel) => {
        const position = topographyData.positions[channel]
        const value = topographyData.power[channel]?.[topographyFrameIndex]
        if (!position || position.length < 2 || !Number.isFinite(value)) return null
        const rotated = rotateTopographyPositionClockwise(position[0], position[1])
        return {
          channel,
          value: Number(value),
          x: rotated.x,
          y: rotated.y,
        }
      })
      .filter((row): row is TopographyFrameRow => row != null)
  }, [topographyData, topographyFrameIndex])

  const topographyStats = useMemo(() => {
    const values = topographyRows.map((row) => row.value).filter(Number.isFinite)
    const strongest = topographyRows.reduce<TopographyFrameRow | null>(
      (best, row) => (!best || row.value > best.value ? row : best),
      null
    )

    return {
      frameTime: topographyData?.time[topographyFrameIndex] ?? null,
      meanPower: values.length > 0 ? mean(values) : null,
      minPower: values.length > 0 ? Math.min(...values) : null,
      maxPower: values.length > 0 ? Math.max(...values) : null,
      strongest,
    }
  }, [topographyData, topographyFrameIndex, topographyRows])

  const availableChannels =
    timeseriesData?.available_channels ??
    psdData?.available_channels ??
    spectrogramData?.available_channels ??
    EEG_CHANNELS
  const visibleChannels = timeseriesData?.channels ?? EMPTY_CHANNELS
  const visiblePsdChannels = psdData?.channels ?? EMPTY_CHANNELS
  const visibleSpectrogramChannels = spectrogramData?.channels ?? EMPTY_CHANNELS
  const availableTopographyChannels = topographyData?.available_channels ?? TOPOGRAPHY_CHANNELS
  const eegChartLegend = visibleChannels.flatMap((channel) => {
    const color = CHANNEL_COLORS[channel] ?? "#4B5563"
    const channelLabel = formatChannel(channel)
    return [
      ...(signalMode === "smooth" || signalMode === "both"
        ? [{ label: `${channelLabel} suavizada`, color }]
        : []),
      ...(signalMode === "raw" || signalMode === "both"
        ? [{ label: `${channelLabel} cruda`, color }]
        : []),
    ]
  })
  const psdChartLegend = visiblePsdChannels.map((channel) => ({
    label: formatChannel(channel),
    color: CHANNEL_COLORS[channel] ?? "#4B5563",
  }))

  const selectedEegValue = useMemo(() => {
    if (!selectedPoint || visibleChannels.length === 0) return null
    const values = visibleChannels
      .map((channel) => selectedPoint[`${channel}_smooth`])
      .filter((value): value is number => Number.isFinite(value))
    return values.length > 0 ? mean(values) : null
  }, [selectedPoint, visibleChannels])

  const timeExtremePoints = useMemo(() => {
    let minPoint: { time: number; value: number } | null = null
    let maxPoint: { time: number; value: number } | null = null

    for (const point of chartData) {
      for (const channel of visibleChannels) {
        const value = point[`${channel}_smooth`]
        if (!Number.isFinite(value)) continue
        if (!minPoint || value < minPoint.value) {
          minPoint = { time: point.time, value }
        }
        if (!maxPoint || value > maxPoint.value) {
          maxPoint = { time: point.time, value }
        }
      }
    }

    return { minPoint, maxPoint }
  }, [chartData, visibleChannels])

  const spectrogramSelectedValue = useMemo(() => {
    if (selectedTime == null || !spectrogramData || visibleSpectrogramChannels.length === 0) {
      return null
    }

    let timeIndex = 0
    let minDiff = Math.abs((spectrogramData.time[0] ?? 0) - selectedTime)
    for (let index = 1; index < spectrogramData.time.length; index += 1) {
      const diff = Math.abs(spectrogramData.time[index] - selectedTime)
      if (diff < minDiff) {
        minDiff = diff
        timeIndex = index
      }
    }

    const values = visibleSpectrogramChannels
      .flatMap((channel) => (spectrogramData.power[channel] ?? []).map((row) => row[timeIndex]))
      .filter((value): value is number => Number.isFinite(value))

    return values.length > 0 ? Math.max(...values) : null
  }, [selectedTime, spectrogramData, visibleSpectrogramChannels])

  const handleChannelToggle = (channel: string) => {
    if (!availableChannels.includes(channel)) return
    setSelectedChannels((current) => {
      if (current.includes(channel)) {
        return current.length === 1 ? current : current.filter((item) => item !== channel)
      }
      return [...current, channel]
    })
  }

  const handleTopographyChannelToggle = (channel: string) => {
    if (!availableTopographyChannels.includes(channel)) return
    setSelectedChannels((current) => {
      const selectedTopographyChannels = current.filter((item) =>
        TOPOGRAPHY_CHANNELS.includes(item)
      )
      if (current.includes(channel)) {
        if (selectedTopographyChannels.length <= 3) return current
        return current.filter((item) => item !== channel)
      }
      return [...current, channel]
    })
  }

  const handleChartClick = (state: unknown) => {
    const time = readClickedTime(state)
    if (time == null) return
    setSelectedTime(time)
  }

  const handleApplyTimeseriesWindow = () => {
    const start = parseTimeWindowValue(timeseriesWindowDraft.start)
    const end = parseTimeWindowValue(timeseriesWindowDraft.end)

    if (Number.isNaN(start) || Number.isNaN(end)) {
      setTimeseriesWindowError("Usa valores numéricos válidos para la ventana temporal.")
      return
    }

    if ((start != null && start < 0) || (end != null && end < 0)) {
      setTimeseriesWindowError("Los segundos deben ser mayores o iguales a 0.")
      return
    }

    if (start != null && end != null && end <= start) {
      setTimeseriesWindowError("El segundo final debe ser mayor que el segundo inicial.")
      return
    }

    setTimeseriesWindow({
      start: start == null ? null : Number(start.toFixed(4)),
      end: end == null ? null : Number(end.toFixed(4)),
    })
    setTimeseriesWindowError(null)
    setSelectedTime(null)
  }

  const handleResetTimeseriesWindow = () => {
    setTimeseriesWindowDraft(EMPTY_TIME_WINDOW_DRAFT)
    setTimeseriesWindow(EMPTY_TIME_WINDOW)
    setTimeseriesWindowError(null)
    setSelectedTime(null)
  }

  const handleApplyPsdWindow = () => {
    const { window, error } = validateTimeWindowDraft(psdWindowDraft)
    if (error || !window) {
      setPsdWindowError(error)
      return
    }

    setPsdWindow(window)
    setPsdWindowError(null)
  }

  const handleResetPsdWindow = () => {
    setPsdWindowDraft(EMPTY_TIME_WINDOW_DRAFT)
    setPsdWindow(EMPTY_TIME_WINDOW)
    setPsdWindowError(null)
  }

  const handleTopographyFrameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedTopographyFrame(Number(event.target.value))
  }

  return (
    <div className="analytics-stack">
      {view === "timeseries" ? (
      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Brain className="h-5 w-5" />
              EEG por canal
            </CardTitle>
            <CardDescription>
              Trazas de electroencefalografia por canal en el tiempo registrado.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
          </div>
        </CardHeader>

        <CardContent>
          <TimeWindowControls
            draftStart={timeseriesWindowDraft.start}
            draftEnd={timeseriesWindowDraft.end}
            appliedWindow={timeseriesWindow}
            error={timeseriesWindowError}
            loading={timeseriesLoading}
            onDraftStartChange={(value) => {
              setTimeseriesWindowDraft((current) => ({ ...current, start: value }))
              setTimeseriesWindowError(null)
            }}
            onDraftEndChange={(value) => {
              setTimeseriesWindowDraft((current) => ({ ...current, end: value }))
              setTimeseriesWindowError(null)
            }}
            onApply={handleApplyTimeseriesWindow}
            onReset={handleResetTimeseriesWindow}
          />

          <div className="mb-5 flex flex-wrap gap-2">
            {EEG_CHANNELS.map((channel) => {
              const isActive = selectedChannels.includes(channel)
              const isAvailable = availableChannels.includes(channel)
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => handleChannelToggle(channel)}
                  disabled={!isAvailable}
                  className={cn(
                    "inline-flex min-w-12 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition",
                    isActive && isAvailable
                      ? "border-transparent text-white"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                    !isAvailable && "cursor-not-allowed opacity-40"
                  )}
                  style={isActive && isAvailable ? { backgroundColor: CHANNEL_COLORS[channel] } : undefined}
                >
                  {formatChannel(channel)}
                </button>
              )
            })}
          </div>

          <div className="analytics-kpi-grid">
            <KpiCard
              label="Media"
              value={timeRepresentativeStats.meanValue}
              unit="uV"
              decimals={4}
              description="Promedio suavizado visible"
              Icon={Activity}
              loading={timeseriesLoading}
              iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
              iconColorClass="text-emerald-600 dark:text-emerald-400"
              labelColorClass="text-emerald-700 dark:text-emerald-400"
            />
            <KpiCard
              label="Mínimo"
              value={timeRepresentativeStats.minValue}
              unit="uV"
              decimals={4}
              description="Valor más bajo visible"
              Icon={TrendingDown}
              loading={timeseriesLoading}
              onClick={timeExtremePoints.minPoint ? () => setSelectedTime(timeExtremePoints.minPoint?.time ?? null) : undefined}
              active={selectedTime === timeExtremePoints.minPoint?.time}
              hoverBgClass="hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              activeBgClass="bg-emerald-50 dark:bg-emerald-950/30"
              iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
              iconColorClass="text-emerald-600 dark:text-emerald-400"
              labelColorClass="text-emerald-700 dark:text-emerald-400"
            />
            <KpiCard
              label="Máximo"
              value={timeRepresentativeStats.maxValue}
              unit="uV"
              decimals={4}
              description="Valor más alto visible"
              Icon={TrendingUp}
              loading={timeseriesLoading}
              onClick={timeExtremePoints.maxPoint ? () => setSelectedTime(timeExtremePoints.maxPoint?.time ?? null) : undefined}
              active={selectedTime === timeExtremePoints.maxPoint?.time}
              hoverBgClass="hover:bg-rose-50 dark:hover:bg-rose-950/30"
              activeBgClass="bg-rose-50 dark:bg-rose-950/30"
              iconBgClass="bg-rose-100 dark:bg-rose-900/40"
              iconColorClass="text-rose-600 dark:text-rose-400"
              labelColorClass="text-rose-700 dark:text-rose-400"
            />
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                label: "Muestras",
                value: chartData.length.toLocaleString(),
                sub: "puntos renderizados",
                Icon: Activity,
                bg: "bg-blue-50 dark:bg-blue-950/40",
                iconColor: "text-blue-500",
              },
              {
                label: "Frecuencia",
                value: `${(timeseriesData?.sampling_rate_hz ?? 0).toFixed(2)}`,
                sub: "Hz estimados",
                Icon: Gauge,
                bg: "bg-emerald-50 dark:bg-emerald-950/40",
                iconColor: "text-emerald-500",
              },
              {
                label: "Canales",
                value: String(visibleChannels.length),
                sub: selectedChannels.map(formatChannel).join(", "),
                Icon: Brain,
                bg: "bg-violet-50 dark:bg-violet-950/40",
                iconColor: "text-violet-500",
              },
            ].map(({ label, value, sub, Icon, bg, iconColor }) => (
              <div
                key={label}
                className="flex min-h-24 items-center gap-3 rounded-lg border border-border bg-card px-4 py-4"
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", bg)}>
                  <Icon className={cn("h-5 w-5", iconColor)} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-normal uppercase tracking-widest text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-bold leading-tight text-foreground">
                    {value}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {timeseriesLoading ? (
            <div className="analytics-state-frame-eeg w-full animate-pulse rounded-lg bg-muted" />
          ) : timeseriesError ? (
            <div className="analytics-state-frame-eeg flex items-center justify-center text-sm text-muted-foreground">
              No se pudo cargar la senal EEG.
            </div>
          ) : chartData.length === 0 || visibleChannels.length === 0 ? (
            <div className="analytics-state-frame-eeg flex items-center justify-center text-sm text-muted-foreground">
              No hay datos de EEG para los filtros seleccionados.
            </div>
          ) : (
            <AnalyticsChartShell legend={eegChartLegend} variant="eeg">
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <LineChart
                data={chartData}
                onClick={handleChartClick}
                margin={{ top: 12, right: 24, left: 16, bottom: 28 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={chartDomain}
                  tickFormatter={(value) => String(Math.round(Number(value)))}
                  tickMargin={8}
                />
                <YAxis
                  width={80}
                  label={{ value: "EEG (uV)", angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" } }}
                />
                <RechartsTooltip content={<EegTooltip />} />

                {selectedTime != null ? (
                  <ReferenceLine
                    x={selectedTime}
                    stroke="#374151"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    label={{ value: `${selectedTime.toFixed(1)}s`, position: "top", fontSize: 11, fill: "#374151" }}
                  />
                ) : null}

                {visibleChannels.map((channel) =>
                  signalMode === "smooth" || signalMode === "both" ? (
                    <Line
                      key={`${channel}-smooth`}
                      type="linear"
                      dataKey={`${channel}_smooth`}
                      name={`${formatChannel(channel)} suavizada`}
                      stroke={CHANNEL_COLORS[channel] ?? "#4B5563"}
                      strokeWidth={1.8}
                      dot={false}
                      activeDot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  ) : null
                )}

                {visibleChannels.map((channel) =>
                  signalMode === "raw" || signalMode === "both" ? (
                    <Line
                      key={`${channel}-raw`}
                      type="linear"
                      dataKey={`${channel}_raw`}
                      name={`${formatChannel(channel)} cruda`}
                      stroke={CHANNEL_COLORS[channel] ?? "#4B5563"}
                      strokeWidth={signalMode === "raw" ? 1.4 : 0.9}
                      strokeOpacity={signalMode === "raw" ? 1 : 0.36}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ) : null
                )}
              </LineChart>
            </ResponsiveContainer>
            </AnalyticsChartShell>
          )}
        </CardContent>
      </Card>
      ) : null}

      {view === "timeseries" ? (
        <StimulusFixationCard
          projectId={projectId}
          participantCode={participantCode}
          scenario={scenario}
          selectedTime={selectedTime}
          selectedValue={selectedEegValue}
          selectedValueLabel="EEG"
          selectedValueSub="uV promedio"
          selectedValueDecimals={4}
          totalDurationS={chartData[chartData.length - 1]?.time ?? null}
          description="Ubicación de la mirada del participante durante el instante seleccionado de la señal EEG."
          emptyText="Haz clic en el gráfico o en Mínimo / Máximo para ver la mirada del participante"
          metricDescription="la amplitud EEG promedio"
          onClearSelection={() => setSelectedTime(null)}
        />
      ) : null}

      {view === "timeseries" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estadísticas EEG por canal</CardTitle>
            <CardDescription>
              Resumen de la señal suavizada para los canales seleccionados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeseriesLoading ? (
              <div className="h-52 w-full animate-pulse rounded-lg bg-muted" />
            ) : channelStats.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular estadísticas.
              </div>
            ) : (
              <EegStatsTable rows={channelStats} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "psd" ? (
      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Radio className="h-5 w-5" />
              Densidad espectral de potencia
            </CardTitle>
            <CardDescription>
              Potencia por frecuencia de los canales EEG seleccionados.
            </CardDescription>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
              <span className="font-semibold text-foreground">{psdData?.unit ?? "dB"}</span>
            </div>
            <div>
              <span className="block text-xs uppercase tracking-widest text-muted-foreground">Bins</span>
              <span className="font-semibold text-foreground">{psdChartData.length.toLocaleString()}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TimeWindowControls
            draftStart={psdWindowDraft.start}
            draftEnd={psdWindowDraft.end}
            appliedWindow={psdWindow}
            error={psdWindowError}
            loading={psdLoading}
            onDraftStartChange={(value) => {
              setPsdWindowDraft((current) => ({ ...current, start: value }))
              setPsdWindowError(null)
            }}
            onDraftEndChange={(value) => {
              setPsdWindowDraft((current) => ({ ...current, end: value }))
              setPsdWindowError(null)
            }}
            onApply={handleApplyPsdWindow}
            onReset={handleResetPsdWindow}
          />

              <div className="analytics-kpi-grid">
            <KpiCard
              label="Frecuencia pico"
              value={psdRepresentativeStats.peakFrequency}
              unit="Hz"
              decimals={2}
              description="Máxima potencia observada"
              Icon={Radio}
              loading={psdLoading}
              iconBgClass="bg-violet-100 dark:bg-violet-900/40"
              iconColorClass="text-violet-600 dark:text-violet-400"
              labelColorClass="text-violet-700 dark:text-violet-400"
            />
            <KpiCard
              label="Potencia pico"
              value={psdRepresentativeStats.peakPower}
              unit={psdData?.unit ?? "dB"}
              decimals={4}
              description="Mayor PSD entre canales"
              Icon={TrendingUp}
              loading={psdLoading}
              iconBgClass="bg-rose-100 dark:bg-rose-900/40"
              iconColorClass="text-rose-600 dark:text-rose-400"
              labelColorClass="text-rose-700 dark:text-rose-400"
            />
            <KpiCard
              label="Potencia media"
              value={psdRepresentativeStats.meanPower}
              unit={psdData?.unit ?? "dB"}
              decimals={4}
              description="Promedio espectral visible"
              Icon={Waves}
              loading={psdLoading}
              iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
              iconColorClass="text-emerald-600 dark:text-emerald-400"
              labelColorClass="text-emerald-700 dark:text-emerald-400"
            />
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {EEG_CHANNELS.map((channel) => {
              const isActive = selectedChannels.includes(channel)
              const isAvailable = availableChannels.includes(channel)
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => handleChannelToggle(channel)}
                  disabled={!isAvailable}
                  className={cn(
                    "inline-flex min-w-12 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition",
                    isActive && isAvailable
                      ? "border-transparent text-white"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                    !isAvailable && "cursor-not-allowed opacity-40"
                  )}
                  style={isActive && isAvailable ? { backgroundColor: CHANNEL_COLORS[channel] } : undefined}
                >
                  {formatChannel(channel)}
                </button>
              )
            })}
          </div>

          {psdLoading ? (
            <div className="analytics-state-frame-mid w-full animate-pulse rounded-lg bg-muted" />
          ) : psdError ? (
            <div className="analytics-state-frame-mid flex items-center justify-center text-sm text-muted-foreground">
              No se pudo cargar la PSD de EEG.
            </div>
          ) : psdChartData.length === 0 || visiblePsdChannels.length === 0 ? (
            <div className="analytics-state-frame-mid flex items-center justify-center text-sm text-muted-foreground">
              No hay datos suficientes para calcular la PSD.
            </div>
          ) : (
            <AnalyticsChartShell legend={psdChartLegend} xAxisLabel="Frecuencia (Hz)" variant="mid">
            <ResponsiveContainer className="analytics-chart-plot-frame" width="100%" height="100%">
              <LineChart
                data={psdChartData}
                margin={{ top: 12, right: 24, left: 16, bottom: 28 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="frequency"
                  type="number"
                  domain={psdDomain}
                  tickFormatter={(value) => Number(value).toFixed(1)}
                  tickMargin={8}
                />
                <YAxis
                  width={92}
                  label={{
                    value: `PSD (${psdData?.unit ?? "dB"})`,
                    angle: -90,
                    position: "insideLeft",
                    offset: 4,
                    style: { textAnchor: "middle" },
                  }}
                />
                <RechartsTooltip content={<PsdTooltip unit={psdData?.unit ?? "dB"} />} />

                {visiblePsdChannels.map((channel) => (
                  <Line
                    key={`${channel}-psd`}
                    type="linear"
                    dataKey={channel}
                    name={formatChannel(channel)}
                    stroke={CHANNEL_COLORS[channel] ?? "#4B5563"}
                    strokeWidth={1.6}
                    dot={false}
                    activeDot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            </AnalyticsChartShell>
          )}
        </CardContent>
      </Card>
      ) : null}

      {view === "psd" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estadísticas de densidad espectral</CardTitle>
            <CardDescription>
              Resumen de potencia y frecuencia pico para los canales seleccionados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {psdLoading ? (
              <div className="h-52 w-full animate-pulse rounded-lg bg-muted" />
            ) : psdStats.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular estadísticas espectrales.
              </div>
            ) : (
              <PsdStatsTable rows={psdStats} unit={psdData?.unit ?? "dB"} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "spectrogram" ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Waves className="h-5 w-5" />
                Espectrograma de frecuencias
              </CardTitle>
              <CardDescription>
                Variación temporal de potencia por frecuencia para los canales EEG seleccionados.
              </CardDescription>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
                <span className="font-semibold text-foreground">{spectrogramData?.unit ?? "dB centrado"}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventanas</span>
                <span className="font-semibold text-foreground">{(spectrogramData?.time.length ?? 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Frecuencias</span>
                <span className="font-semibold text-foreground">{(spectrogramData?.frequency.length ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <KpiCard
                label="Frecuencia máxima"
                value={spectrogramRepresentativeStats.maxFrequency}
                unit="Hz"
                decimals={2}
                description="Límite visible del espectrograma"
                Icon={Radio}
                loading={spectrogramLoading}
                iconBgClass="bg-violet-100 dark:bg-violet-900/40"
                iconColorClass="text-violet-600 dark:text-violet-400"
                labelColorClass="text-violet-700 dark:text-violet-400"
              />
              <KpiCard
                label="Potencia máxima"
                value={spectrogramRepresentativeStats.maxPower}
                unit={spectrogramData?.unit ?? "dB centrado"}
                decimals={4}
                description="Mayor valor visible"
                Icon={TrendingUp}
                loading={spectrogramLoading}
                onClick={spectrogramPeak ? () => setSelectedTime(spectrogramPeak.peakTime) : undefined}
                active={selectedTime === spectrogramPeak?.peakTime}
                hoverBgClass="hover:bg-rose-50 dark:hover:bg-rose-950/30"
                activeBgClass="bg-rose-50 dark:bg-rose-950/30"
                iconBgClass="bg-rose-100 dark:bg-rose-900/40"
                iconColorClass="text-rose-600 dark:text-rose-400"
                labelColorClass="text-rose-700 dark:text-rose-400"
              />
              <KpiCard
                label="Potencia media"
                value={spectrogramRepresentativeStats.meanPower}
                unit={spectrogramData?.unit ?? "dB centrado"}
                decimals={4}
                description="Promedio de la matriz visible"
                Icon={Activity}
                loading={spectrogramLoading}
                iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
                iconColorClass="text-emerald-600 dark:text-emerald-400"
                labelColorClass="text-emerald-700 dark:text-emerald-400"
              />
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {EEG_CHANNELS.map((channel) => {
                const isActive = selectedChannels.includes(channel)
                const isAvailable = availableChannels.includes(channel)
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => handleChannelToggle(channel)}
                    disabled={!isAvailable}
                    className={cn(
                      "inline-flex min-w-12 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition",
                      isActive && isAvailable
                        ? "border-transparent text-white"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                      !isAvailable && "cursor-not-allowed opacity-40"
                    )}
                    style={isActive && isAvailable ? { backgroundColor: CHANNEL_COLORS[channel] } : undefined}
                  >
                    {formatChannel(channel)}
                  </button>
                )
              })}
            </div>

            {spectrogramLoading ? (
              <div className="h-[520px] w-full animate-pulse rounded-lg bg-muted" />
            ) : spectrogramError ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No se pudo cargar el espectrograma de EEG.
              </div>
            ) : !spectrogramData ||
              spectrogramData.time.length === 0 ||
              spectrogramData.frequency.length === 0 ||
              visibleSpectrogramChannels.length === 0 ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular el espectrograma.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                  <span className="w-24 text-xs text-muted-foreground">
                    {spectrogramData.color_domain.min.toFixed(2)}
                  </span>
                  <div
                    className="h-3 min-w-40 flex-1 rounded-full"
                    style={{ background: VIRIDIS_GRADIENT }}
                  />
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {spectrogramData.color_domain.max.toFixed(2)} {spectrogramData.unit}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {visibleSpectrogramChannels.map((channel) => (
                    <SpectrogramPanel
                      key={`${channel}-spectrogram`}
                      channel={channel}
                      time={spectrogramData.time}
                      frequency={spectrogramData.frequency}
                      matrix={spectrogramData.power[channel] ?? []}
                      colorDomain={spectrogramData.color_domain}
                      unit={spectrogramData.unit}
                      selectedTime={selectedTime}
                      onTimeSelect={setSelectedTime}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "spectrogram" ? (
        <StimulusFixationCard
          projectId={projectId}
          participantCode={participantCode}
          scenario={scenario}
          selectedTime={selectedTime}
          selectedValue={spectrogramSelectedValue}
          selectedValueLabel="POTENCIA"
          selectedValueSub={spectrogramData?.unit ?? "potencia EEG"}
          selectedValueDecimals={4}
          totalDurationS={spectrogramData?.time[spectrogramData.time.length - 1] ?? null}
          description="Ubicación de la mirada del participante durante el instante seleccionado del espectrograma."
          emptyText="Haz clic en un espectrograma o en Potencia máxima para ver la mirada del participante"
          metricDescription="la potencia EEG del espectrograma"
          onClearSelection={() => setSelectedTime(null)}
        />
      ) : null}

      {view === "spectrogram" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estadísticas del espectrograma</CardTitle>
            <CardDescription>
              Resumen de potencia, frecuencia pico y tiempo pico para los canales seleccionados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {spectrogramLoading ? (
              <div className="h-52 w-full animate-pulse rounded-lg bg-muted" />
            ) : spectrogramStats.length === 0 ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular estadísticas del espectrograma.
              </div>
            ) : (
              <SpectrogramStatsTable rows={spectrogramStats} unit={spectrogramData?.unit ?? "dB centrado"} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "topography" ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Brain className="h-5 w-5" />
                Topografía EEG
              </CardTitle>
              <CardDescription>
                Distribución espacial de potencia broadband por ventanas temporales.
              </CardDescription>
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Unidad</span>
                <span className="font-semibold text-foreground">{topographyData?.unit ?? "uV^2"}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventanas</span>
                <span className="font-semibold text-foreground">{(topographyData?.time.length ?? 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-widest text-muted-foreground">Ventana</span>
                <span className="font-semibold text-foreground">{(topographyData?.window_s ?? 0.33).toFixed(2)}s</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <KpiCard
                label="Tiempo"
                value={topographyStats.frameTime}
                unit="s"
                decimals={2}
                description="Centro de la ventana seleccionada"
                Icon={Clock}
                loading={topographyLoading}
                iconBgClass="bg-blue-100 dark:bg-blue-900/40"
                iconColorClass="text-blue-600 dark:text-blue-400"
                labelColorClass="text-blue-700 dark:text-blue-400"
              />
              <KpiCard
                label="Mayor potencia"
                value={topographyStats.strongest?.value ?? null}
                unit={topographyData?.unit ?? "uV^2"}
                decimals={4}
                description={topographyStats.strongest ? formatChannel(topographyStats.strongest.channel) : "Electrodo dominante"}
                Icon={TrendingUp}
                loading={topographyLoading}
                iconBgClass="bg-rose-100 dark:bg-rose-900/40"
                iconColorClass="text-rose-600 dark:text-rose-400"
                labelColorClass="text-rose-700 dark:text-rose-400"
              />
              <KpiCard
                label="Potencia media"
                value={topographyStats.meanPower}
                unit={topographyData?.unit ?? "uV^2"}
                decimals={4}
                description="Promedio entre electrodos visibles"
                Icon={Activity}
                loading={topographyLoading}
                iconBgClass="bg-emerald-100 dark:bg-emerald-900/40"
                iconColorClass="text-emerald-600 dark:text-emerald-400"
                labelColorClass="text-emerald-700 dark:text-emerald-400"
              />
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {TOPOGRAPHY_CHANNELS.map((channel) => {
                const isActive = selectedChannels.includes(channel)
                const isAvailable = availableTopographyChannels.includes(channel)
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() => handleTopographyChannelToggle(channel)}
                    disabled={!isAvailable}
                    className={cn(
                      "inline-flex min-w-12 items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition",
                      isActive && isAvailable
                        ? "border-transparent text-white"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                      !isAvailable && "cursor-not-allowed opacity-40"
                    )}
                    style={isActive && isAvailable ? { backgroundColor: CHANNEL_COLORS[channel] } : undefined}
                  >
                    {formatChannel(channel)}
                  </button>
                )
              })}
            </div>

            {topographyLoading ? (
              <div className="h-[560px] w-full animate-pulse rounded-lg bg-muted" />
            ) : topographyError ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No se pudo cargar la topografía EEG.
              </div>
            ) : !topographyData || topographyData.time.length === 0 || topographyRows.length < 3 ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                No hay datos suficientes para calcular la topografía EEG.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-5">
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                    <span className="w-24 text-xs text-muted-foreground">
                      {topographyData.color_domain.min.toFixed(2)}
                    </span>
                    <div
                      className="h-3 min-w-40 flex-1 rounded-full"
                      style={{ background: VIRIDIS_GRADIENT }}
                    />
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      {topographyData.color_domain.max.toFixed(2)} {topographyData.unit}
                    </span>
                  </div>

                  <TopographyScene
                    rows={topographyRows}
                    colorDomain={topographyData.color_domain}
                    unit={topographyData.unit}
                    projectId={projectId}
                    participantCode={participantCode}
                    selectedTime={topographyStats.frameTime}
                  />

                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-foreground">
                        Ventana {topographyFrameIndex + 1} / {topographyData.time.length}
                      </span>
                      <span className="text-muted-foreground">
                        t≈{topographyStats.frameTime?.toFixed(2) ?? "0.00"}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, topographyData.time.length - 1)}
                      value={topographyFrameIndex}
                      onChange={handleTopographyFrameChange}
                      className="w-full accent-foreground"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">Potencia por electrodo</p>
                    <p className="text-xs text-muted-foreground">
                      Valores de la ventana temporal seleccionada.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 divide-y divide-border/60 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
                    {topographyRows.map((row) => (
                      <div key={row.channel} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: CHANNEL_COLORS[row.channel] ?? "#4B5563" }}
                          />
                          <span className="font-semibold text-foreground">{formatChannel(row.channel)}</span>
                        </div>
                        <span className="font-medium text-foreground">
                          {row.value.toFixed(4)} {topographyData.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-border p-4 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Mínima</p>
                      <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatNumber(topographyStats.minPower, 4, ` ${topographyData.unit}`)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">Máxima</p>
                      <p className="mt-1 font-semibold text-rose-600 dark:text-rose-400">
                        {formatNumber(topographyStats.maxPower, 4, ` ${topographyData.unit}`)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "timeseries" && selectedPoint ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-4 w-4" />
              Punto seleccionado
            </CardTitle>
            <CardDescription>
              Lectura puntual de los canales visibles en el segundo seleccionado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 text-sm text-muted-foreground">
              Tiempo: <span className="font-medium text-foreground">{selectedPoint.time.toFixed(2)}s</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleChannels.map((channel) => {
                const raw = selectedPoint[`${channel}_raw`]
                const smooth = selectedPoint[`${channel}_smooth`]
                return (
                  <div
                    key={channel}
                    className="rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: CHANNEL_COLORS[channel] ?? "#4B5563" }}
                      />
                      <span className="text-sm font-semibold text-foreground">
                        {formatChannel(channel)}
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Suavizada</span>
                        <span className="font-medium">{smooth.toFixed(4)} uV</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Cruda</span>
                        <span className="font-medium">{raw.toFixed(4)} uV</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

    </div>
  )
}
