"use client"
import { Slider } from "@/components/ui/slider"

import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useCompareParticipantsSpec } from "../participantComparison/ParticipantComparisonProvider"
import { Clock, Route, Ruler, Timer } from "lucide-react"
import { AnalyticsMessageSurface, ScenarioRequiredMessage } from "./AnalyticsMessageSurface"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { KpiCard } from "@/features/analytics/components/KpiCard"
import { useStimulusImage } from "../participantComparison/cardHooks"
import type { ParticipantComparisonSpec } from "../participantComparison/spec"
import { useAoiMetrics, useScanpathData } from "../hooks/useAnalyticsData"
import { formatDecimal, formatMilliseconds, formatSeconds } from "../aoiInsights"
import { groupLoadNotes } from "../groupMode/groupNotes"
import { GroupUnsupported } from "../groupMode/GroupUnsupported"
import { useGroupView } from "../groupMode/useGroupData"
import {
  formatScanpathObjectiveDetails,
  resolveScanpathRadiusCapMs,
  resolveScanpathTotalDurationS,
} from "../scanpathScale"
import type { FixationDurationMs, ScanpathData } from "../types"
import type { AnalyticsChartNote } from "./AnalyticsChartShell"
import {
  AoiLegend,
  AoiOverlay,
  AoiToggleButton,
  getContainedImageBox,
  type ContainedImageBox,
} from "./AoiOverlay"
import {
  GroupFigureKpis,
  GroupFiguresCard,
  GroupSpatialFooter,
  groupFigureEntries,
  MAX_GROUP_LEGEND_ITEMS,
  type GroupFigureColumn,
  type GroupFigureKpi,
} from "./GroupSpatial"
import { ScanpathLayer } from "./ScanpathLayer"

interface ScanpathTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  minFixationDurationMs: FixationDurationMs
}

const TITLE = "Mapa de recorridos"
const DESCRIPTION =
  "Recorrido visual con nodos numerados por orden de fijación. El mismo tamaño representa la misma duración entre participantes."

/** The tab's figures, from one participant's scanpath; the group modes use the same rule. */
function scanpathFigures(data: ScanpathData): Record<string, number | null> {
  return {
    objectives: data.n_objectives,
    distance: data.total_distance_px,
    mean: data.avg_duration_s * 1000,
    total: resolveScanpathTotalDurationS(data.total_duration_s, data.objectives),
  }
}

const formatCount = (value: number) => (Number.isInteger(value) ? String(value) : formatDecimal(value, 1))
const COLUMNS: GroupFigureColumn[] = [
  { key: "objectives", label: "Recorridos", format: formatCount },
  { key: "distance", label: "Distancia", format: (value) => `${Math.round(value)} px` },
  { key: "mean", label: "Duración media", format: formatMilliseconds },
  { key: "total", label: "Tiempo fijado", format: formatSeconds },
]

/** «Superposición» cards: the view's own cards, each the mean of every participant's figure. */
const GROUP_KPIS: GroupFigureKpi[] = [
  {
    key: "objectives",
    label: "Recorridos",
    unit: "",
    tooltip: "Número de objetivos visuales detectados agrupando fijaciones cercanas",
    Icon: Route,
    iconBgClass: "bg-indigo-100 dark:bg-indigo-900/30",
    iconColorClass: "text-indigo-500",
    labelColorClass: "text-indigo-600 dark:text-indigo-400",
    // An average count keeps a decimal: 12,5 is the figure, not 13.
    decimals: 1,
  },
  {
    key: "distance",
    label: "Distancia",
    unit: "px",
    tooltip: "Distancia total en píxeles entre fijaciones consecutivas asumiendo resolución 1920×1080",
    Icon: Ruler,
    iconBgClass: "bg-emerald-100 dark:bg-emerald-900/30",
    iconColorClass: "text-emerald-500",
    labelColorClass: "text-emerald-600 dark:text-emerald-400",
    decimals: 0,
  },
  {
    key: "mean",
    label: "Promedio",
    unit: "ms",
    tooltip: "Duración media por fijación",
    Icon: Clock,
    iconBgClass: "bg-rose-100 dark:bg-rose-900/30",
    iconColorClass: "text-rose-500",
    labelColorClass: "text-rose-600 dark:text-rose-400",
    decimals: 0,
  },
  {
    key: "total",
    label: "Tiempo fijado",
    unit: "s",
    tooltip: "Tiempo total de permanencia en fijaciones válidas; excluye sacadas, mirada inválida y tiempo fuera del estímulo",
    Icon: Timer,
    iconBgClass: "bg-sky-100 dark:bg-sky-900/30",
    iconColorClass: "text-sky-500",
    labelColorClass: "text-sky-600 dark:text-sky-400",
    decimals: 2,
  },
]

