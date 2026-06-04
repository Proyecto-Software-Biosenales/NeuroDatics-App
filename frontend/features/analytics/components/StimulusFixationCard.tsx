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

/** Returns true if the scenario name looks like an instruction/non-stimulus screen. */
function isNoImageScenario(name: string | null): boolean {
  if (!name) return false
  const lower = name.toLowerCase().trim()
  return (
    lower.startsWith("instruction") ||
    lower.startsWith("instruccion") ||
    lower.startsWith("instrucción") ||
    lower.startsWith("practice") ||
    lower.startsWith("practica") ||
    lower.startsWith("intro") ||
    lower.startsWith("blank") ||
    lower.startsWith("rest") ||
    lower.startsWith("fixation")
  )
}

function formatMetricValue(value: number | null | undefined, decimals: number) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toFixed(decimals)
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
  const [scenarioImageUrl, setScenarioImageUrl] = useState<string | null>(null)
  const [scenarioPreviewLoading, setScenarioPreviewLoading] = useState(false)
  const [scenarioPreviewError, setScenarioPreviewError] = useState<string | null>(null)
  const [showAois, setShowAois] = useState(true)
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

  const isVideoScenario = String(gazeData?.scenario_type || "").toLowerCase() === "video"
  const canUseAois = enableAois && !isVideoScenario
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
  const gazeX = gazeData?.gx
  const gazeY = gazeData?.gy
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
    if (!gazeData?.scenario_file_id) {
      setScenarioImageUrl(null)
      setScenarioPreviewLoading(false)
      setScenarioPreviewError(null)
      return
    }

    let cancelled = false
    let currentUrl: string | null = null

    setScenarioImageUrl(null)
    setScenarioPreviewLoading(true)
    setScenarioPreviewError(null)

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
                bg: "bg-teal-50 dark:bg-teal-950/40",
                iconColor: "text-teal-500",
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
                bg: "bg-sky-50 dark:bg-sky-950/40",
                iconColor: "text-sky-500",
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
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-6 text-center">
            <span className="text-sm font-medium text-foreground">
              {isNoImageScenario(gazeData.scenario)
                ? "Pantalla de instrucción - no hay estímulo visual asociado a este escenario"
                : `El escenario "${gazeData.scenario ?? "desconocido"}" no tiene estímulo visual registrado`}
            </span>
            <span className="text-xs text-muted-foreground">
              t = {gazeData.nearest_time_s.toFixed(2)}s · Posición de mirada: ({gazeData.gx?.toFixed(1)}, {gazeData.gy?.toFixed(1)})
            </span>
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
                          className="absolute -translate-x-1/2 -translate-y-1/2 cursor-crosshair"
                          style={{ left: `${gazeOffset.x}%`, top: `${gazeOffset.y}%` }}
                        >
                          <div className="h-8 w-8 rounded-full border-4 border-cyan-400 bg-cyan-400/20 shadow-lg" />
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
                {isVideoScenario
                  ? "No se pudo cargar el frame del video."
                  : scenarioPreviewError || "No se pudo cargar la imagen del escenario."}
              </div>
            )}
          </div>
        ) : null}

        {gazeData && canShowAois ? <AoiLegend aois={aois} /> : null}

        {gazeData && (
          <div className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50/60 px-4 py-3.5 dark:border-cyan-800/40 dark:bg-cyan-950/30">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-600 dark:bg-cyan-600">
              <Eye className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-medium text-cyan-700 dark:text-cyan-400">Punto de atención</p>
              <p className="text-sm text-cyan-600 dark:text-cyan-500">
                {selectedValue != null
                  ? `El indicador aguamarina marca la ubicación exacta donde se registró ${metricDescription} (${metricValueText}) en el segundo ${Math.round(gazeData.nearest_time_s)} de la visualización.`
                  : "El indicador aguamarina marca la ubicación exacta donde se registró la fijación en el instante seleccionado sobre el estímulo visual."}
                {aoiStatusText}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
