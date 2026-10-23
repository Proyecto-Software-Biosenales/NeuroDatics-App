"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Crosshair, Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { analyticsContextVersion, getAnalyticsGeneration, revalidateAnalyticsProject } from "../analyticsCache"
import { useAnalyticsRevision } from "../hooks/useAnalyticsContext"
import { ProjectsApi } from "@/features/projects/api/projectsApi"
import { useComparisonData } from "../comparison/useComparisonData"
import { PointOnStimulusPanel } from "../comparison/SpatialPanels"
import { AnalyticsModeSelector } from "../components/AnalyticsModeSelector"
import { ScenarioRequiredMessage } from "../components/AnalyticsMessageSurface"
import { FixationDurationControl } from "../components/FixationDurationControl"
import { useAoiMetrics, useFixationSensitivity } from "../hooks/useAnalyticsData"
import type { ZoomHistory } from "../chartZoom"
import { DEFAULT_FIXATION_DURATION_MS, type FixationDurationMs } from "../types"
import { getScenarioTiming } from "./cardData"
import { participantComparisonLoader, useViewportTracker } from "./cardHooks"
import { NestedComparisonBoundary } from "./ParticipantComparisonProvider"
import { ParticipantCard, type DomainReport, type PinnedPoint } from "./ParticipantCard"
import { ParticipantSelector } from "./ParticipantSelector"
import { commonDomain, describeCommonScale, type Domain, type ScaleMode } from "./scales"
import {
  CARD_POINT_BUDGET,
  EEG_CARD_POINT_BUDGET,
  isConcreteScenario,
  KIND_INFO,
  orderParticipants,
  participantDisplay,
  sourceTimeBasis,
  specMinFixationDuration,
  specRestriction,
  specWindow,
  withMinFixationDuration,
  type ParticipantComparisonSpec,
  type ParticipantLabels,
  type ZoomRange,
} from "./spec"
import { toStimulusTime, transferWindow, type ScenarioTiming, type WindowTransfer } from "./timeAlignment"

const NO_VISUALIZATIONS: never[] = []

export interface ParticipantComparisonDialogProps {
  projectId: string
  generation: number | null
  participantCodes: string[]
  participantLabels?: ParticipantLabels
  spec: ParticipantComparisonSpec
  returnFocus: HTMLElement | null
  scrollSnapshot: Array<{ element: Element; top: number; left: number }>
  onClose: () => void
}

type SourceTimingState = { status: "idle" | "loading" | "ready" | "error"; timing: ScenarioTiming | null }

/** Put every scroll container back where it was when the dialog opened. */
function restoreScroll(snapshot: ParticipantComparisonDialogProps["scrollSnapshot"]) {
  for (const { element, top, left } of snapshot) {
    element.scrollTop = top
    element.scrollLeft = left
  }
}

function formatSeconds(value: number) {
  return `${value.toFixed(2)} s`
}

function scenarioLabel(scenario: string) {
  return isConcreteScenario(scenario) ? scenario : "Todos los escenarios"
}

