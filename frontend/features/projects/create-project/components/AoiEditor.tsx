"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Palette, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ProjectsApi } from "@/features/projects/api/projectsApi"
import type { AOI } from "../types"
import { AOI_COLORS, normalizeAoiRect } from "../aoiUtils"

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
type ResizeHandle = "nw" | "ne" | "sw" | "se"

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

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
  const [resizeState, setResizeState] = useState<{
    aoiId: string
    handle: ResizeHandle
    initial: AOI
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

  const rectToSvgProps = (aoi: AOI) => {
    if (!letterbox) return null
    const normalized = normalizeAoiRect(aoi)
    return {
      x: letterbox.offsetX + (normalized.x / 100) * letterbox.renderedW,
      y: letterbox.offsetY + (normalized.y / 100) * letterbox.renderedH,
      width: (normalized.width / 100) * letterbox.renderedW,
      height: (normalized.height / 100) * letterbox.renderedH,
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!letterbox || !imageUrl || isLoadingImage) return

    const start = pointToPercent(event.clientX, event.clientY)
    if (!start) return

    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedAoiId(null)
    setDragStart(start)
    setDraftRect({
      id: "draft",
      name: "",
      color: AOI_COLORS[normalizedAois.length % AOI_COLORS.length],
      shapeType: "rect",
      x: start.x,
      y: start.y,
      width: 0,
      height: 0,
    })
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeState) {
      const current = pointToPercent(event.clientX, event.clientY)
      if (!current) return
      updateAoi(resizeState.aoiId, resizeAoiFromHandle(resizeState.initial, resizeState.handle, current))
      return
    }

    if (!dragStart || !draftRect) return
    const current = pointToPercent(event.clientX, event.clientY)
    if (!current) return

    setDraftRect({
      ...draftRect,
      x: Math.min(dragStart.x, current.x),
      y: Math.min(dragStart.y, current.y),
      width: Math.abs(current.x - dragStart.x),
      height: Math.abs(current.y - dragStart.y),
    })
  }

  const finishDraft = () => {
    if (resizeState) {
      setResizeState(null)
      return
    }

    if (!draftRect) {
      setDragStart(null)
      return
    }

    const normalized = normalizeAoiRect(draftRect)
    if (normalized.width >= MIN_AOI_PERCENT && normalized.height >= MIN_AOI_PERCENT) {
      const nextAoi: AOI = {
        ...normalized,
        id: `aoi-${Date.now()}-${normalizedAois.length}`,
        name: `AOI ${normalizedAois.length + 1}`,
      }
      onAoisChange([...normalizedAois, nextAoi])
      setSelectedAoiId(nextAoi.id)
    }

    setDraftRect(null)
    setDragStart(null)
  }

  const updateAoi = (aoiId: string, patch: Partial<AOI>) => {
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

  const renderedAois = draftRect ? [...normalizedAois, normalizeAoiRect(draftRect)] : normalizedAois
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

  const handlePoints = (props: { x: number; y: number; width: number; height: number }) => [
    { key: "nw" as const, x: props.x, y: props.y, cursor: "nwse-resize" },
    { key: "ne" as const, x: props.x + props.width, y: props.y, cursor: "nesw-resize" },
    { key: "sw" as const, x: props.x, y: props.y + props.height, cursor: "nesw-resize" },
    { key: "se" as const, x: props.x + props.width, y: props.y + props.height, cursor: "nwse-resize" },
  ]

  return (
    <div className="space-y-4">
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
                    const props = rectToSvgProps(aoi)
                    if (!props) return null
                    const isDraft = aoi.id === "draft"
                    const isSelected = selectedAoiId === aoi.id
                    return (
                      <g key={aoi.id}>
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
                        {!isDraft && isSelected && (
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
              Arrastra las esquinas de <span className="font-semibold">{selectedAoi.name}</span> para ajustar su tamano.
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
