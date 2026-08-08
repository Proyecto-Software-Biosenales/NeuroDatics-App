"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Clock,
  Crosshair,
  Eye,
  Gauge,
  MapPin,
  RotateCcw,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { cn } from "@/lib/utils"
import { useAoiMetrics, useGazeAt } from "../hooks/useAnalyticsData"
import {
  AoiLegend,
  AoiOverlay,
  AoiToggleButton,
  findAoiAtPoint,
  getContainedImageBox,
  imagePointToContainerPercent,
  type ContainedImageBox,
} from "./AoiOverlay"
import {
  getPreviewFailureMessage,
  supportsStimulusAois,
} from "./stimulusState"
import { MissingStimulusImage } from "./MissingStimulusImage"

interface StimulusFixationCardProps {
  projectId: string
  participantCode: string | null
  scenario: string
  selectedTime: number | null
  selectedValue?: number | null
  selectedValueLabel?: string
  selectedValueSub?: string
  selectedValueDecimals?: number
  totalDurationS?: number | null
  title?: string
  description?: string
  emptyText?: string
  metricDescription?: string
  onClearSelection?: () => void
  canClearSelection?: boolean
  enableAois?: boolean
}

function formatMetricValue(value: number | null | undefined, decimals: number) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toFixed(decimals)
}

function useStimulusPreview({
  projectId,
  participantCode,
  selectedTime,
}: {
  projectId: string
  participantCode: string | null
  selectedTime: number | null
}) {
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  const [scenarioPreviewLoading, setScenarioPreviewLoading] = useState(false)
  const [scenarioPreviewError, setScenarioPreviewError] = useState<string | null>(null)
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [gazeOffset, setGazeOffset] = useState<{ x: number; y: number } | null>(null)
  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)

  const {
    data: gazeData,
    loading: gazeLoading,
    fetchGaze,
    clear: clearGaze,
  } = useGazeAt(projectId, participantCode)

  useEffect(() => {
    if (selectedTime == null || !participantCode) {
      clearGaze()
      return
    }
    fetchGaze(selectedTime)
  }, [clearGaze, fetchGaze, participantCode, selectedTime])

  const gazeX = gazeData?.gx
  const gazeY = gazeData?.gy

  const computeGazeOffset = useCallback(() => {
    const box = getContainedImageBox(imageRef.current, imageContainerRef.current)
    setLetterbox(box)

    if (!box || gazeX == null || gazeY == null) {
      setGazeOffset(null)
      return
    }

    setGazeOffset(imagePointToContainerPercent(box, gazeX, gazeY))
  }, [gazeX, gazeY])

  useEffect(() => {
    computeGazeOffset()
  }, [computeGazeOffset])

  useEffect(() => {
    const frame = requestAnimationFrame(() => computeGazeOffset())
    const container = imageContainerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame)
    }
    const observer = new ResizeObserver(() => computeGazeOffset())
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [computeGazeOffset, scenarioImageUrl])

  useEffect(() => {
    let cancelled = false
    let currentUrl: string | null = null

    if (!gazeData?.scenario_file_id) {
      Promise.resolve().then(() => {
        if (cancelled) return
        setScenarioImageUrl(null)
        setScenarioPreviewLoading(false)
        setScenarioPreviewError(null)
      })
      return () => {
        cancelled = true
      }
    }

    Promise.resolve().then(() => {
      if (cancelled) return
      setScenarioImageUrl(null)
      setScenarioPreviewLoading(true)
      setScenarioPreviewError(null)
    })

    const params = new URLSearchParams({
      time_s: String(gazeData.nearest_time_s),
    })
    if (participantCode) params.set("participant_code", participantCode)
    if (gazeData.scenario) params.set("scenario", gazeData.scenario)

    apiFetchBlob(`/api/projects/${projectId}/files/${gazeData.scenario_file_id}/preview?${params}`)
      .then((blob) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setScenarioImageUrl(currentUrl)
      })
      .catch((error) => {
        if (!cancelled) {
          setScenarioImageUrl(null)
          setScenarioPreviewError(error?.message || "No se pudo cargar el estímulo visual")
        }
      })
      .finally(() => {
        if (!cancelled) setScenarioPreviewLoading(false)
      })

    return () => {
      cancelled = true
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [
    gazeData?.nearest_time_s,
    gazeData?.scenario,
    gazeData?.scenario_file_id,
    participantCode,
    projectId,
  ])

  return {
    scenarioImageUrl,
    scenarioPreviewLoading,
    scenarioPreviewError,
    imageContainerRef,
    imageRef,
    gazeOffset,
    letterbox,
    gazeData,
    gazeLoading,
    clearGaze,
    computeGazeOffset,
    gazeX,
    gazeY,
  }
}

