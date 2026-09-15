"use client"

import { Button } from "@/components/ui/button"

import { Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AoiMetricItem } from "../types"
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
    <Button aria-pressed={enabled} size="sm" variant="selection"
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="gap-2"
    >
      <Layers className="h-3.5 w-3.5" />
      AOIs{typeof count === "number" ? ` (${count})` : ""}
    </Button>
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

