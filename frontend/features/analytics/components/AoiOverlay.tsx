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
import type { ContainedImageBox } from "./stimulusGeometry"

// The stimulus geometry lives in a JSX-free module so it can be unit tested,
// and is re-exported here because every overlay already reaches for it through
// this file.
export {
  containedImageBoxStyle,
  getContainedImageBox,
  imagePointToContainerPercent,
} from "./stimulusGeometry"
export type { ContainedImageBox } from "./stimulusGeometry"

function normalizedShapePoints(aoi: AoiMetricItem) {
  const points = aoi.shape.points || []
  return points.filter((point) => (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 100 &&
    point.y >= 0 &&
    point.y <= 100
  ))
}

function isPointInPolygon(points: Array<{ x: number; y: number }>, x: number, y: number) {
  let inside = false

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const pi = points[i]
    const pj = points[j]
    const intersects = ((pi.y > y) !== (pj.y > y)) &&
      (x < ((pj.x - pi.x) * (y - pi.y)) / ((pj.y - pi.y) || Number.EPSILON) + pi.x)
    if (intersects) inside = !inside
  }

  return inside
}

function isPointInEllipse(aoi: AoiMetricItem, x: number, y: number) {
  const rx = aoi.shape.width / 2
  const ry = aoi.shape.height / 2
  if (rx <= 0 || ry <= 0) return false

  const cx = aoi.shape.x + rx
  const cy = aoi.shape.y + ry
  return (((x - cx) ** 2) / (rx ** 2)) + (((y - cy) ** 2) / (ry ** 2)) <= 1
}

export function findAoiAtPoint(
  aois: AoiMetricItem[] | undefined,
  xPercent: number | null | undefined,
  yPercent: number | null | undefined
) {
  if (!aois?.length || xPercent == null || yPercent == null) return null
  return aois.find((aoi) => {
    const points = normalizedShapePoints(aoi)
    if (aoi.shape_type === "polygon" && points.length >= 3) {
      return isPointInPolygon(points, xPercent, yPercent)
    }

    if (aoi.shape_type === "circle") {
      return isPointInEllipse(aoi, xPercent, yPercent)
    }

    return (
      xPercent >= aoi.shape.x &&
      xPercent <= aoi.shape.x + aoi.shape.width &&
      yPercent >= aoi.shape.y &&
      yPercent <= aoi.shape.y + aoi.shape.height
    )
  }) ?? null
}

function rectProps(aoi: AoiMetricItem, box: ContainedImageBox) {
  return {
    x: box.offsetX + (aoi.shape.x / 100) * box.renderedW,
    y: box.offsetY + (aoi.shape.y / 100) * box.renderedH,
    width: (aoi.shape.width / 100) * box.renderedW,
    height: (aoi.shape.height / 100) * box.renderedH,
  }
}

function polygonSmoothPath(aoi: AoiMetricItem, box: ContainedImageBox) {
  const points = normalizedShapePoints(aoi).map((point) => ({
    x: box.offsetX + (point.x / 100) * box.renderedW,
    y: box.offsetY + (point.y / 100) * box.renderedH,
  }))

  if (points.length < 3) return ""

  const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  })
  const start = midpoint(points[points.length - 1], points[0])
  const commands = [`M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`]

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const end = midpoint(current, next)
    commands.push(`Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`)
  }

  commands.push("Z")
  return commands.join(" ")
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
        const points = normalizedShapePoints(aoi)
        const isPolygon = aoi.shape_type === "polygon" && points.length >= 3
        const isCircle = aoi.shape_type === "circle"
        return (
          <g key={aoi.id}>
            {isPolygon ? (
              <path
                d={polygonSmoothPath(aoi, box)}
                fill={fill ? aoi.color : "transparent"}
                fillOpacity={fill ? 0.1 : 0}
                stroke={aoi.color}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            ) : isCircle ? (
              <ellipse
                cx={rect.x + rect.width / 2}
                cy={rect.y + rect.height / 2}
                rx={rect.width / 2}
                ry={rect.height / 2}
                fill={fill ? aoi.color : "transparent"}
                fillOpacity={fill ? 0.1 : 0}
                stroke={aoi.color}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <rect
                {...rect}
                fill={fill ? aoi.color : "transparent"}
                fillOpacity={fill ? 0.1 : 0}
                stroke={aoi.color}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            )}
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
