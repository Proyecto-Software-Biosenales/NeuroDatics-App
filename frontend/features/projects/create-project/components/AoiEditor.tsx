"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Circle as CircleIcon, Loader2, Palette, PenLine, Square, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ProjectsApi } from "@/features/projects/api/projectsApi"
import type { AOI } from "../types"
import { AOI_COLORS, getAoiBoundsFromPoints, isPolygonAoi, normalizeAoiPoints, normalizeAoiRect } from "../aoiUtils"

type Letterbox = {
  cW: number
  cH: number
  renderedW: number
  renderedH: number
  offsetX: number
  offsetY: number
}

interface AoiEditorProps {
  projectId?: string
  fileId?: string | null
  fallbackUrl?: string | null
  scenarioName: string
  aois: AOI[]
  onAoisChange: (aois: AOI[]) => void
}

const MIN_AOI_PERCENT = 1
const MIN_POLYGON_POINTS = 3
const MAX_POLYGON_POINTS = 34
const DRAFT_POINT_MIN_DISTANCE_PERCENT = 0.85
const POLYGON_SIMPLIFY_TOLERANCE_PERCENT = 0.55
const POLYGON_SMOOTHING_PASSES = 2
type ResizeHandle = "nw" | "ne" | "sw" | "se"
type AoiDrawMode = NonNullable<AOI["shapeType"]>

const AOI_DRAW_MODES = [
  { value: "polygon" as const, label: "Silueta", title: "Dibujar silueta fiel", Icon: PenLine },
  { value: "rect" as const, label: "Rectángulo", title: "Dibujar rectángulo", Icon: Square },
  { value: "circle" as const, label: "Círculo", title: "Dibujar círculo", Icon: CircleIcon },
]

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))
const distanceBetweenPoints = (a: { x: number; y: number }, b: { x: number; y: number }) => (
  Math.hypot(a.x - b.x, a.y - b.y)
)

const perpendicularDistance = (
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
) => {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  if (dx === 0 && dy === 0) return distanceBetweenPoints(point, lineStart)

  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
    Math.sqrt(dx * dx + dy * dy)
}

const simplifyPoints = (points: Array<{ x: number; y: number }>, tolerance: number): Array<{ x: number; y: number }> => {
  if (points.length <= 2) return points

  let maxDistance = 0
  let index = 0
  const lastIndex = points.length - 1

  for (let i = 1; i < lastIndex; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[lastIndex])
    if (distance > maxDistance) {
      index = i
      maxDistance = distance
    }
  }

  if (maxDistance <= tolerance) {
    return [points[0], points[lastIndex]]
  }

  const left = simplifyPoints(points.slice(0, index + 1), tolerance)
  const right = simplifyPoints(points.slice(index), tolerance)
  return [...left.slice(0, -1), ...right]
}

const filterClosePoints = (points: Array<{ x: number; y: number }>, minDistance: number) => {
  const filtered: Array<{ x: number; y: number }> = []

  for (const point of points) {
    const previous = filtered[filtered.length - 1]
    if (!previous || distanceBetweenPoints(previous, point) >= minDistance) {
      filtered.push(point)
    }
  }

  if (filtered.length > 2 && distanceBetweenPoints(filtered[0], filtered[filtered.length - 1]) < minDistance) {
    filtered.pop()
  }

  return filtered
}

const smoothClosedPoints = (points: Array<{ x: number; y: number }>, passes = 1) => {
  if (points.length < MIN_POLYGON_POINTS) return points

  let next = points
  for (let pass = 0; pass < passes; pass += 1) {
    next = next.map((point, index) => {
      const previous = next[(index - 1 + next.length) % next.length]
      const following = next[(index + 1) % next.length]
      return {
        x: previous.x * 0.2 + point.x * 0.6 + following.x * 0.2,
        y: previous.y * 0.2 + point.y * 0.6 + following.y * 0.2,
      }
    })
  }

  return next
}

