"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  CircleOff,
  Crosshair,
  ImageOff,
  LoaderCircle,
  MousePointerClick,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AoiOverlay,
  findAoiAtPoint,
  getContainedImageBox,
  imagePointToContainerPercent,
  type ContainedImageBox,
} from "../components/AoiOverlay"
import type {
  AoiMetricsData,
  FixationData,
  GazeAtData,
  ScanpathData,
} from "../types"

interface ImageState {
  url: string | null
  loading: boolean
  error: string | null
}

function MessageSurface({
  Icon = ImageOff,
  children,
}: {
  Icon?: typeof ImageOff
  children: ReactNode
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
      <Icon className="h-8 w-8 text-muted-foreground/40" />
      {children}
    </div>
  )
}

function StimulusSurface({
  image,
  alt,
  renderOverlay,
}: {
  image: ImageState
  alt: string
  renderOverlay?: (box: ContainedImageBox | null) => ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [box, setBox] = useState<ContainedImageBox | null>(null)

  const measure = useCallback(() => {
    setBox(getContainedImageBox(imageRef.current, containerRef.current))
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [measure, image.url])

  if (image.loading) {
    return (
      <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted" />
    )
  }
  if (image.error) return <MessageSurface>{image.error}</MessageSurface>
  if (!image.url)
    return (
      <MessageSurface>
        No se encontró una imagen para el escenario seleccionado.
      </MessageSurface>
    )

  return (
    <div
      ref={containerRef}
      className="relative min-h-64 overflow-hidden rounded-xl bg-muted/30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={image.url}
        alt={alt}
        className="max-h-[560px] min-h-64 w-full object-contain"
        onLoad={measure}
      />
      {renderOverlay?.(box)}
    </div>
  )
}

export function ScenarioRequiredMessage({ label }: { label: string }) {
  return (
    <MessageSurface Icon={MousePointerClick}>
      Selecciona un escenario específico para visualizar {label.toLowerCase()}.
    </MessageSurface>
  )
}

export function PointOnStimulusPanel({
  pinnedTime,
  gaze,
  gazeLoading,
  preview,
  aoi,
  onClear,
}: {
  pinnedTime: number | null
  gaze: GazeAtData | null
  gazeLoading: boolean
  preview: ImageState
  aoi: AoiMetricsData | null
  onClear: () => void
}) {
  if (pinnedTime == null) {
    return (
      <MessageSurface Icon={Crosshair}>
        Haz clic en una gráfica temporal de Eye Tracker para fijar un instante y
        ubicar la mirada.
      </MessageSurface>
    )
  }

  const currentAoi = gaze ? findAoiAtPoint(aoi?.aois, gaze.gx, gaze.gy) : null
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Punto sobre estímulo</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ubicación de la mirada en el instante seleccionado.
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Cerrar visualización del estímulo"
          onClick={onClear}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {gazeLoading ? (
        <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted" />
      ) : !gaze ? (
        <MessageSurface Icon={CircleOff}>
          No se encontró una muestra de mirada para este instante.
        </MessageSurface>
      ) : (
        <>
          <StimulusSurface
            image={preview}
            alt={`Estímulo en ${pinnedTime.toFixed(2)} segundos`}
            renderOverlay={(box) => {
              const point =
                box && gaze.gx != null && gaze.gy != null
                  ? imagePointToContainerPercent(box, gaze.gx, gaze.gy)
                  : null
              return (
                <>
                  <AoiOverlay aois={aoi?.aois ?? []} box={box} />
                  {point ? (
                    <span
                      className="pointer-events-none absolute z-30 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-rose-500 shadow-lg ring-2 ring-rose-500/40"
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                </>
              )
            }}
          />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
            <span>
              <strong className="font-semibold">Tiempo:</strong>{" "}
              {pinnedTime.toFixed(2)} s
            </span>
            <span>
              <strong className="font-semibold">X:</strong>{" "}
              {gaze.gx?.toFixed(1) ?? "—"}%
            </span>
            <span>
              <strong className="font-semibold">Y:</strong>{" "}
              {gaze.gy?.toFixed(1) ?? "—"}%
            </span>
            <span>
              <strong className="font-semibold">AOI:</strong>{" "}
              {currentAoi?.name ?? "Fuera de AOI"}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

export function HeatmapPanel({
  fixation,
  loading,
  error,
  image,
  overlayUrl,
  aoi,
}: {
  fixation: FixationData | null
  loading: boolean
  error: string | null
  image: ImageState
  overlayUrl: string | null
  aoi: AoiMetricsData | null
}) {
  if (loading)
    return (
      <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted" />
    )
  if (error) return <MessageSurface>{error}</MessageSurface>
  if (!fixation?.fixations.length)
    return (
      <MessageSurface>No hay fijaciones para este escenario.</MessageSurface>
    )

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniMetric
          label="Fijaciones"
          value={String(fixation.stats.n_fixations)}
        />
        <MiniMetric
          label="Duración media"
          value={`${(fixation.stats.avg_duration_s * 1000).toFixed(0)} ms`}
        />
        <MiniMetric
          label="Máxima"
          value={`${(fixation.stats.max_duration_s * 1000).toFixed(0)} ms`}
        />
      </div>
      <StimulusSurface
        image={image}
        alt="Mapa de calor del escenario"
        renderOverlay={(box) => (
          <>
            {overlayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={overlayUrl}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain opacity-80"
              />
            ) : null}
            <AoiOverlay aois={aoi?.aois ?? []} box={box} />
          </>
        )}
      />
    </div>
  )
}

function scanpathPoint(box: ContainedImageBox, x: number, y: number) {
  return {
    x: box.offsetX + x * box.renderedW,
    y: box.offsetY + y * box.renderedH,
  }
}

export function ScanpathPanel({
  data,
  loading,
  error,
  image,
  aoi,
}: {
  data: ScanpathData | null
  loading: boolean
  error: string | null
  image: ImageState
  aoi: AoiMetricsData | null
}) {
  if (loading)
    return (
      <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted" />
    )
  if (error) return <MessageSurface>{error}</MessageSurface>
  if (!data?.objectives.length)
    return (
      <MessageSurface>No hay recorridos para este escenario.</MessageSurface>
    )

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniMetric label="Objetivos" value={String(data.n_objectives)} />
        <MiniMetric
          label="Distancia"
          value={`${data.total_distance_px.toFixed(0)} px`}
        />
        <MiniMetric
          label="Duración media"
          value={`${(data.avg_duration_s * 1000).toFixed(0)} ms`}
        />
      </div>
      <StimulusSurface
        image={image}
        alt="Mapa de recorridos del escenario"
        renderOverlay={(box) => {
          if (!box) return null
          const points = data.objectives.map((objective) =>
            scanpathPoint(box, objective.cx, objective.cy)
          )
          return (
            <>
              <AoiOverlay aois={aoi?.aois ?? []} box={box} fill={false} />
              <svg
                className="pointer-events-none absolute inset-0 z-30 h-full w-full"
                viewBox={`0 0 ${box.cW} ${box.cH}`}
              >
                {points.slice(1).map((point, index) => (
                  <line
                    key={`${index}-${point.x}`}
                    x1={points[index].x}
                    y1={points[index].y}
                    x2={point.x}
                    y2={point.y}
                    stroke="#F43F5E"
                    strokeWidth="2"
                    strokeOpacity="0.72"
                  />
                ))}
                {data.objectives.map((objective, index) => {
                  const point = points[index]
                  const radius = Math.max(
                    10,
                    Math.min(
                      28,
                      objective.radius_norm *
                        Math.min(box.renderedW, box.renderedH)
                    )
                  )
                  return (
                    <g key={objective.id}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={radius}
                        fill="#F43F5E"
                        fillOpacity="0.72"
                        stroke="white"
                        strokeWidth="2"
                      />
                      <text
                        x={point.x}
                        y={point.y + 4}
                        textAnchor="middle"
                        fill="white"
                        fontSize="11"
                        fontWeight="700"
                      >
                        {index + 1}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </>
          )
        }}
      />
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function AoiPanel({
  data,
  loading,
  error,
  image,
}: {
  data: AoiMetricsData | null
  loading: boolean
  error: string | null
  image: ImageState
}) {
  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Cargando AOIs…
      </div>
    )
  }
  if (error) return <MessageSurface>{error}</MessageSurface>
  if (!data?.aois.length)
    return (
      <MessageSurface>
        No hay áreas de interés configuradas para este escenario.
      </MessageSurface>
    )

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <StimulusSurface
        image={image}
        alt="Áreas de interés del escenario"
        renderOverlay={(box) => <AoiOverlay aois={data.aois} box={box} />}
      />
      <div
        role="img"
        aria-label={`Comparación de permanencia para ${data.aois.length} AOIs.`}
      >
        <ResponsiveContainer width="100%" height={350}>
          <BarChart
            data={data.aois}
            margin={{ top: 12, right: 16, left: 0, bottom: 42 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              angle={-20}
              textAnchor="end"
              height={58}
              tick={{ fontSize: 11 }}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip
              formatter={(value) => [
                `${Number(value).toFixed(1)}%`,
                "Permanencia",
              ]}
            />
            <Bar
              dataKey="total_dwell_time_percent"
              name="Permanencia"
              radius={[5, 5, 0, 0]}
            >
              {data.aois.map((item) => (
                <Cell key={item.id} fill={item.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
