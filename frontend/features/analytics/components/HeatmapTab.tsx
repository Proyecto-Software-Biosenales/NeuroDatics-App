"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Clock, Flame, Hash, Timer } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { KpiCard } from "@/components/ui/KpiCard"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import {
  useAoiMetrics,
  useFixationData,
  useHeatmapOverlay,
} from "../hooks/useAnalyticsData"
import type { FixationDurationMs } from "../types"
import {
  AoiContextPanel,
  AoiLegend,
  AoiOverlay,
  AoiToggleButton,
  containedImageBoxStyle,
  getContainedImageBox,
  type ContainedImageBox,
} from "./AoiOverlay"

interface HeatmapTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  minFixationDurationMs: FixationDurationMs
}

export function HeatmapTab({
  projectId,
  participantCode,
  scenario,
  minFixationDurationMs,
}: HeatmapTabProps) {
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  const [showPurple, setShowPurple] = useState(false)
  const [showAois, setShowAois] = useState(true)
  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Fixation stats (for KPI cards)
  const { data: fixData, loading: fixLoading } = useFixationData(
    projectId,
    participantCode,
    scenario,
    minFixationDurationMs
  )
  const transformToken =
    fixData?.coordinate_transform?.contract_fingerprint ??
    fixData?.coordinate_transform?.status ??
    "screen-stimulus-v1"
  // null means "not resolved yet", which gates the overlay request. A loaded
  // response missing the field is an older backend, not an unresolved one, so it
  // falls back to 0 rather than blocking the heatmap forever.
  const cacheGeneration = fixData ? (fixData.cache_generation ?? 0) : null

  // PNG heatmap overlay from backend
  const {
    overlayUrl,
    loading: heatmapLoading,
    error: heatmapError,
  } = useHeatmapOverlay(
    projectId,
    participantCode,
    scenario,
    transformToken,
    cacheGeneration,
    minFixationDurationMs
  )
  const {
    data: aoiData,
    loading: aoiLoading,
    error: aoiError,
  } = useAoiMetrics(projectId, participantCode, scenario, minFixationDurationMs)

  const loading = fixLoading || heatmapLoading
  const aois = aoiData?.aois ?? []

  const computeLetterbox = useCallback(() => {
    setLetterbox(
      getContainedImageBox(imageRef.current, imageContainerRef.current)
    )
  }, [])

  // Load scenario background image
  useEffect(() => {
    const fileId = fixData?.scenario_file_id

    let cancelled = false
    let currentUrl: string | null = null

    Promise.resolve().then(() => {
      if (!cancelled) setScenarioImageUrl(null)
    })

    if (!fileId) {
      return () => {
        cancelled = true
      }
    }

    apiFetchBlob(`/api/projects/${projectId}/files/${fileId}/image`)
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
  }, [projectId, fixData?.scenario_file_id])

  useEffect(() => {
    const frame = requestAnimationFrame(() => computeLetterbox())
    const container = imageContainerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame)
    }
    const observer = new ResizeObserver(() => computeLetterbox())
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [computeLetterbox, scenarioImageUrl])

  if (scenario === "all") {
    return (
      <div className="analytics-stack">
        <Card>
          <CardHeader>
            <CardTitle>Mapa de calor</CardTitle>
            <CardDescription>
              Representación visual de la densidad de atención sobre el estímulo
              basada en la duración y frecuencia de las fijaciones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
              <Flame className="h-8 w-8 text-muted-foreground/40" />
              <span>
                Selecciona un escenario específico para visualizar el mapa de
                calor
              </span>
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
          <CardTitle>Mapa de calor</CardTitle>
          <CardDescription>
            Representación visual de la densidad de atención sobre el estímulo
            basada en la duración y frecuencia de las fijaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!participantCode ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Selecciona un participante para ver el mapa de calor.
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="analytics-kpi-grid">
                <KpiCard
                  label="Fijaciones"
                  value={fixData?.stats?.n_fixations}
                  unit=""
                  description="Total de fijaciones en el escenario"
                  tooltip="Número total de puntos de fijación detectados"
                  Icon={Hash}
                  loading={fixLoading}
                  bgClass="bg-card"
                  iconBgClass="bg-orange-100 dark:bg-orange-900/30"
                  iconColorClass="text-orange-500"
                  labelColorClass="text-orange-600 dark:text-orange-400"
                  decimals={0}
                />
                <KpiCard
                  label="Fijación más larga"
                  value={fixData ? fixData.stats.max_duration_s * 1000 : null}
                  unit="ms"
                  description="Duración de la fijación más prolongada"
                  tooltip="Duración en milisegundos de la fijación más larga"
                  Icon={Timer}
                  loading={fixLoading}
                  bgClass="bg-card"
                  iconBgClass="bg-rose-100 dark:bg-rose-900/30"
                  iconColorClass="text-rose-500"
                  labelColorClass="text-rose-600 dark:text-rose-400"
                  decimals={0}
                />
                <KpiCard
                  label="Duración media"
                  value={fixData ? fixData.stats.avg_duration_s * 1000 : null}
                  unit="ms"
                  description="Promedio de duración por fijación"
                  tooltip="Duración media de cada punto de fijación"
                  Icon={Clock}
                  loading={fixLoading}
                  bgClass="bg-card"
                  iconBgClass="bg-amber-100 dark:bg-amber-900/30"
                  iconColorClass="text-amber-500"
                  labelColorClass="text-amber-600 dark:text-amber-400"
                  decimals={0}
                />
              </div>

              {/* Image + overlay area */}
              {loading ? (
                <div className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
              ) : heatmapError ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Error al cargar el mapa de calor: {heatmapError}
                </div>
              ) : !fixData || fixData.fixations.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No hay datos de fijación para los filtros seleccionados.
                </div>
              ) : !fixData.scenario_file_id ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No se encontró imagen del escenario seleccionado.
                </div>
              ) : (
                <>
                  <div
                    className="relative overflow-hidden rounded-lg"
                    ref={imageContainerRef}
                  >
                    {/* Background scenario image */}
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

                    {/* Heatmap PNG overlay, pinned to the measured stimulus box */}
                    {overlayUrl && scenarioImageUrl && letterbox && (
                      <img
                        src={overlayUrl}
                        alt="Mapa de calor"
                        aria-hidden="true"
                        className="pointer-events-none z-10"
                        style={{
                          ...containedImageBoxStyle(letterbox),
                          opacity: 0.82,
                        }}
                      />
                    )}

                    {/* Optional purple tint overlay */}
                    {showPurple && (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: "rgba(60, 0, 160, 0.52)",
                          mixBlendMode: "multiply",
                        }}
                      />
                    )}

                    {showAois && <AoiOverlay aois={aois} box={letterbox} />}
                  </div>

                  {/* Controls bar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-5 py-3">
                    <AoiLegend aois={showAois ? aois : []} />
                    <div className="ml-auto flex items-center gap-3">
                      <AoiToggleButton
                        enabled={showAois}
                        onToggle={() => setShowAois((value) => !value)}
                        disabled={aois.length === 0 || aoiLoading}
                        count={aois.length}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPurple((p) => !p)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          showPurple
                            ? "border-violet-500 bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        Filtro violeta
                      </button>
                    </div>
                  </div>
                </>
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
          title="AOIs en mapa de calor"
          description="Relaciona la densidad del mapa de calor con las areas delimitadas del escenario."
        />
      ) : null}
    </div>
  )
}
