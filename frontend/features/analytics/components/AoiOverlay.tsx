"use client"

import { Eye, Layers, Target } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { cn } from "@/lib/utils"
import type { AoiMetricItem, AoiMetricsData } from "../types"

export type ContainedImageBox = {
  cW: number
  cH: number
  renderedW: number
  renderedH: number
  offsetX: number
  offsetY: number
}

export function getContainedImageBox(
  img: HTMLImageElement | null,
  container: HTMLElement | null
): ContainedImageBox | null {
  if (!img || !container) return null

  const cW = container.clientWidth
  const cH = container.clientHeight
  const iW = img.naturalWidth
  const iH = img.naturalHeight
  if (!cW || !cH || !iW || !iH) return null

  const scale = Math.min(cW / iW, cH / iH)
  const renderedW = iW * scale
  const renderedH = iH * scale
  return {
    cW,
    cH,
    renderedW,
    renderedH,
    offsetX: (cW - renderedW) / 2,
    offsetY: (cH - renderedH) / 2,
  }
}

export function imagePointToContainerPercent(
  box: ContainedImageBox,
  xPercent: number,
  yPercent: number
) {
  return {
    x: ((box.offsetX + (xPercent / 100) * box.renderedW) / box.cW) * 100,
    y: ((box.offsetY + (yPercent / 100) * box.renderedH) / box.cH) * 100,
  }
}

export function findAoiAtPoint(
  aois: AoiMetricItem[] | undefined,
  xPercent: number | null | undefined,
  yPercent: number | null | undefined
) {
  if (!aois?.length || xPercent == null || yPercent == null) return null
  return aois.find((aoi) => (
    xPercent >= aoi.shape.x &&
    xPercent <= aoi.shape.x + aoi.shape.width &&
    yPercent >= aoi.shape.y &&
    yPercent <= aoi.shape.y + aoi.shape.height
  )) ?? null
}

function rectProps(aoi: AoiMetricItem, box: ContainedImageBox) {
  return {
    x: box.offsetX + (aoi.shape.x / 100) * box.renderedW,
    y: box.offsetY + (aoi.shape.y / 100) * box.renderedH,
    width: (aoi.shape.width / 100) * box.renderedW,
    height: (aoi.shape.height / 100) * box.renderedH,
  }
}

export function AoiOverlay({
  aois,
  box,
  showLabels = true,
  fill = true,
  className,
}: {
  aois: AoiMetricItem[]
  box: ContainedImageBox | null
  showLabels?: boolean
  fill?: boolean
  className?: string
}) {
  if (!box || aois.length === 0) return null

  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 z-20", className)}
      width="100%"
      height="100%"
      viewBox={`0 0 ${box.cW} ${box.cH}`}
    >
      {aois.map((aoi) => {
        const rect = rectProps(aoi, box)
        return (
          <g key={aoi.id}>
            <rect
              {...rect}
              fill={fill ? aoi.color : "transparent"}
              fillOpacity={fill ? 0.1 : 0}
              stroke={aoi.color}
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
            {showLabels ? (
              <text
                x={rect.x + 8}
                y={Math.max(rect.y - 8, 16)}
                fill={aoi.color}
                fontSize="13"
                fontWeight="700"
                style={{
                  paintOrder: "stroke",
                  stroke: "white",
                  strokeWidth: 3,
                }}
              >
                {aoi.name}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

export function AoiToggleButton({
  enabled,
  onToggle,
  disabled,
  count,
}: {
  enabled: boolean
  onToggle: () => void
  disabled?: boolean
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        enabled
          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <Layers className="h-3.5 w-3.5" />
      AOIs{typeof count === "number" ? ` (${count})` : ""}
    </button>
  )
}

export function AoiLegend({ aois, className }: { aois: AoiMetricItem[]; className?: string }) {
  if (aois.length === 0) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {aois.map((aoi) => (
        <div key={aoi.id} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: aoi.color }}
          />
          <span className="font-medium text-foreground">{aoi.name}</span>
        </div>
      ))}
    </div>
  )
}

export function AoiContextPanel({
  data,
  loading,
  error,
  title = "Resumen AOI",
  description = "Lectura contextual de las areas delimitadas para el escenario seleccionado.",
}: {
  data: AoiMetricsData | null
  loading?: boolean
  error?: string | null
  title?: string
  description?: string
}) {
  const aois = data?.aois ?? []
  const topAoi = aois.length > 0
    ? aois.reduce((best, item) => (
        item.total_dwell_time_percent > best.total_dwell_time_percent ? item : best
      ))
    : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Target className="mt-1 h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-500 dark:border-red-900/50 dark:bg-red-900/10">
            {error}
          </div>
        ) : !data || aois.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
            No hay AOIs definidas para este escenario.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Eye className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mas observada</p>
                  <p className="text-sm font-semibold text-foreground">{topAoi?.name ?? "-"}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Tiempo AOI</p>
                  <p className="font-semibold text-foreground">
                    {data.observed_aoi_dwell_time_percent.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fijaciones</p>
                  <p className="font-semibold text-foreground">{data.total_fixations}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {aois.map((aoi) => (
                <div key={aoi.id} className="grid grid-cols-[120px_minmax(0,1fr)_64px] items-center gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: aoi.color }}
                    />
                    <span className="truncate font-medium text-foreground">{aoi.name}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, aoi.total_dwell_time_percent))}%`,
                        backgroundColor: aoi.color,
                      }}
                    />
                  </div>
                  <span className="text-right text-xs font-medium text-muted-foreground">
                    {aoi.total_dwell_time_percent.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
