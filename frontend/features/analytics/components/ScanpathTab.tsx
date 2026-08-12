"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Clock, MapPin, Route, Ruler, Timer } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { useAoiMetrics, useScanpathData } from "../hooks/useAnalyticsData"
import {
  formatScanpathObjectiveDetails,
  resolveScanpathRadiusCapMs,
  resolveScanpathTotalDurationS,
  scanpathRadiusForDuration,
} from "../scanpathScale"
import type { FixationDurationMs } from "../types"
import {
  AoiContextPanel,
  AoiLegend,
  AoiOverlay,
  AoiToggleButton,
  getContainedImageBox,
  type ContainedImageBox,
} from "./AoiOverlay"
import { ScanpathDurationLegend } from "./ScanpathDurationLegend"

const MAIN_SCANPATH_MIN_RADIUS = 12
const MAIN_SCANPATH_MAX_RADIUS = 40

interface ScanpathTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  minFixationDurationMs: FixationDurationMs
}

export function ScanpathTab({
  projectId,
  participantCode,
  scenario,
  minFixationDurationMs,
}: ScanpathTabProps) {
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  const [showAois, setShowAois] = useState(true)
  
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)

  const { data, loading, error } = useScanpathData(
    projectId,
    participantCode,
    scenario,
    minFixationDurationMs
  )
  const { data: aoiData, loading: aoiLoading, error: aoiError } = useAoiMetrics(
    projectId,
    participantCode,
    scenario,
    minFixationDurationMs
  )
  const aois = aoiData?.aois ?? []
  const radiusCapMs = resolveScanpathRadiusCapMs(data?.radius_scale)
  const totalDurationS = data
    ? resolveScanpathTotalDurationS(data.total_duration_s, data.objectives)
    : null

  const computeLetterbox = useCallback(() => {
    setLetterbox(getContainedImageBox(imageRef.current, imageContainerRef.current))
  }, [])

  // Image load / revocation
  useEffect(() => {
    let cancelled = false
    let currentUrl: string | null = null

    if (!data?.scenario_file_id) {
      Promise.resolve().then(() => {
        if (!cancelled) setScenarioImageUrl(null)
      })
      return () => {
        cancelled = true
      }
    }

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
      Promise.resolve().then(() => setVisibleCount(data.n_objectives))
    }
  }, [data?.n_objectives])

  if (scenario === "all") {
    return (
      <div className="analytics-stack">
        <Card>
          <CardHeader>
            <CardTitle>Mapa de recorridos</CardTitle>
            <CardDescription>
              Recorrido visual con nodos numerados por orden de fijación. El
              mismo tamaño representa la misma duración entre participantes.
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
    <div className="analytics-stack">
      <Card>
        <CardHeader>
          <CardTitle>Mapa de recorridos</CardTitle>
          <CardDescription>
            Recorrido visual con nodos numerados por orden de fijación. El mismo
            tamaño representa la misma duración entre participantes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!participantCode ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Selecciona un participante para ver el mapa de recorridos.
            </div>
          ) : (
            <>
              <div className="analytics-kpi-grid analytics-kpi-grid-four">
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
                  iconBgClass="bg-emerald-100 dark:bg-emerald-900/30"
                  iconColorClass="text-emerald-500"
                  labelColorClass="text-emerald-600 dark:text-emerald-400"
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
                <KpiCard
                  label="Tiempo fijado"
                  value={totalDurationS}
                  unit="s"
                  description="Suma de fijaciones válidas"
                  tooltip="Tiempo total de permanencia en fijaciones válidas; excluye sacadas, mirada inválida y tiempo fuera del estímulo"
                  Icon={Timer}
                  loading={loading}
                  bgClass="bg-card"
                  iconBgClass="bg-sky-100 dark:bg-sky-900/30"
                  iconColorClass="text-sky-500"
                  labelColorClass="text-sky-600 dark:text-sky-400"
                  decimals={2}
                />
              </div>

              {loading ? (
                <div className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
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
                  const radiusFor = (durationS: number) => {
                    return scanpathRadiusForDuration(
                      durationS,
                      MAIN_SCANPATH_MIN_RADIUS,
                      MAIN_SCANPATH_MAX_RADIUS,
                      radiusCapMs
                    )
                  }

                  return (
                    <>
                      <div className="relative" ref={imageContainerRef}>
                        {!scenarioImageUrl ? (
                          <div className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
                        ) : (
                          <img
                            ref={imageRef}
                            src={scenarioImageUrl}
                            alt="Escenario"
                            className="analytics-visual-image"
                            onLoad={computeLetterbox}
                          />
                        )}
                        {showAois && (
                          <AoiOverlay aois={aois} box={letterbox} className="z-10" />
                        )}
                        {letterbox && (
                          <svg
                            className="pointer-events-none absolute inset-0 z-20"
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
                            {visibleObjectives.map((obj) => {
                              const cx = letterbox.offsetX + obj.cx * letterbox.renderedW
                              const cy = letterbox.offsetY + obj.cy * letterbox.renderedH
                              const r = radiusFor(obj.duration_s)
                              const fontSize = Math.max(9, Math.min(Math.round(r * 0.55), 16))
                              const details = formatScanpathObjectiveDetails(obj)
                              return (
                                <g
                                  key={`node-${obj.id}`}
                                  data-testid={`scanpath-fixation-${obj.id}`}
                                  data-duration-ms={Math.round(obj.duration_s * 1_000)}
                                  data-radius={r}
                                  role="img"
                                  tabIndex={0}
                                  aria-label={details}
                                  className="group pointer-events-auto cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                >
                                  <title>{details}</title>
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill="rgba(0, 122, 255, 0.55)"
                                    stroke="rgba(255,255,255,0.95)"
                                    strokeWidth={2.5}
                                    className="transition-[stroke-width] group-focus-visible:stroke-[4]"
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
                            })}
                          </svg>
                        )}
                      </div>
                      <div className="mt-4 rounded-xl border border-border bg-muted/30 px-5 py-3">
                        <ScanpathDurationLegend
                          capMs={radiusCapMs}
                          minRadius={MAIN_SCANPATH_MIN_RADIUS}
                          maxRadius={MAIN_SCANPATH_MAX_RADIUS}
                          color="rgb(0, 122, 255)"
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-5 py-3">
                        <AoiLegend aois={showAois ? aois : []} />
                        <div className="ml-auto flex items-center">
                          <AoiToggleButton
                            enabled={showAois}
                            onToggle={() => setShowAois((value) => !value)}
                            disabled={aois.length === 0 || aoiLoading}
                            count={aois.length}
                          />
                        </div>
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

      {participantCode && scenario !== "all" ? (
        <AoiContextPanel
          data={aoiData}
          loading={aoiLoading}
          error={aoiError}
          title="AOIs en mapa de recorridos"
          description="Compara el orden de fijaciones del recorrido con las areas delimitadas."
        />
      ) : null}
    </div>
  )
}
