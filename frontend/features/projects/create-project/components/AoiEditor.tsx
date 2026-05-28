"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
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

export function AoiEditor({
  projectId,
  fileId,
  fallbackUrl,
  scenarioName,
  aois,
  onAoisChange,
}: AoiEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoadingImage, setIsLoadingImage] = useState(Boolean((projectId && fileId) || fallbackUrl))
  const [loadError, setLoadError] = useState(false)
  const [letterbox, setLetterbox] = useState<Letterbox | null>(null)
  const [draftRect, setDraftRect] = useState<AOI | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)

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
  }

  const renderedAois = draftRect ? [...normalizedAois, normalizeAoiRect(draftRect)] : normalizedAois

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
                  className="pointer-events-none absolute inset-0"
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${letterbox.cW} ${letterbox.cH}`}
                >
                  {renderedAois.map((aoi) => {
                    const props = rectToSvgProps(aoi)
                    if (!props) return null
                    const isDraft = aoi.id === "draft"
                    return (
                      <g key={aoi.id}>
                        <rect
                          {...props}
                          fill={isDraft ? `${aoi.color}22` : "transparent"}
                          stroke={aoi.color}
                          strokeWidth={isDraft ? 2 : 3}
                          strokeDasharray={isDraft ? "6 5" : undefined}
                          vectorEffect="non-scaling-stroke"
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
        </div>

        {normalizedAois.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay AOIs registradas para este estimulo.</p>
        ) : (
          <div className="space-y-2">
            {normalizedAois.map((aoi, index) => (
              <div
                key={aoi.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center"
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
