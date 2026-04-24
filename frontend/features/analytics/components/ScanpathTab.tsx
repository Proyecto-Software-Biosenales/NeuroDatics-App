"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MapPin, Route, Ruler, Clock } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { useScanpathData } from "../hooks/useAnalyticsData"

interface ScanpathTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
}

export function ScanpathTab({
  projectId,
  participantCode,
  scenario,
}: ScanpathTabProps) {
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [letterbox, setLetterbox] = useState<{
    cW: number
    cH: number
    renderedW: number
    renderedH: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)

  const { data, loading, error } = useScanpathData(projectId, participantCode, scenario)

  const computeLetterbox = useCallback(() => {
    const img = imageRef.current
    const container = imageContainerRef.current
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

  // Image load / revocation
  useEffect(() => {
    if (!data?.scenario_file_id) {
      setScenarioImageUrl(null)
      return
    }

    let cancelled = false
    let currentUrl: string | null = null

    apiFetchBlob(`/api/projects/${projectId}/files/${data.scenario_file_id}/image`)
      .then((blob) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setScenarioImageUrl(currentUrl)
      })
      .catch(() => {
        if (!cancelled) setScenarioImageUrl(null)
      })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [projectId, data?.scenario_file_id])

  // Recalculate on window resize
  useEffect(() => {
    window.addEventListener("resize", computeLetterbox)
    return () => window.removeEventListener("resize", computeLetterbox)
  }, [computeLetterbox])

  // Reset slider to "show all" whenever data changes
  useEffect(() => {
    if (data?.n_objectives) {
      setVisibleCount(data.n_objectives)
    }
  }, [data?.n_objectives])

  if (scenario === "all") {
    return (
      <div className="space-y-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Mapa de recorridos</CardTitle>
            <CardDescription>
              Recorrido visual del participante sobre el estímulo: nodos numerados por orden de fijación, tamaño proporcional a la duración.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
              <span>Selecciona un escenario específico para visualizar el mapa de recorridos</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Mapa de recorridos</CardTitle>
          <CardDescription>
            Recorrido visual del participante sobre el estímulo: nodos numerados por orden de fijación, tamaño proporcional a la duración.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!participantCode ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Selecciona un participante para ver el mapa de recorridos.
            </div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-3 gap-15 mr-6 ml-20">
                <KpiCard
                  label="Recorridos"
                  value={data?.n_objectives}
                  unit=""
                  description="Puntos de fijación agrupados"
                  tooltip="Número de objetivos visuales detectados agrupando fijaciones cercanas"
                  Icon={Route}
                  loading={loading}
                  bgClass="bg-card"
                  iconBgClass="bg-indigo-100 dark:bg-indigo-900/30"
                  iconColorClass="text-indigo-500"
                  labelColorClass="text-indigo-600 dark:text-indigo-400"
                  decimals={0}
                />
                <KpiCard
                  label="Distancia"
                  value={data?.total_distance_px}
                  unit="px"
                  description="Longitud total del recorrido"
                  tooltip="Distancia total en píxeles entre fijaciones consecutivas asumiendo resolución 1920×1080"
                  Icon={Ruler}
                  loading={loading}
                  bgClass="bg-card"
                  iconBgClass="bg-cyan-100 dark:bg-cyan-900/30"
                  iconColorClass="text-cyan-500"
                  labelColorClass="text-cyan-600 dark:text-cyan-400"
                  decimals={0}
                />
                <KpiCard
                  label="Promedio"
                  value={data ? data.avg_duration_s * 1000 : null}
                  unit="ms"
                  description="Duración media por fijación"
                  tooltip="Duración promedio de cada punto de fijación agrupado"
                  Icon={Clock}
                  loading={loading}
                  bgClass="bg-card"
                  iconBgClass="bg-rose-100 dark:bg-rose-900/30"
                  iconColorClass="text-rose-500"
                  labelColorClass="text-rose-600 dark:text-rose-400"
                  decimals={0}
                />
              </div>

              {loading ? (
                <div className="h-[500px] w-full animate-pulse rounded-lg bg-muted" />
              ) : error ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Error al cargar los datos: {error}
                </div>
              ) : !data || data.objectives.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No hay datos de fijación para los filtros seleccionados.
                </div>
              ) : !data.scenario_file_id ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No se encontró imagen del escenario seleccionado.
                </div>
              ) : (
                (() => {
                  const total = data.objectives.length
                  const shown = visibleCount ?? total
                  const visibleObjectives = data.objectives.slice(0, shown)

                  return (
                    <>
                      <div className="relative" ref={imageContainerRef}>
                        {!scenarioImageUrl ? (
                          <div className="h-[500px] w-full animate-pulse rounded-lg bg-muted" />
                        ) : (
                          <img
                            ref={imageRef}
                            src={scenarioImageUrl}
                            alt="Escenario"
                            className="max-h-[580px] w-full object-contain"
                            onLoad={computeLetterbox}
                          />
                        )}
                        {letterbox && (
                          <svg
                            className="pointer-events-none absolute inset-0"
                            width="100%"
                            height="100%"
                            viewBox={`0 0 ${letterbox.cW} ${letterbox.cH}`}
                          >
                            {/* Lines between objectives */}
                            {visibleObjectives.map((obj, i) => {
                              if (i === 0) return null
                              const prev = visibleObjectives[i - 1]
                              return (
                                <line
                                  key={`line-${obj.id}`}
                                  x1={letterbox.offsetX + prev.cx * letterbox.renderedW}
                                  y1={letterbox.offsetY + prev.cy * letterbox.renderedH}
                                  x2={letterbox.offsetX + obj.cx * letterbox.renderedW}
                                  y2={letterbox.offsetY + obj.cy * letterbox.renderedH}
                                  stroke="rgba(0, 122, 255, 0.7)"
                                  strokeWidth={2.5}
                                  strokeLinecap="round"
                                />
                              )
                            })}
                            {/* Nodes */}
                            {(() => {
                              const durations = visibleObjectives.map((o) => o.duration_s)
                              const sorted = [...durations].sort((a, b) => a - b)
                              const p5 = sorted[Math.max(0, Math.floor(sorted.length * 0.05))]
                              const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
                              const range = p95 - p5
                              return visibleObjectives.map((obj) => {
                                const cx = letterbox.offsetX + obj.cx * letterbox.renderedW
                                const cy = letterbox.offsetY + obj.cy * letterbox.renderedH
                                const norm = range > 0 ? Math.max(0, Math.min(1, (obj.duration_s - p5) / range)) : 0.5
                                const r = Math.round(12 + norm * 28)
                                const fontSize = Math.max(9, Math.min(Math.round(r * 0.55), 16))
                                return (
                                  <g key={`node-${obj.id}`}>
                                    <circle
                                      cx={cx}
                                      cy={cy}
                                      r={r}
                                      fill="rgba(0, 122, 255, 0.55)"
                                      stroke="rgba(255,255,255,0.95)"
                                      strokeWidth={2.5}
                                    />
                                    <text
                                      x={cx}
                                      y={cy}
                                      textAnchor="middle"
                                      dominantBaseline="central"
                                      fill="white"
                                      fontSize={fontSize}
                                      fontWeight="bold"
                                      style={{
                                        paintOrder: "stroke",
                                        stroke: "rgba(0,0,0,0.5)",
                                        strokeWidth: 2,
                                      }}
                                    >
                                      {obj.id}
                                    </text>
                                  </g>
                                )
                              })
                            })()}
                          </svg>
                        )}
                      </div>
                      {/* Playback slider */}
                      {data.objectives.length > 1 && (
                        <div className="mt-4 flex items-center gap-4 rounded-xl border border-border bg-muted/30 px-5 py-3">
                          <span className="shrink-0 text-sm font-medium text-foreground">
                            Fijación {shown} de {total}
                          </span>
                          <input
                            type="range"
                            min={1}
                            max={total}
                            value={shown}
                            onChange={(e) => setVisibleCount(Number(e.target.value))}
                            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-500 dark:bg-gray-700"
                          />
                          {shown < total && (
                            <button
                              type="button"
                              onClick={() => setVisibleCount(total)}
                              className="shrink-0 rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              Ver todos
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