export function ScanpathTab({
  projectId,
  participantCode,
  scenario,
  minFixationDurationMs,
}: ScanpathTabProps) {
  const [showAois, setShowAois] = useState(true)

  const imageContainerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const [letterbox, setLetterbox] = useState<ContainedImageBox | null>(null)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)

  // The chart «Comparar participantes» and the group modes both start from.
  const comparisonSpec = useMemo<ParticipantComparisonSpec>(() => ({
    kind: "scanpath",
    title: TITLE,
    scenario,
    sourceParticipant: participantCode,
    origin: "individual",
    params: { minFixationDurationMs, showAois },
  }), [minFixationDurationMs, participantCode, scenario, showAois])
  const groupView = useGroupView(comparisonSpec)
  const groupMode = groupView.unsupportedReason ? null : groupView.mode
  // In a group mode the single recording is not loaded at all.
  const individualParticipant = groupView.active ? null : participantCode

  const { data, loading, error } = useScanpathData(
    projectId,
    individualParticipant,
    scenario,
    minFixationDurationMs
  )

  // «Superposición»: each participant's scanpath, in its colour.
  const groupPaths = useMemo(
    () =>
      groupView.data.successes.flatMap(({ participant, result }) =>
        result.type === "scanpath" && result.data.objectives.length > 0 ? [{ participant, data: result.data }] : []
      ),
    [groupView.data.successes]
  )
  const groupFigures = useMemo(
    () => groupFigureEntries(groupView.data.entries, (result) => (result.type === "scanpath" ? scanpathFigures(result.data) : null)),
    [groupView.data.entries]
  )

  // AOI shapes belong to the scenario; in a group mode any participant with data has them.
  const groupAoiSource = groupView.data.loading ? null : (groupPaths[0]?.participant.code ?? null)
  const { data: aoiData, loading: aoiLoading } = useAoiMetrics(
    projectId,
    groupView.active ? groupAoiSource : participantCode,
    scenario,
    minFixationDurationMs
  )
  const aois = aoiData?.aois ?? []
  const radiusCapMs = resolveScanpathRadiusCapMs(data?.radius_scale)
  const figures = data ? scanpathFigures(data) : null

  const computeLetterbox = useCallback(() => {
    setLetterbox(getContainedImageBox(imageRef.current, imageContainerRef.current))
  }, [])

  // Recalculate on window resize
  const scenarioFileId = groupView.active
    ? (groupPaths.find((path) => path.data.scenario_file_id)?.data.scenario_file_id ?? null)
    : (data?.scenario_file_id ?? null)
  const scenarioImageUrl = useStimulusImage(projectId, scenarioFileId).url
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

  // Nothing to compare until the view can draw its own chart.
  useCompareParticipantsSpec(scenario === "all" ? null : () => comparisonSpec)

  if (scenario === "all" && !groupView.active) {
    return (
      <div className="analytics-stack">
        <Card>
          <CardHeader>
            <CardTitle>{TITLE}</CardTitle>
            <CardDescription>{DESCRIPTION}</CardDescription>
          </CardHeader>
          <CardContent>
            <ScenarioRequiredMessage label="el mapa de recorridos" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // The stimulus with the scanpaths drawn on it, pinned to the measured box.
  const stimulus = (renderPaths: (box: ContainedImageBox) => ReactNode) => (
    <div className="relative" ref={imageContainerRef} data-testid="scanpath-stimulus">
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
      {showAois && (
        <AoiOverlay aois={aois} box={letterbox} className="z-10" />
      )}
      {letterbox && scenarioImageUrl && (
        <svg
          className="pointer-events-none absolute inset-0 z-20"
          width="100%"
          height="100%"
          viewBox={`0 0 ${letterbox.cW} ${letterbox.cH}`}
        >
          {renderPaths(letterbox)}
        </svg>
      )}
    </div>
  )

  const controls = (
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
  )

  const groupContent = () => {
    const groupData = groupView.data
    const many = groupPaths.length > MAX_GROUP_LEGEND_ITEMS
    const notes: AnalyticsChartNote[] = [
      {
        id: "group-how",
        label: many ? `${groupPaths.length} participantes` : "Cómo se lee",
        detail: (
          <>
            <span>Cada recorrido es un participante, en su color; los números siguen el orden de sus fijaciones.</span>
            <span>El mismo tamaño representa la misma duración en todos.</span>
            {many ? <span>Cada color es un participante; la tabla de estadísticas muestra el de cada uno.</span> : null}
          </>
        ),
      },
      ...groupLoadNotes(groupData),
    ]
    let body: ReactNode
    if (groupData.total === 0) {
      body = <AnalyticsMessageSurface className="analytics-state-frame">Elige al menos un participante en «Participantes».</AnalyticsMessageSurface>
    } else if (groupPaths.length === 0) {
      body = groupData.loading ? (
        <div className="analytics-state-frame relative" role="status">
          <Skeleton className="absolute inset-0 animate-pulse rounded-lg bg-muted" />
          <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Cargando {groupData.settled} de {groupData.total} participantes…
          </span>
        </div>
      ) : (
        <AnalyticsMessageSurface className="analytics-state-frame">
          Ninguno de los participantes elegidos tiene recorridos en este escenario.
        </AnalyticsMessageSurface>
      )
    } else if (!scenarioFileId) {
      body = (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          No se encontró imagen del escenario seleccionado.
        </div>
      )
    } else {
      body = stimulus((box) =>
        groupPaths.map(({ participant, data: path }) => (
          <g key={participant.code} data-participant={participant.code} data-testid="group-scanpath">
            <ScanpathLayer
              objectives={path.objectives}
              box={box}
              radiusCapMs={resolveScanpathRadiusCapMs(path.radius_scale)}
              color={participant.color}
              dash={participant.dash}
              describe={(objective) => `${participant.label}. ${formatScanpathObjectiveDetails(objective)}`}
              testId={(objective) => `group-scanpath-${participant.code}-${objective.id}`}
            />
          </g>
        ))
      )
    }
    return (
      <>
        <GroupFigureKpis kpis={GROUP_KPIS} entries={groupFigures} four />
        {body}
        <GroupSpatialFooter participants={groupPaths.map((path) => path.participant)} notes={notes} />
        {controls}
      </>
    )
  }

  return (
    <div className="analytics-stack">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <CardTitle>{TITLE}</CardTitle>
            <CardDescription>
              {groupMode
                ? "Recorrido visual de varios participantes, cada uno con su color. El mismo tamaño representa la misma duración en todos."
                : DESCRIPTION}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {groupView.unsupportedReason ? (
            <GroupUnsupported reason={groupView.unsupportedReason} className="analytics-state-frame" />
          ) : groupMode ? (
            groupContent()
          ) : !participantCode ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Selecciona un participante para ver el mapa de recorridos.
            </div>
          ) : (
            <>
              <div className="analytics-kpi-grid analytics-kpi-grid-four">
                <KpiCard
                  label="Recorridos"
                  value={figures?.objectives}
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
                  value={figures?.distance}
                  unit="px"
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
                  value={figures?.mean}
                  unit="ms"
                  description="Duración media por fijación"
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
                  value={figures?.total}
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
                <Skeleton className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
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
                      {stimulus((box) => (
                        <ScanpathLayer objectives={visibleObjectives} box={box} radiusCapMs={radiusCapMs} />
                      ))}
                      {controls}
                      {/* Playback slider */}
                      {data.objectives.length > 1 && (
                        <div className="mt-4 flex items-center gap-4 rounded-xl border border-border bg-muted/30 px-5 py-3">
                          <span className="shrink-0 text-sm font-medium text-foreground">
                            Fijación {shown} de {total}
                          </span>
                          <Slider
                            aria-label="Fijaciones visibles"
                            min={1}
                            max={total}
                            step={1}
                            value={[shown]}
                            onValueChange={([value]) => setVisibleCount(value)}
                          />
                          {shown < total && (
                            <Button size="sm" variant="outline"
                              type="button"
                              onClick={() => setVisibleCount(total)}
                              className="shrink-0"
                            >
                              Ver todos
                            </Button>
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

      {groupMode ? (
        <GroupFiguresCard
          entries={groupFigures}
          columns={COLUMNS}
          detail="Las mismas cifras que las tarjetas del mapa de recorridos de un participante."
        />
      ) : null}
    </div>
  )
}