const simplifyClosedPoints = (points: Array<{ x: number; y: number }>, tolerance: number) => {
  if (points.length <= MIN_POLYGON_POINTS) return points

  let splitIndex = 1
  let maxDistance = 0
  for (let index = 1; index < points.length; index += 1) {
    const distance = distanceBetweenPoints(points[0], points[index])
    if (distance > maxDistance) {
      splitIndex = index
      maxDistance = distance
    }
  }

  const firstArc = simplifyPoints(points.slice(0, splitIndex + 1), tolerance)
  const secondArc = simplifyPoints([...points.slice(splitIndex), points[0]], tolerance)
  return normalizeAoiPoints([...firstArc.slice(0, -1), ...secondArc.slice(0, -1)])
}

const simplifyAoiPoints = (points: Array<{ x: number; y: number }>) => {
  const normalized = filterClosePoints(
    normalizeAoiPoints(points),
    DRAFT_POINT_MIN_DISTANCE_PERCENT
  )
  if (normalized.length <= MIN_POLYGON_POINTS) return normalized

  const smoothed = normalizeAoiPoints(smoothClosedPoints(normalized, POLYGON_SMOOTHING_PASSES))
  let tolerance = POLYGON_SIMPLIFY_TOLERANCE_PERCENT
  let simplified = simplifyClosedPoints(smoothed, tolerance)

  while (simplified.length > MAX_POLYGON_POINTS && tolerance < 3.5) {
    tolerance += 0.2
    simplified = simplifyClosedPoints(smoothed, tolerance)
  }

  return simplified
}

const resizeAoiFromHandle = (initial: AOI, handle: ResizeHandle, current: { x: number; y: number }) => {
  let left = initial.x
  let top = initial.y
  let right = initial.x + initial.width
  let bottom = initial.y + initial.height

  if (handle.includes("w")) left = current.x
  if (handle.includes("e")) right = current.x
  if (handle.includes("n")) top = current.y
  if (handle.includes("s")) bottom = current.y

  const x = clampPercent(Math.min(left, right))
  const y = clampPercent(Math.min(top, bottom))
  const width = Math.max(MIN_AOI_PERCENT, Math.abs(right - left))
  const height = Math.max(MIN_AOI_PERCENT, Math.abs(bottom - top))

  return normalizeAoiRect({
    ...initial,
    x,
    y,
    width,
    height,
  })
}

const geometricBoundsFromDrag = (
  start: { x: number; y: number },
  current: { x: number; y: number },
  shapeType: AoiDrawMode,
  letterbox: Letterbox
) => {
  if (shapeType === "circle") {
    const startXpx = (start.x / 100) * letterbox.renderedW
    const startYpx = (start.y / 100) * letterbox.renderedH
    const dxPx = ((current.x - start.x) / 100) * letterbox.renderedW
    const dyPx = ((current.y - start.y) / 100) * letterbox.renderedH
    const signX = dxPx >= 0 ? 1 : -1
    const signY = dyPx >= 0 ? 1 : -1
    const maxSideX = signX > 0 ? letterbox.renderedW - startXpx : startXpx
    const maxSideY = signY > 0 ? letterbox.renderedH - startYpx : startYpx
    const sidePx = Math.max(0, Math.min(Math.max(Math.abs(dxPx), Math.abs(dyPx)), maxSideX, maxSideY))
    const endX = ((startXpx + signX * sidePx) / letterbox.renderedW) * 100
    const endY = ((startYpx + signY * sidePx) / letterbox.renderedH) * 100

    return {
      x: clampPercent(Math.min(start.x, endX)),
      y: clampPercent(Math.min(start.y, endY)),
      width: Math.abs(endX - start.x),
      height: Math.abs(endY - start.y),
    }
  }

  return {
    x: clampPercent(Math.min(start.x, current.x)),
    y: clampPercent(Math.min(start.y, current.y)),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  }
}