export default function ParticipantComparisonDialog({
  projectId,
  participantCodes,
  participantLabels,
  spec: sourceSpec,
  returnFocus,
  scrollSnapshot,
  onClose,
}: ParticipantComparisonDialogProps) {
  const participants = useMemo(() => orderParticipants(participantCodes), [participantCodes])
  // Fixation-derived charts start at the source view's threshold and can be
  // changed here without touching the dashboard.
  const [requestedMinFixation, setMinFixation] = useState<FixationDurationMs | null>(() => specMinFixationDuration(sourceSpec))
  const [open, setOpen] = useState(true)
  // Thresholds come from processing, so one participant tells which exist.
  const fixationProbe =
    requestedMinFixation != null && !specRestriction(sourceSpec) ? (sourceSpec.sourceParticipant ?? participants[0] ?? null) : null
  const fixationSensitivity = useFixationSensitivity(fixationProbe && open ? projectId : null, fixationProbe, sourceSpec.scenario)
  const availableFixations = fixationSensitivity.data?.available_min_fixation_durations_ms
  // Same fallback as the dashboard when a threshold was not generated.
  const minFixation =
    requestedMinFixation != null && availableFixations?.length && !availableFixations.includes(requestedMinFixation)
      ? (availableFixations.find((duration) => duration === DEFAULT_FIXATION_DURATION_MS) ?? availableFixations[0])
      : requestedMinFixation
  const spec = useMemo(
    () => (minFixation == null ? sourceSpec : withMinFixationDuration(sourceSpec, minFixation)),
    [minFixation, sourceSpec]
  )
  const [selected, setSelected] = useState<Set<string>>(() => new Set(participants))
  const [scaleMode, setScaleMode] = useState<ScaleMode>("common")
  const [pin, setPin] = useState<PinnedPoint | null>(null)
  const [reports, setReports] = useState<Map<string, DomainReport>>(() => new Map())
  const [zoomMemory] = useState(() => new Map<string, ZoomHistory<ZoomRange>>())
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const tracker = useViewportTracker(scrollElement)
  const info = KIND_INFO[spec.kind]
  const concrete = isConcreteScenario(spec.scenario)
  const restriction = specRestriction(spec)
  const basis = sourceTimeBasis(spec.kind)
  const sourceWindow = specWindow(spec)

  const revision = useAnalyticsRevision()
  const [liveGeneration, setLiveGeneration] = useState<{ value: number | null; revision: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    const refresh = () => revalidateAnalyticsProject(projectId, (signal) => ProjectsApi.get(projectId, signal))
    void refresh().then(() => {
      if (!cancelled) setLiveGeneration({ value: getAnalyticsGeneration(projectId), revision: analyticsContextVersion() })
    })
    const onFocus = () => {
      setLiveGeneration(null)
      void refresh().then(() => {
        if (!cancelled) setLiveGeneration({ value: getAnalyticsGeneration(projectId), revision: analyticsContextVersion() })
      })
    }
    window.addEventListener("focus", onFocus)
    return () => { cancelled = true; window.removeEventListener("focus", onFocus) }
  }, [projectId, revision])

  const spectrogramZoom = spec.kind === "eeg_spectrogram" ? spec.params.timeZoom : null
  const frameTimeS = spec.kind === "eeg_topography" ? spec.params.frameTimeS : null
  const needsSourceTiming = Boolean(
    concrete && spec.sourceParticipant && (sourceWindow || spectrogramZoom || frameTimeS != null)
  )
  const [sourceTiming, setSourceTiming] = useState<SourceTimingState>({ status: needsSourceTiming ? "loading" : "idle", timing: null })
  useEffect(() => {
    if (!needsSourceTiming || !spec.sourceParticipant || !liveGeneration) return
    const controller = new AbortController()
    getScenarioTiming(projectId, liveGeneration.value, spec.sourceParticipant, spec.scenario, controller.signal).then(
      (timing) => {
        if (!controller.signal.aborted) setSourceTiming({ status: "ready", timing })
      },
      () => {
        if (!controller.signal.aborted) setSourceTiming({ status: "error", timing: null })
      }
    )
    return () => controller.abort()
  }, [liveGeneration, needsSourceTiming, projectId, spec.scenario, spec.sourceParticipant])

  const transfer = useMemo<WindowTransfer>(
    () => transferWindow(sourceWindow, basis, spec.scenario, sourceTiming.timing),
    [basis, sourceTiming.timing, spec.scenario, sourceWindow]
  )
  const frameStimulusTime = useMemo(() => {
    if (frameTimeS == null) return null
    return toStimulusTime(frameTimeS, "recording", sourceTiming.timing)
  }, [frameTimeS, sourceTiming.timing])
  const initialZoom = useMemo<ZoomRange | null>(() => {
    if (spec.kind === "eeg_psd") return spec.params.frequencyZoom
    if (spectrogramZoom && concrete) {
      const start = toStimulusTime(spectrogramZoom.start, "recording", sourceTiming.timing)
      const end = toStimulusTime(spectrogramZoom.end, "recording", sourceTiming.timing)
      return start != null && end != null && end > start ? { start, end } : null
    }
    return null
  }, [concrete, sourceTiming.timing, spec, spectrogramZoom])
  const ready = Boolean(liveGeneration && liveGeneration.revision === revision) && (!needsSourceTiming || sourceTiming.status === "ready" || sourceTiming.status === "error")

  // Shared AOI geometry for the map overlays: one request, not one per card.
  const aoiOverlaySource = spec.sourceParticipant ?? participants[0] ?? null
  const wantsAoiOverlay = (spec.kind === "heatmap" || spec.kind === "scanpath") && spec.params.showAois && concrete
  const aoiOverlay = useAoiMetrics(
    wantsAoiOverlay && open ? projectId : null,
    aoiOverlaySource,
    spec.scenario,
    spec.kind === "heatmap" || spec.kind === "scanpath" ? spec.params.minFixationDurationMs : undefined
  )

  const selectedList = useMemo(() => participants.filter((code) => selected.has(code)), [participants, selected])

  const onReport = useCallback((participant: string, report: DomainReport | null) => {
    setReports((current) => {
      const previous = current.get(participant)
      if (report && previous && JSON.stringify(previous) === JSON.stringify(report)) return current
      if (!report && !previous) return current
      const next = new Map(current)
      if (report) next.set(participant, report)
      else next.delete(participant)
      return next
    })
  }, [])

  const covered = selectedList.filter((code) => reports.has(code)).length
  const commonDomains = useMemo(() => {
    const merged: Record<string, Domain> = {}
    if (scaleMode !== "common") return merged
    const keys = new Set<string>()
    for (const code of selectedList) for (const key of Object.keys(reports.get(code) ?? {})) keys.add(key)
    for (const key of keys) {
      const domain = commonDomain(selectedList.map((code) => reports.get(code)?.[key]))
      if (domain) merged[key] = domain
    }
    return merged
  }, [reports, scaleMode, selectedList])
  const commonX = useMemo<[number, number] | null>(() => {
    if (!info.temporal || !concrete || scaleMode !== "common") return null
    if (transfer.kind === "relative" && transfer.start != null && transfer.end != null) return [transfer.start, transfer.end]
    const domain = commonDomains.x
    return domain ? [domain.min, domain.max] : null
  }, [commonDomains.x, concrete, info.temporal, scaleMode, transfer])

  const onPin = useCallback((next: PinnedPoint) => setPin(next), [])
  const activePin = pin && selected.has(pin.participant) ? pin : null

  const requestClose = () => {
    // Nothing the closed dialog asked for keeps running.
    participantComparisonLoader.cancelAll()
    setOpen(false)
  }
  const changeSelection = (next: Set<string>) => {
    for (const code of selected) if (!next.has(code)) participantComparisonLoader.abortGroup(code)
    setSelected(next)
  }
  // Unmount work belongs to the cards; this only makes sure nothing waits.
  useEffect(() => () => participantComparisonLoader.cancelAll(), [])
  useEffect(() => {
    if (open) return
    const timer = setTimeout(onClose, 250)
    return () => clearTimeout(timer)
  }, [onClose, open])

  // The restriction already fills the body; the footer only adds context.
  const notices: string[] = []
  if (transfer.kind === "not_transferable") notices.push(transfer.reason)
  if (transfer.kind === "relative") {
    const from = transfer.start == null ? "inicio" : formatSeconds(transfer.start)
    const to = transfer.end == null ? "final" : formatSeconds(transfer.end)
    notices.push(`Ventana temporal de la vista original: ${from} – ${to} desde el inicio del estímulo, aplicada a cada grabación.`)
  }
  if (info.temporal || spec.kind === "eeg_spectrogram") {
    notices.push(
      concrete
        ? `Tiempo en segundos desde el inicio de «${spec.scenario}» en cada grabación (primer registro del escenario). El tiempo original de la grabación se conserva en la información emergente y al ubicar la mirada.`
        : "Con «Todos los escenarios» cada tarjeta usa el eje temporal de su propia grabación: los tiempos no se comparan ni se sincronizan entre participantes."
    )
  }
  if (info.temporal) {
    const budget = spec.kind === "eeg_timeseries" ? EEG_CARD_POINT_BUDGET : CARD_POINT_BUDGET
    notices.push(
      `Cada tarjeta dibuja hasta ${budget.toLocaleString("es-CO")} puntos que conservan el mínimo, el máximo y los huecos de cada tramo de la señal; no se recalcula ninguna estadística.`
    )
  }
  if (spec.kind === "eeg_timeseries" && spec.params.layout === "stacked") {
    notices.push("La vista de origen usa canales apilados; en las tarjetas los canales se superponen para mantener un tamaño legible.")
  }
  if (spec.kind === "eeg_topography" && concrete) {
    notices.push(
      frameStimulusTime != null
        ? `Cada mapa muestra la ventana más cercana a ${formatSeconds(frameStimulusTime)} desde el inicio del estímulo.`
        : "Cada mapa muestra la primera ventana de su grabación."
    )
  }
  if (spec.kind === "heatmap") notices.push("La intensidad de cada mapa de calor está normalizada respecto a su propio máximo: es una escala independiente por participante.")
  if (spec.kind === "scanpath") notices.push("Los círculos usan una escala absoluta: el mismo tamaño representa la misma duración en todos los participantes.")
  if (spec.kind === "aoi") notices.push("Permanencia en porcentaje del tiempo observado de cada participante (eje de 0 a 100 %).")
  if (spec.kind === "heatmap" || spec.kind === "scanpath") {
    if (wantsAoiOverlay) notices.push(`Las AOIs dibujadas son las del escenario (geometría común), leídas una sola vez.`)
  }
  const scaleNote =
    info.temporal || spec.kind === "fixation_histogram" || spec.kind === "eeg_psd" || spec.kind === "eeg_spectrogram" || spec.kind === "eeg_topography"
      ? scaleMode === "common"
        ? describeCommonScale(covered, selectedList.length, info.temporal)
        : "Escalas propias: cada tarjeta ajusta sus ejes o colores a sus datos; no compares alturas entre tarjetas."
      : null

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : requestClose())}>
      <DialogContent
        showCloseButton={false}
        aria-describedby="participant-comparison-description"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titleRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreScroll(scrollSnapshot)
          if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
          onClose()
        }}
        data-testid="participant-comparison-dialog"
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-none data-open:animate-none data-closed:animate-none"
      >
        <NestedComparisonBoundary>
          <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 xl:px-6">
            <DialogTitle ref={titleRef} tabIndex={-1} className="min-w-0 flex-1 basis-64 text-lg font-semibold outline-none">
              Comparar participantes · {spec.title}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              {minFixation != null && fixationProbe ? (
                <FixationDurationControl
                  value={minFixation}
                  onChange={setMinFixation}
                  availableDurations={availableFixations}
                  loading={fixationSensitivity.loading}
                  error={fixationSensitivity.error}
                />
              ) : null}
              <ParticipantSelector
                participants={participants}
                labels={participantLabels}
                selected={selected}
                sourceParticipant={spec.sourceParticipant}
                onChange={changeSelection}
              />
              {scaleNote ? (
                <AnalyticsModeSelector
                  value={scaleMode}
                  onValueChange={setScaleMode}
                  options={[
                    { key: "common", label: "Escala común", hint: "Todas las gráficas usan el mismo rango vertical, así sus valores se comparan directamente." },
                    { key: "independent", label: "Escalas propias", hint: "Cada gráfica ajusta su rango vertical a sus datos: se ve mejor la forma, pero las alturas no se comparan entre gráficas." },
                  ]}
                />
              ) : null}
              <Button type="button" variant="outline" size="icon-sm" onClick={requestClose} aria-label="Cerrar comparación" title="Cerrar">
                <X aria-hidden="true" />
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div ref={setScrollElement} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/30" data-testid="participant-comparison-scroll">
              <div className="mx-auto flex min-h-full w-full max-w-(--app-page-max-width) flex-col gap-4 p-3 md:p-4 xl:p-6">
              {restriction ? (
                <ScenarioRequiredMessage className="flex-1">
                  <p className="max-w-xl">{restriction}</p>
                </ScenarioRequiredMessage>
              ) : selectedList.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  No hay participantes seleccionados. Usa «Participantes» para elegirlos.
                </div>
              ) : !ready ? (
                <div role="status" className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                  Preparando la comparación…
                </div>
              ) : (
                <div className="analytics-panel-stack" role="list" aria-label="Participantes comparados">
                  {selectedList.map((code, index) => (
                    <div role="listitem" key={code} className="min-w-0">
                      <ParticipantCard
                        participant={code}
                        label={participantDisplay(code, participantLabels)}
                        index={index}
                        isSource={code === spec.sourceParticipant}
                        projectId={projectId}
                        generation={liveGeneration?.value ?? null}
                        spec={spec}
                        transfer={transfer}
                        frameStimulusTime={frameStimulusTime}
                        tracker={tracker}
                        scaleMode={scaleMode}
                        commonDomains={commonDomains}
                        commonX={commonX}
                        pinTime={activePin ? activePin.displayTime : null}
                        onPin={onPin}
                        onReport={onReport}
                        aoiOverlay={aoiOverlay.data}
                        zoomMemory={zoomMemory}
                        initialZoom={initialZoom}
                      />
                    </div>
                  ))}
                </div>
              )}
              <section
                aria-label="Información de la comparación"
                className="mt-auto space-y-2 border-t border-border pt-4 text-xs text-muted-foreground"
              >
                <DialogDescription id="participant-comparison-description" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span>
                    Escenario: <strong className="font-medium text-foreground">{scenarioLabel(spec.scenario)}</strong>
                  </span>
                  <span>{info.label}</span>
                  {spec.sourceParticipant ? <span>Vista de origen: {participantDisplay(spec.sourceParticipant, participantLabels)}</span> : null}
                  {minFixation != null ? <span className="tabular-nums">Duración mínima de fijación: {minFixation} ms</span> : null}
                  <span className="tabular-nums" data-testid="participant-comparison-counter">
                    {selectedList.length} de {participants.length} participantes
                  </span>
                </DialogDescription>
                {notices.length || scaleNote ? (
                  <ul className="space-y-1 leading-snug" aria-label="Notas de la comparación">
                    {scaleNote ? (
                      <li className="flex gap-1.5" data-testid="participant-comparison-scale-note">
                        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                        {scaleNote}
                      </li>
                    ) : null}
                    {notices.map((notice) => (
                      <li key={notice} className="flex gap-1.5">
                        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                        {notice}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              </div>
            </div>
            {activePin ? (
              <aside
                aria-label="Punto sobre estímulo"
                className="max-h-[45dvh] shrink-0 overflow-y-auto border-t border-border bg-card p-4 lg:max-h-none lg:w-[400px] lg:border-t-0 lg:border-l xl:w-[440px]"
              >
                <p className="mb-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <Crosshair className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Participante <strong className="text-foreground">{activePin.participant}</strong> ·{" "}
                    {activePin.aligned
                      ? `${formatSeconds(activePin.displayTime)} desde el inicio del estímulo`
                      : formatSeconds(activePin.displayTime)}{" "}
                    (grabación {formatSeconds(activePin.sourceTime)})
                    {activePin.aligned
                      ? ". La línea marca el mismo instante del estímulo en todas las tarjetas."
                      : ". La línea marca el mismo segundo de grabación en todas las tarjetas."}
                  </span>
                </p>
                <PinnedStimulusPoint
                  key={`${activePin.participant}:${activePin.sourceTime}`}
                  projectId={projectId}
                  scenario={spec.scenario}
                  pin={activePin}
                  onClear={() => setPin(null)}
                />
              </aside>
            ) : null}
          </div>
        </NestedComparisonBoundary>
      </DialogContent>
    </Dialog>
  )
}

function PinnedStimulusPoint({
  projectId,
  scenario,
  pin,
  onClear,
}: {
  projectId: string
  scenario: string
  pin: PinnedPoint
  onClear: () => void
}) {
  // The existing comparison pipeline with no panels selected fetches only the
  // gaze at that instant, its stimulus frame and the scenario's AOIs.
  const data = useComparisonData({
    projectId,
    participantCode: pin.participant,
    scenario,
    selectedIds: NO_VISUALIZATIONS,
    pinnedSourceTime: pin.sourceTime,
  })
  return (
    <PointOnStimulusPanel
      pinnedTime={pin.sourceTime}
      gaze={data.gazeAt.data}
      gazeLoading={data.gazeAt.loading}
      preview={data.pointPreview}
      aoi={data.pointAoi.data}
      onClear={onClear}
    />
  )
}