export function StimulusPreviewScreen({
  projectId,
  participantCode,
  selectedTime,
  title = "Pantalla observada",
  description = "Estímulo visual en el instante seleccionado.",
  emptyText = "Selecciona una ventana para ver el estímulo observado.",
  className,
}: {
  projectId: string
  participantCode: string | null
  selectedTime: number | null
  title?: string
  description?: string
  emptyText?: string
  className?: string
}) {
  const {
    scenarioImageUrl,
    scenarioPreviewLoading,
    scenarioPreviewError,
    imageContainerRef,
    imageRef,
    gazeOffset,
    gazeData,
    gazeLoading,
    computeGazeOffset,
  } = useStimulusPreview({ projectId, participantCode, selectedTime })
  const hasSelection = selectedTime != null && Boolean(participantCode)

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {gazeData?.scenario ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{gazeData.scenario}</span>
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {gazeData ? (
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            t = {gazeData.nearest_time_s.toFixed(2)}s
          </span>
        ) : null}
      </div>

      {!hasSelection ? (
        <div className="flex min-h-[260px] items-center justify-center bg-muted/30 px-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : gazeLoading ? (
        <div className="min-h-[260px] animate-pulse bg-muted" />
      ) : !gazeData ? (
        <div className="flex min-h-[260px] items-center justify-center bg-muted/30 px-6 text-center text-sm text-muted-foreground">
          No se pudo ubicar la mirada para este instante.
        </div>
      ) : !gazeData.scenario_file_id ? (
        <div className="mx-auto w-full max-w-[560px] overflow-hidden bg-gray-950">
          <MissingStimulusImage
            scenario={gazeData.scenario}
            gazeX={gazeData.gx}
            gazeY={gazeData.gy}
            markerTone="cyan"
            className="rounded-none"
          />
          <div className="border-t border-white/10 px-4 py-2 text-center text-xs text-gray-300">
            Posición de mirada: ({gazeData.gx?.toFixed(1) ?? "—"}, {gazeData.gy?.toFixed(1) ?? "—"})
          </div>
        </div>
      ) : scenarioPreviewLoading ? (
        <div className="min-h-[260px] animate-pulse bg-muted" />
      ) : scenarioImageUrl ? (
        <div
          className="relative flex min-h-[260px] items-center justify-center bg-gray-950"
          ref={imageContainerRef}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={scenarioImageUrl}
            alt="Escenario"
            className="max-h-[380px] w-full object-contain"
            onLoad={computeGazeOffset}
          />
          {gazeOffset ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-crosshair"
                    style={{ left: `${gazeOffset.x}%`, top: `${gazeOffset.y}%` }}
                  >
                    <div className="h-8 w-8 rounded-full border-[5px] border-cyan-400 bg-cyan-400/20 shadow-[0_6px_20px_rgba(6,182,212,0.35)]" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-950">
                    <Crosshair className="h-4 w-4 text-cyan-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-none">Punto de atención</p>
                    <p className="mt-1 text-xs leading-none text-muted-foreground">
                      ({gazeData.gx?.toFixed(0)}, {gazeData.gy?.toFixed(0)})
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-[260px] items-center justify-center bg-muted/30 px-6 text-center text-sm text-muted-foreground">
          {getPreviewFailureMessage(gazeData, scenarioPreviewError)}
        </div>
      )}
    </div>
  )
}

export function StimulusPreviewSurface({
  projectId,
  participantCode,
  selectedTime,
  emptyText = "Selecciona una ventana para ver el estímulo observado.",
  className,
}: {
  projectId: string
  participantCode: string | null
  selectedTime: number | null
  emptyText?: string
  className?: string
}) {
  const {
    scenarioImageUrl,
    scenarioPreviewLoading,
    scenarioPreviewError,
    imageContainerRef,
    imageRef,
    gazeOffset,
    gazeData,
    gazeLoading,
    computeGazeOffset,
  } = useStimulusPreview({ projectId, participantCode, selectedTime })
  const hasSelection = selectedTime != null && Boolean(participantCode)
  const surfaceClassName = cn(
    "relative flex h-full min-h-[180px] w-full items-center justify-center overflow-hidden bg-gray-950 px-4 text-center text-sm text-gray-300",
    className
  )

  if (!hasSelection) {
    return <div className={surfaceClassName}>{emptyText}</div>
  }

  if (gazeLoading) {
    return <div className={cn(surfaceClassName, "animate-pulse bg-muted px-0")} />
  }

  if (!gazeData) {
    return <div className={surfaceClassName}>No se pudo ubicar la mirada para este instante.</div>
  }

  if (!gazeData.scenario_file_id) {
    return (
      <div className={cn(surfaceClassName, "p-0")}>
        <MissingStimulusImage
          scenario={gazeData.scenario}
          gazeX={gazeData.gx}
          gazeY={gazeData.gy}
          markerTone="cyan"
          className="h-full min-h-0 w-full max-w-none rounded-none"
        />
        <span className="absolute inset-x-0 bottom-0 z-10 bg-black/70 px-3 py-1.5 text-xs text-gray-300">
          Mirada: ({gazeData.gx?.toFixed(1) ?? "—"}, {gazeData.gy?.toFixed(1) ?? "—"})
        </span>
      </div>
    )
  }

  if (scenarioPreviewLoading) {
    return <div className={cn(surfaceClassName, "animate-pulse bg-muted px-0")} />
  }

  if (!scenarioImageUrl) {
    return (
      <div className={surfaceClassName}>
        {getPreviewFailureMessage(gazeData, scenarioPreviewError)}
      </div>
    )
  }

  return (
    <div className={cn(surfaceClassName, "p-0")} ref={imageContainerRef}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={scenarioImageUrl}
        alt="Escenario"
        className="h-full w-full object-contain"
        onLoad={computeGazeOffset}
      />
      {gazeOffset ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-crosshair"
                style={{ left: `${gazeOffset.x}%`, top: `${gazeOffset.y}%` }}
              >
                <div className="h-7 w-7 rounded-full border-4 border-cyan-400 bg-cyan-400/20 shadow-[0_6px_20px_rgba(6,182,212,0.35)]" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-950">
                <Crosshair className="h-4 w-4 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">Punto de atención</p>
                <p className="mt-1 text-xs leading-none text-muted-foreground">
                  ({gazeData.gx?.toFixed(0)}, {gazeData.gy?.toFixed(0)})
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </div>
  )
}

export function StimulusFixationCard({
  projectId,
  participantCode,
  scenario,
  selectedTime,
  selectedValue = null,
  selectedValueLabel = "VALOR",
  selectedValueSub = "valor seleccionado",
  selectedValueDecimals = 2,
  totalDurationS = null,
  title = "Punto de fijación sobre estímulo visual",
  description = "Ubicación de la mirada del participante durante el estímulo visual.",
  emptyText = "Haz clic en el gráfico o en Mínimo / Máximo para ver la mirada del participante",
  metricDescription = "la métrica seleccionada",
  onClearSelection,
  canClearSelection = true,
  enableAois = true,
}: StimulusFixationCardProps) {
  const [showAois, setShowAois] = useState(true)
  const {
    scenarioImageUrl,
    scenarioPreviewLoading,
    scenarioPreviewError,
    imageContainerRef,
    imageRef,
    gazeOffset,
    letterbox,
    gazeData,
    gazeLoading,
    clearGaze,
    computeGazeOffset,
    gazeX,
    gazeY,
  } = useStimulusPreview({ projectId, participantCode, selectedTime })
  const canUseAois = enableAois && supportsStimulusAois(gazeData)
  const canShowAois = canUseAois && showAois
  const aoiScenario = canUseAois
    ? scenario !== "all" ? scenario : gazeData?.scenario ?? "all"
    : "all"
  const { data: aoiData, loading: aoiLoading } = useAoiMetrics(
    projectId,
    participantCode,
    aoiScenario
  )
  const aois = aoiData?.aois ?? []
  const currentAoi = canUseAois ? findAoiAtPoint(aois, gazeX, gazeY) : null
  const metricValueText = formatMetricValue(selectedValue, selectedValueDecimals)

  let aoiStatusText = ""
  if (canUseAois) {
    if (currentAoi) {
      aoiStatusText = ` Cae dentro del AOI "${currentAoi.name}".`
    } else if (aois.length > 0) {
      aoiStatusText = " No cae dentro de un AOI delimitado."
    }
  }

  const clearSelection = () => {
    clearGaze()
    onClearSelection?.()
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{title}</CardTitle>
            {gazeData?.scenario && (
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                <MapPin className="h-3 w-3 shrink-0" />
                {gazeData.scenario}
              </span>
            )}
          </div>
          <CardDescription>{description}</CardDescription>
        </div>
        {gazeData && (
          <div className="flex shrink-0 items-center gap-2">
            {canUseAois ? (
              <AoiToggleButton
                enabled={showAois}
                onToggle={() => setShowAois((value) => !value)}
                disabled={aois.length === 0 || aoiLoading}
                count={aois.length}
              />
            ) : null}
            {canClearSelection ? (
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpiar selección
              </button>
            ) : null}
          </div>
        )}
      </CardHeader>

      <CardContent className="mt-4 space-y-4">
        {gazeData && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "SEGUNDO",
                value: `${gazeData.nearest_time_s.toFixed(0)}`,
                sub: totalDurationS != null ? `de ${Math.round(totalDurationS)} segundos` : "tiempo seleccionado",
                Icon: Clock,
                bg: "bg-blue-50 dark:bg-blue-950/40",
                iconColor: "text-blue-500",
              },
              {
                label: selectedValueLabel,
                value: metricValueText,
                sub: selectedValueSub,
                Icon: Gauge,
                bg: "bg-emerald-50 dark:bg-emerald-950/40",
                iconColor: "text-emerald-500",
              },
              {
                label: "POS X",
                value: gazeData.gx != null ? `${gazeData.gx.toFixed(0)}%` : "—",
                sub: "horizontal",
                Icon: Crosshair,
                bg: "bg-violet-50 dark:bg-violet-950/40",
                iconColor: "text-violet-500",
              },
              {
                label: "POS Y",
                value: gazeData.gy != null ? `${gazeData.gy.toFixed(0)}%` : "—",
                sub: "vertical",
                Icon: Crosshair,
                bg: "bg-emerald-50 dark:bg-emerald-950/40",
                iconColor: "text-emerald-500",
              },
            ].map(({ label, value, sub, Icon, bg, iconColor }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", bg)}>
                  <Icon className={cn("h-5 w-5", iconColor)} />
                </div>
                <div className="min-w-0 flex flex-col">
                  <p className="text-xs font-normal uppercase tracking-widest text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 text-3xl font-bold leading-tight text-foreground">{value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!gazeData && !gazeLoading ? (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : gazeLoading ? (
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
        ) : gazeData && (gazeData.gx == null || gazeData.gy == null) ? (
          <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
            <span>Sin coordenadas de mirada registradas para t = {gazeData.nearest_time_s.toFixed(1)}s</span>
            {gazeData.scenario && (
              <span className="text-xs text-muted-foreground/60">Escenario: {gazeData.scenario}</span>
            )}
          </div>
        ) : gazeData && !gazeData.scenario_file_id ? (
          <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-gray-950">
            <MissingStimulusImage
              scenario={gazeData.scenario}
              gazeX={gazeData.gx}
              gazeY={gazeData.gy}
              markerTone="cyan"
              className="rounded-none"
            />
            <div className="border-t border-white/10 px-4 py-2 text-center text-xs text-gray-300">
              t = {gazeData.nearest_time_s.toFixed(2)}s · Posición de mirada: ({gazeData.gx?.toFixed(1)}, {gazeData.gy?.toFixed(1)})
            </div>
          </div>
        ) : gazeData ? (
          <div className="overflow-hidden rounded-xl bg-card">
            {scenarioPreviewLoading ? (
              <div className="h-48 animate-pulse rounded-xl bg-muted" />
            ) : scenarioImageUrl ? (
              <div className="relative" ref={imageContainerRef}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imageRef}
                  src={scenarioImageUrl}
                  alt="Escenario"
                  className="max-h-[500px] w-full object-contain"
                  onLoad={computeGazeOffset}
                />
                {canShowAois && (
                  <AoiOverlay aois={aois} box={letterbox} />
                )}
                {gazeOffset && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-crosshair"
                          style={{ left: `${gazeOffset.x}%`, top: `${gazeOffset.y}%` }}
                        >
                          <div className="h-8 w-8 rounded-full border-[5px] border-cyan-400 bg-cyan-400/20 shadow-[0_6px_20px_rgba(6,182,212,0.35)]" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-950">
                          <Crosshair className="h-4 w-4 text-cyan-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-none">Punto de atención</p>
                          <p className="mt-1 text-xs leading-none text-muted-foreground">
                            ({gazeData.gx?.toFixed(0)}, {gazeData.gy?.toFixed(0)})
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                {getPreviewFailureMessage(gazeData, scenarioPreviewError)}
              </div>
            )}
          </div>
        ) : null}

        {gazeData && canShowAois ? <AoiLegend aois={aois} /> : null}

        {gazeData && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 dark:bg-slate-100">
              <Eye className="h-5 w-5 text-white dark:text-slate-950" />
            </div>
            <div>
              <p className="text-base font-medium text-slate-900 dark:text-slate-100">Punto de atención</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {selectedValue != null
                  ? `El indicador de alto contraste marca la ubicación exacta donde se registró ${metricDescription} (${metricValueText}) en el segundo ${Math.round(gazeData.nearest_time_s)} de la visualización.`
                  : "El indicador de alto contraste marca la ubicación exacta donde se registró la fijación en el instante seleccionado sobre el estímulo visual."}
                {aoiStatusText}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