export function AoiEditor({
  projectId,
  fileId,
  fallbackUrl,
  scenarioName,
  aois,
  onAoisChange,
}: AoiEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const interactionRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoadingImage, setIsLoadingImage] = useState(Boolean((projectId && fileId) || fallbackUrl))
  const [loadError, setLoadError] = useState(false)
  const [letterbox, setLetterbox] = useState<Letterbox | null>(null)
  const [draftRect, setDraftRect] = useState<AOI | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [selectedAoiId, setSelectedAoiId] = useState<string | null>(null)
  const [activeAoiColor, setActiveAoiColor] = useState(AOI_COLORS[0])
  const [drawMode, setDrawMode] = useState<AoiDrawMode>("polygon")
  const [resizeState, setResizeState] = useState<{
    aoiId: string
    handle: ResizeHandle
    initial: AOI
  } | null>(null)
  const [vertexDragState, setVertexDragState] = useState<{
    aoiId: string
    pointIndex: number
  } | null>(null)

  const normalizedAois = useMemo(() => aois.map(normalizeAoiRect), [aois])

  const computeLetterbox = useCallback(() => {
    const img = imageRef.current
    const container = containerRef.current
    if (!img || !container) {
      setLetterbox(null)
      return
    }

    const cW = container.clientWidth
    const cH = container.clientHeight
    const iW = img.naturalWidth
    const iH = img.naturalHeight

    if (!cW || !cH || !iW || !iH) {
      setLetterbox(null)
      return
    }

    const scale = Math.min(cW / iW, cH / iH)
    const renderedW = iW * scale
    const renderedH = iH * scale

    setLetterbox({
      cW,
      cH,
      renderedW,
      renderedH,
      offsetX: (cW - renderedW) / 2,
      offsetY: (cH - renderedH) / 2,
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    const load = async () => {
      setImageUrl(null)
      setLoadError(false)
      setIsLoadingImage(Boolean((projectId && fileId) || fallbackUrl))

      if (!projectId || !fileId) {
        setImageUrl(fallbackUrl ?? null)
        setIsLoadingImage(false)
        return
      }

      try {
        const blob = await ProjectsApi.fetchScenarioImage(projectId, fileId)
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
      } catch {
        if (!cancelled) {
          setImageUrl(fallbackUrl ?? null)
          setLoadError(!fallbackUrl)
          setIsLoadingImage(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [projectId, fileId, fallbackUrl])

  useEffect(() => {
    const frame = requestAnimationFrame(() => computeLetterbox())
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame)
    }

    const observer = new ResizeObserver(() => computeLetterbox())
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [computeLetterbox, imageUrl])

  const pointToPercent = useCallback((clientX: number, clientY: number) => {
    if (!letterbox || !containerRef.current) return null

    const rect = containerRef.current.getBoundingClientRect()
    const rawX = clientX - rect.left
    const rawY = clientY - rect.top
    const x = Math.max(letterbox.offsetX, Math.min(letterbox.offsetX + letterbox.renderedW, rawX))
    const y = Math.max(letterbox.offsetY, Math.min(letterbox.offsetY + letterbox.renderedH, rawY))

    return {
      x: ((x - letterbox.offsetX) / letterbox.renderedW) * 100,
      y: ((y - letterbox.offsetY) / letterbox.renderedH) * 100,
    }
  }, [letterbox])

  const aoiToSvgBounds = (aoi: AOI) => {
    if (!letterbox) return null
    const points = normalizeAoiPoints(aoi.points)
    const bounds = aoi.shapeType === "polygon" && points.length > 0
      ? getAoiBoundsFromPoints(points)
      : normalizeAoiRect(aoi)

    return {
      x: letterbox.offsetX + (bounds.x / 100) * letterbox.renderedW,
      y: letterbox.offsetY + (bounds.y / 100) * letterbox.renderedH,
      width: (bounds.width / 100) * letterbox.renderedW,
      height: (bounds.height / 100) * letterbox.renderedH,
    }
  }

  const pointsToSvgPoints = (points: Array<{ x: number; y: number }> | undefined) => {
    if (!letterbox) return ""
    return normalizeAoiPoints(points)
      .map((point) => (
        `${letterbox.offsetX + (point.x / 100) * letterbox.renderedW},${letterbox.offsetY + (point.y / 100) * letterbox.renderedH}`
      ))
      .join(" ")
  }

  const pointsToSmoothPath = (points: Array<{ x: number; y: number }> | undefined) => {
    if (!letterbox) return ""
    const svgPoints = normalizeAoiPoints(points)
      .map((point) => ({
        x: letterbox.offsetX + (point.x / 100) * letterbox.renderedW,
        y: letterbox.offsetY + (point.y / 100) * letterbox.renderedH,
      }))

    if (svgPoints.length < MIN_POLYGON_POINTS) return ""

    const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    })
    const start = midpoint(svgPoints[svgPoints.length - 1], svgPoints[0])
    const commands = [`M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`]

    for (let index = 0; index < svgPoints.length; index += 1) {
      const current = svgPoints[index]
      const next = svgPoints[(index + 1) % svgPoints.length]
      const end = midpoint(current, next)
      commands.push(`Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`)
    }

    commands.push("Z")
    return commands.join(" ")
  }

  const pointToSvgPoint = (point: { x: number; y: number }) => {
    if (!letterbox) return null
    return {
      x: letterbox.offsetX + (point.x / 100) * letterbox.renderedW,
      y: letterbox.offsetY + (point.y / 100) * letterbox.renderedH,
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!letterbox || !imageUrl || isLoadingImage) return

    const start = pointToPercent(event.clientX, event.clientY)
    if (!start) return

    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedAoiId(null)
    setDragStart(start)
    const isPolygonMode = drawMode === "polygon"
    setDraftRect({
      id: "draft",
      name: "",
      color: activeAoiColor,
      shapeType: drawMode,
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
      points: isPolygonMode ? [start] : undefined,
    })
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (vertexDragState) {
      const current = pointToPercent(event.clientX, event.clientY)
      if (!current) return
      const target = normalizedAois.find((aoi) => aoi.id === vertexDragState.aoiId)
      if (!target || !isPolygonAoi(target)) return

      const nextPoints = [...(target.points || [])]
      nextPoints[vertexDragState.pointIndex] = current
      updateAoi(vertexDragState.aoiId, {
        shapeType: "polygon",
        points: normalizeAoiPoints(nextPoints),
      })
      return
    }

    if (resizeState) {
      const current = pointToPercent(event.clientX, event.clientY)
      if (!current) return
      updateAoi(resizeState.aoiId, resizeAoiFromHandle(resizeState.initial, resizeState.handle, current))
      return
    }

    if (!dragStart || !draftRect) return
    const current = pointToPercent(event.clientX, event.clientY)
    if (!current || !letterbox) return

    if (draftRect.shapeType === "polygon") {
      const points = draftRect.points || []
      const lastPoint = points[points.length - 1]
      if (lastPoint && distanceBetweenPoints(lastPoint, current) < DRAFT_POINT_MIN_DISTANCE_PERCENT) return

      const nextPoints = [...points, current]
      const bounds = getAoiBoundsFromPoints(nextPoints)
      setDraftRect({
        ...draftRect,
        ...bounds,
        points: nextPoints,
      })
      return
    }

    setDraftRect({
      ...draftRect,
      ...geometricBoundsFromDrag(dragStart, current, draftRect.shapeType || "rect", letterbox),
      points: undefined,
    })
  }

  const finishDraft = () => {
    if (vertexDragState) {
      setVertexDragState(null)
      return
    }

    if (resizeState) {
      setResizeState(null)
      return
    }

    if (!draftRect) {
      setDragStart(null)
      return
    }

    const normalized = draftRect.shapeType === "polygon"
      ? (() => {
          const points = simplifyAoiPoints(draftRect.points || [])
          if (points.length < MIN_POLYGON_POINTS) return null
          return normalizeAoiRect({
            ...draftRect,
            shapeType: "polygon",
            points,
            ...getAoiBoundsFromPoints(points),
          })
        })()
      : normalizeAoiRect({
          ...draftRect,
          shapeType: draftRect.shapeType === "circle" ? "circle" : "rect",
          points: undefined,
        })

    if (normalized && normalized.width >= MIN_AOI_PERCENT && normalized.height >= MIN_AOI_PERCENT) {
      const nextAoi: AOI = {
        ...normalized,
        id: `aoi-${Date.now()}-${normalizedAois.length}`,
        name: `AOI ${normalizedAois.length + 1}`,
      }
      if (nextAoi.shapeType !== "polygon" || isPolygonAoi(nextAoi)) {
        onAoisChange([...normalizedAois, nextAoi])
        setSelectedAoiId(nextAoi.id)
      }
    }

    setDraftRect(null)
    setDragStart(null)
  }

  const updateAoi = (aoiId: string, patch: Partial<AOI>) => {
    if (patch.color) {
      setActiveAoiColor(patch.color)
    }

    onAoisChange(
      normalizedAois.map((aoi) => (
        aoi.id === aoiId ? normalizeAoiRect({ ...aoi, ...patch }) : aoi
      ))
    )
  }

  const removeAoi = (aoiId: string) => {
    onAoisChange(normalizedAois.filter((aoi) => aoi.id !== aoiId))
    if (selectedAoiId === aoiId) setSelectedAoiId(null)
  }

  const renderedAois = draftRect ? [...normalizedAois, draftRect] : normalizedAois
  const selectedAoi = normalizedAois.find((aoi) => aoi.id === selectedAoiId) ?? null

  const startResize = (
    event: React.PointerEvent<SVGRectElement>,
    aoi: AOI,
    handle: ResizeHandle
  ) => {
    event.stopPropagation()
    if (!letterbox || !imageUrl || isLoadingImage) return
    interactionRef.current?.setPointerCapture(event.pointerId)
    setSelectedAoiId(aoi.id)
    setResizeState({
      aoiId: aoi.id,
      handle,
      initial: normalizeAoiRect(aoi),
    })
    setDraftRect(null)
    setDragStart(null)
  }

  const startVertexDrag = (
    event: React.PointerEvent<SVGCircleElement>,
    aoi: AOI,
    pointIndex: number
  ) => {
    event.stopPropagation()
    if (!letterbox || !imageUrl || isLoadingImage || !isPolygonAoi(aoi)) return
    interactionRef.current?.setPointerCapture(event.pointerId)
    setSelectedAoiId(aoi.id)
    setVertexDragState({
      aoiId: aoi.id,
      pointIndex,
    })
    setResizeState(null)
    setDraftRect(null)
    setDragStart(null)
  }

  const handlePoints = (props: { x: number; y: number; width: number; height: number }) => [
    { key: "nw" as const, x: props.x, y: props.y, cursor: "nwse-resize" },
    { key: "ne" as const, x: props.x + props.width, y: props.y, cursor: "nesw-resize" },
    { key: "sw" as const, x: props.x, y: props.y + props.height, cursor: "nesw-resize" },
    { key: "se" as const, x: props.x + props.width, y: props.y + props.height, cursor: "nwse-resize" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Nueva AOI</span>
          <span
            className="h-5 w-5 rounded border border-border"
            style={{ backgroundColor: activeAoiColor }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
            {AOI_DRAW_MODES.map((mode) => {
              const ModeIcon = mode.Icon
              return (
                <button
                  key={mode.value}
                  type="button"
                  title={mode.title}
                  aria-label={mode.title}
                  onClick={() => setDrawMode(mode.value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-semibold transition-colors",
                    drawMode === mode.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <ModeIcon className="h-4 w-4" />
                  <span>{mode.label}</span>
                </button>
              )
            })}
          </div>

          {AOI_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Usar color ${color}`}
              title={`Usar color ${color}`}
              onClick={() => setActiveAoiColor(color)}
              className={cn(
                "h-6 w-6 rounded border",
                activeAoiColor === color ? "border-foreground ring-2 ring-foreground/20" : "border-border"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <label
            className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground"
            title="Elegir color personalizado"
            aria-label="Elegir color personalizado"
          >
            <Palette className="h-4 w-4" />
            <input
              type="color"
              value={activeAoiColor}
              onChange={(event) => setActiveAoiColor(event.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted"
      >
        {isLoadingImage && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/80 text-muted-foreground">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando imagen...
            </div>
          </div>
        )}

        {loadError || !imageUrl ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No se pudo cargar la imagen del escenario.
          </div>
        ) : (
          <>
            <img
              ref={imageRef}
              src={imageUrl}
              alt={scenarioName}
              className="h-full w-full object-contain"
              draggable={false}
              onLoad={() => {
                setIsLoadingImage(false)
                computeLetterbox()
              }}
              onError={() => {
                setLoadError(true)
                setIsLoadingImage(false)
              }}
            />

            <div
              ref={interactionRef}
              className="absolute inset-0 cursor-crosshair touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDraft}
              onPointerCancel={finishDraft}
              onPointerLeave={() => {
                if (dragStart) finishDraft()
              }}
            >
              {letterbox && (
                <svg
                  className="absolute inset-0"
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${letterbox.cW} ${letterbox.cH}`}
                >
                  {renderedAois.map((aoi) => {
                    const props = aoiToSvgBounds(aoi)
                    if (!props) return null
                    const isDraft = aoi.id === "draft"
                    const isSelected = selectedAoiId === aoi.id
                    const polygonPoints = normalizeAoiPoints(aoi.points)
                    const polygonSvgPoints = pointsToSvgPoints(polygonPoints)
                    const smoothPath = pointsToSmoothPath(polygonPoints)
                    const isPolygon = aoi.shapeType === "polygon" && polygonPoints.length > 0
                    const isCircle = aoi.shapeType === "circle"
                    return (
                      <g key={aoi.id}>
                        {isPolygon ? (
                          polygonPoints.length === 1 ? (
                            (() => {
                              const point = pointToSvgPoint(polygonPoints[0])
                              if (!point) return null
                              return (
                                <circle
                                  cx={point.x}
                                  cy={point.y}
                                  r={4}
                                  fill={aoi.color}
                                  pointerEvents="none"
                                />
                              )
                            })()
                          ) : isDraft ? (
                            <polyline
                              points={polygonSvgPoints}
                              fill="none"
                              stroke={aoi.color}
                              strokeWidth={2.5}
                              strokeDasharray="6 5"
                              vectorEffect="non-scaling-stroke"
                              pointerEvents="none"
                            />
                          ) : (
                            <path
                              d={smoothPath}
                              fill={isSelected ? `${aoi.color}24` : `${aoi.color}12`}
                              stroke={aoi.color}
                              strokeWidth={isSelected ? 2.5 : 3}
                              vectorEffect="non-scaling-stroke"
                              pointerEvents="auto"
                              className="cursor-pointer"
                              onPointerDown={(event) => {
                                event.stopPropagation()
                                setSelectedAoiId(aoi.id)
                              }}
                            />
                          )
                        ) : isCircle ? (
                          <ellipse
                            cx={props.x + props.width / 2}
                            cy={props.y + props.height / 2}
                            rx={props.width / 2}
                            ry={props.height / 2}
                            fill={isDraft || isSelected ? `${aoi.color}22` : "transparent"}
                            stroke={aoi.color}
                            strokeWidth={isDraft || isSelected ? 2.5 : 3}
                            strokeDasharray={isDraft ? "6 5" : undefined}
                            vectorEffect="non-scaling-stroke"
                            pointerEvents={isDraft ? "none" : "auto"}
                            className={isDraft ? undefined : "cursor-pointer"}
                            onPointerDown={(event) => {
                              if (isDraft) return
                              event.stopPropagation()
                              setSelectedAoiId(aoi.id)
                            }}
                          />
                        ) : (
                          <rect
                            {...props}
                            fill={isDraft || isSelected ? `${aoi.color}22` : "transparent"}
                            stroke={aoi.color}
                            strokeWidth={isDraft || isSelected ? 2.5 : 3}
                            strokeDasharray={isDraft ? "6 5" : undefined}
                            vectorEffect="non-scaling-stroke"
                            pointerEvents={isDraft ? "none" : "auto"}
                            className={isDraft ? undefined : "cursor-pointer"}
                            onPointerDown={(event) => {
                              if (isDraft) return
                              event.stopPropagation()
                              setSelectedAoiId(aoi.id)
                            }}
                          />
                        )}
                        {!isDraft && (
                          <text
                            x={props.x + 8}
                            y={Math.max(props.y - 8, 16)}
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
                        )}
                        {!isDraft && isSelected && isPolygon && (
                          <>
                            {polygonPoints.map((point, pointIndex) => {
                              const svgPoint = pointToSvgPoint(point)
                              if (!svgPoint) return null
                              return (
                                <circle
                                  key={`${aoi.id}-${pointIndex}`}
                                  cx={svgPoint.x}
                                  cy={svgPoint.y}
                                  r={5}
                                  fill="white"
                                  stroke={aoi.color}
                                  strokeWidth={2}
                                  vectorEffect="non-scaling-stroke"
                                  pointerEvents="auto"
                                  className="cursor-move"
                                  onPointerDown={(event) => startVertexDrag(event, aoi, pointIndex)}
                                />
                              )
                            })}
                          </>
                        )}
                        {!isDraft && isSelected && !isPolygon && (
                          <>
                            {handlePoints(props).map((handle) => (
                              <rect
                                key={handle.key}
                                x={handle.x - 5}
                                y={handle.y - 5}
                                width={10}
                                height={10}
                                rx={2}
                                fill="white"
                                stroke={aoi.color}
                                strokeWidth={2}
                                vectorEffect="non-scaling-stroke"
                                pointerEvents="auto"
                                style={{ cursor: handle.cursor }}
                                onPointerDown={(event) => startResize(event, aoi, handle.key)}
                              />
                            ))}
                          </>
                        )}
                      </g>
                    )
                  })}
                </svg>
              )}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            AOIs creadas ({normalizedAois.length})
          </h4>
          {selectedAoi ? (
            <span className="text-xs text-muted-foreground">
              {isPolygonAoi(selectedAoi) ? "Arrastra los puntos de " : "Arrastra las esquinas de "}
              <span className="font-semibold">{selectedAoi.name}</span> para ajustar su tamaño.
            </span>
          ) : null}
        </div>

        {normalizedAois.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay AOIs registradas para este estimulo.</p>
        ) : (
          <div className="space-y-2">
            {normalizedAois.map((aoi, index) => (
              <div
                key={aoi.id}
                onClick={() => setSelectedAoiId(aoi.id)}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center",
                  selectedAoiId === aoi.id ? "border-foreground/40 ring-2 ring-foreground/10" : "border-border"
                )}
              >
                <div className="flex items-center gap-2">
                  {AOI_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Color ${color}`}
                      title={`Color ${color}`}
                      onClick={() => updateAoi(aoi.id, { color })}
                      className={cn(
                        "h-5 w-5 rounded border",
                        aoi.color === color ? "border-foreground ring-2 ring-foreground/20" : "border-border"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <label
                    className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-border bg-background text-muted-foreground hover:text-foreground"
                    title="Elegir color personalizado"
                    aria-label="Elegir color personalizado"
                  >
                    <Palette className="h-4 w-4" />
                    <input
                      type="color"
                      value={aoi.color}
                      onChange={(event) => updateAoi(aoi.id, { color: event.target.value })}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                </div>

                <Input
                  value={aoi.name}
                  onChange={(event) => updateAoi(aoi.id, { name: event.target.value })}
                  placeholder={`AOI ${index + 1}`}
                  className="h-8 min-w-0 flex-1 bg-background"
                />

                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {aoi.shapeType === "polygon" ? "Silueta" : aoi.shapeType === "circle" ? "Círculo" : "Rectángulo"} ·{" "}
                  {aoi.x.toFixed(1)}%, {aoi.y.toFixed(1)}% - {aoi.width.toFixed(1)}% x {aoi.height.toFixed(1)}%
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeAoi(aoi.id)}
                  aria-label={`Eliminar ${aoi.name}`}
                  title={`Eliminar ${aoi.name}`}
                  className="self-end text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:self-auto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
