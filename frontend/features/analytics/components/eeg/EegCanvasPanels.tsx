"use client"

import { useEffect, useRef, useState, type MouseEvent } from "react"
import { cn } from "@/lib/utils"
import { formatChannel, interpolateColor, interpolateTopographyValue, scaleSpectrogramValue, type TopographyFrameRow } from "../../eegPresentation"
import { StimulusPreviewSurface } from "../StimulusFixationCard"
import { CHANNEL_COLORS } from "./eegViewShared"

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

export function SpectrogramPanel({
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

export function TopographyScene({
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
