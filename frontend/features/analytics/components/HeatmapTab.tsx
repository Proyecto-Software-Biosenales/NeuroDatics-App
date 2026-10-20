"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { HintTooltip } from "@/components/HintTooltip"
import { Button } from "@/components/ui/button"

import { useCallback, useEffect, useRef, useState } from "react"
import { useCompareParticipantsSpec } from "../participantComparison/ParticipantComparisonProvider"
import { Clock, Hash, Timer } from "lucide-react"
import { ScenarioRequiredMessage } from "./AnalyticsMessageSurface"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { KpiCard } from "@/features/analytics/components/KpiCard"
import { useStimulusImage } from "../participantComparison/cardHooks"
import {
  useAoiMetrics,
  useFixationData,
  useHeatmapOverlay,
} from "../hooks/useAnalyticsData"
import type { FixationDurationMs } from "../types"
import {
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
  } = useAoiMetrics(projectId, participantCode, scenario, minFixationDurationMs)

  const loading = fixLoading || heatmapLoading
  const aois = aoiData?.aois ?? []

  const computeLetterbox = useCallback(() => {
    setLetterbox(
      getContainedImageBox(imageRef.current, imageContainerRef.current)
    )
  }, [])

  // Load scenario background image


  const scenarioImageUrl = useStimulusImage(projectId, fixData?.scenario_file_id ?? null).url
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

  // Nothing to compare until the view can draw its own chart.
  useCompareParticipantsSpec(scenario === "all" ? null : () => ({
    kind: "heatmap",
    title: "Mapa de calor",
    scenario,
    sourceParticipant: participantCode,
    origin: "individual",
    params: { minFixationDurationMs, showAois },
  }))

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
            <ScenarioRequiredMessage label="el mapa de calor" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="analytics-stack">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <CardTitle>Mapa de calor</CardTitle>
            <CardDescription>
              Representación visual de la densidad de atención sobre el estímulo
              basada en la duración y frecuencia de las fijaciones.
            </CardDescription>
          </div>
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
                  description="Total en el escenario"
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
                <Skeleton className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
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
                      <Skeleton className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
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
                      <HintTooltip hint="Tiñe de violeta la imagen de fondo para que el mapa de calor destaque más.">
                        <Button aria-pressed={showPurple} size="sm" variant="selection"
                          type="button"
                          onClick={() => setShowPurple((p) => !p)}
                          className=""
                        >
                          Filtro violeta
                        </Button>
                      </HintTooltip>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
