"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { HintTooltip } from "@/components/HintTooltip"
import { Button } from "@/components/ui/button"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useCompareParticipantsSpec } from "../participantComparison/ParticipantComparisonProvider"
import { Clock, Hash, Timer } from "lucide-react"
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
import {
  useAoiMetrics,
  useFixationData,
  useGroupHeatmapOverlay,
  useHeatmapOverlay,
} from "../hooks/useAnalyticsData"
import { formatDecimal, formatMilliseconds } from "../aoiInsights"
import { useGroupMode } from "../groupMode/GroupModeProvider"
import { groupLoadNotes } from "../groupMode/groupNotes"
import { GroupUnsupported } from "../groupMode/GroupUnsupported"
import { useGroupView } from "../groupMode/useGroupData"
import type { FixationData, FixationDurationMs, FixationPoint } from "../types"
import type { AnalyticsChartNote } from "./AnalyticsChartShell"
import {
  AoiLegend,
  AoiOverlay,
  AoiToggleButton,
  containedImageBoxStyle,
  getContainedImageBox,
  type ContainedImageBox,
} from "./AoiOverlay"
import {
  GroupFigureKpis,
  GroupFiguresCard,
  GroupFixationLayer,
  GroupSpatialFooter,
  groupFigureEntries,
  MAX_GROUP_LEGEND_ITEMS,
  type GroupFigureColumn,
  type GroupFigureKpi,
} from "./GroupSpatial"

interface HeatmapTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  minFixationDurationMs: FixationDurationMs
}

const TITLE = "Mapa de calor"
const DESCRIPTION =
  "Representación visual de la densidad de atención sobre el estímulo basada en la duración y frecuencia de las fijaciones."
const OVERLAY_OPACITY = 0.82

/** The tab's figures, from one participant's fixations; the group modes use the same rule. */
function heatmapFigures(fixation: FixationData): Record<string, number | null> {
  return {
    fixations: fixation.stats.n_fixations,
    longest: fixation.stats.max_duration_s * 1000,
    mean: fixation.stats.avg_duration_s * 1000,
  }
}

const KPIS: GroupFigureKpi[] = [
  {
    key: "fixations",
    label: "Fijaciones",
    unit: "",
    Icon: Hash,
    iconBgClass: "bg-orange-100 dark:bg-orange-900/30",
    iconColorClass: "text-orange-500",
    labelColorClass: "text-orange-600 dark:text-orange-400",
    decimals: 0,
  },
  {
    key: "longest",
    label: "Fijación más larga",
    unit: "ms",
    Icon: Timer,
    iconBgClass: "bg-rose-100 dark:bg-rose-900/30",
    iconColorClass: "text-rose-500",
    labelColorClass: "text-rose-600 dark:text-rose-400",
    decimals: 0,
  },
  {
    key: "mean",
    label: "Duración media",
    unit: "ms",
    Icon: Clock,
    iconBgClass: "bg-amber-100 dark:bg-amber-900/30",
    iconColorClass: "text-amber-500",
    labelColorClass: "text-amber-600 dark:text-amber-400",
    decimals: 0,
  },
]
// An average count keeps a decimal: 12,5 fixations is the figure, not 13.
const GROUP_KPIS: GroupFigureKpi[] = KPIS.map((kpi) => (kpi.key === "fixations" ? { ...kpi, decimals: 1 } : kpi))
const INDIVIDUAL_DESCRIPTIONS: Record<string, string> = { fixations: "Total en el escenario" }

const formatCount = (value: number) => (Number.isInteger(value) ? String(value) : formatDecimal(value, 1))
const COLUMNS: GroupFigureColumn[] = [
  { key: "fixations", label: "Fijaciones", format: formatCount },
  { key: "longest", label: "Fijación más larga", format: formatMilliseconds },
  { key: "mean", label: "Duración media", format: formatMilliseconds },
]

// The heatmap PNG, individual or of the group, pinned to the measured stimulus box.
function HeatmapOverlayImage({ src, alt, box, testId }: { src: string; alt: string; box: ContainedImageBox; testId?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden="true"
      data-testid={testId}
      className="pointer-events-none z-10"
      style={{ ...containedImageBoxStyle(box), opacity: OVERLAY_OPACITY }}
    />
  )
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{children}</div>
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

  // The chart «Comparar participantes» and the group modes both start from.
  const comparisonSpec = useMemo<ParticipantComparisonSpec>(() => ({
    kind: "heatmap",
    title: TITLE,
    scenario,
    sourceParticipant: participantCode,
    origin: "individual",
    params: { minFixationDurationMs, showAois },
  }), [minFixationDurationMs, participantCode, scenario, showAois])
  const group = useGroupMode()
  const groupView = useGroupView(comparisonSpec)
  const groupMode = groupView.unsupportedReason ? null : groupView.mode
  // In a group mode the single recording is not loaded at all.
  const individualParticipant = groupView.active ? null : participantCode

  // Fixation stats (for KPI cards)
  const { data: fixData, loading: fixLoading } = useFixationData(
    projectId,
    individualParticipant,
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
    individualParticipant,
    scenario,
    transformToken,
    cacheGeneration,
    minFixationDurationMs
  )

  // Group modes: each participant's fixations (never a heatmap image per participant).
  const groupFixations = useMemo(
    () =>
      groupView.data.successes.flatMap(({ participant, result }) =>
        result.type === "heatmap" ? [{ participant, fixation: result.fixation }] : []
      ),
    [groupView.data.successes]
  )
  const groupFigures = useMemo(
    () => groupFigureEntries(groupView.data.entries, (result) => (result.type === "heatmap" ? heatmapFigures(result.fixation) : null)),
    [groupView.data.entries]
  )
  const groupLayers = useMemo<Array<{ participant: (typeof groupFixations)[number]["participant"]; fixations: FixationPoint[] }>>(
    () => groupFixations.map(({ participant, fixation }) => ({ participant, fixations: fixation.fixations })),
    [groupFixations]
  )
  // «Promedio»: one map for every chosen participant, from the server.
  const groupCodes = useMemo(() => group.selected.map((participant) => participant.code), [group.selected])
  const groupHeatmap = useGroupHeatmapOverlay(
    groupMode === "average" ? projectId : null,
    groupCodes,
    scenario,
    minFixationDurationMs,
    group.generation
  )

  // AOI shapes belong to the scenario; in a group mode any participant with data has them.
  const groupAoiSource = groupView.data.loading ? null : (groupFixations[0]?.participant.code ?? null)
  const {
    data: aoiData,
    loading: aoiLoading,
  } = useAoiMetrics(projectId, groupView.active ? groupAoiSource : participantCode, scenario, minFixationDurationMs)

  const loading = fixLoading || heatmapLoading
  const aois = aoiData?.aois ?? []

  const computeLetterbox = useCallback(() => {
    setLetterbox(
      getContainedImageBox(imageRef.current, imageContainerRef.current)
    )
  }, [])

  const scenarioFileId = groupView.active
    ? (groupFixations.find(({ fixation }) => fixation.scenario_file_id)?.fixation.scenario_file_id ?? null)
    : (fixData?.scenario_file_id ?? null)
  const scenarioImageUrl = useStimulusImage(projectId, scenarioFileId).url
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
  }, [computeLetterbox, scenarioImageUrl, groupMode])

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
            <ScenarioRequiredMessage label="el mapa de calor" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // The stimulus with what each mode draws on it, pinned to the measured box.
  const stimulus = (renderOverlay: (box: ContainedImageBox) => ReactNode) => (
    <div
      className="relative overflow-hidden rounded-lg"
      ref={imageContainerRef}
      data-testid="heatmap-stimulus"
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

      {scenarioImageUrl && letterbox ? renderOverlay(letterbox) : null}

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
  )

  const controls = (
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
  )

  const groupNotes = (): AnalyticsChartNote[] => {
    const many = groupLayers.length > MAX_GROUP_LEGEND_ITEMS
    if (groupMode === "overlay") {
      return [
        {
          id: "group-how",
          label: many ? `${groupLayers.length} participantes` : "Cómo se lee",
          detail: (
            <>
              <span>Cada punto es una fijación, del color de su participante.</span>
              <span>Su área crece con la duración: el mismo tamaño es la misma duración en todos.</span>
              {many ? <span>Cada color es un participante; la tabla de estadísticas muestra el de cada uno.</span> : null}
            </>
          ),
        },
        ...groupLoadNotes(groupView.data),
      ]
    }
    const skipped = groupHeatmap.skipped ?? []
    const labelOf = (code: string) => group.styleOf(code)?.label ?? `Participante ${code}`
    return [
      {
        id: "group-how",
        label: "Cómo se calcula",
        detail: (
          <>
            <span>Un solo mapa con las fijaciones de los participantes elegidos.</span>
            <span>
              Cada participante pesa lo mismo: el peso de sus fijaciones suma lo mismo para todos, así que quien
              mira más tiempo no tapa a los demás.
            </span>
          </>
        ),
      },
      ...(skipped.length > 0
        ? [{
            id: "group-skipped",
            label: skipped.length === 1 ? "1 sin fijaciones" : `${skipped.length} sin fijaciones`,
            detail: (
              <>
                <span>No tienen fijaciones en este escenario con la duración mínima elegida, así que no entran en el mapa.</span>
                {skipped.map((code) => <span key={code}>{labelOf(code)}</span>)}
              </>
            ),
          }]
        : []),
      // The map's own chip already names who has no fixations.
      ...groupLoadNotes(groupView.data).filter((note) => !(groupHeatmap.skipped && note.id === "group-empty")),
    ]
  }

  const groupStimulus = () => {
    const data = groupView.data
    if (data.total === 0) {
      return <AnalyticsMessageSurface className="analytics-state-frame">Elige al menos un participante en «Participantes».</AnalyticsMessageSurface>
    }
    if (groupMode === "average" && groupHeatmap.error) {
      return <AnalyticsMessageSurface className="analytics-state-frame">{groupHeatmap.error}</AnalyticsMessageSurface>
    }
    if (groupFixations.length === 0 || (groupMode === "average" && groupHeatmap.loading)) {
      if (data.loading || groupHeatmap.loading) {
        return (
          <div className="analytics-state-frame relative" role="status">
            <Skeleton className="absolute inset-0 animate-pulse rounded-lg bg-muted" />
            <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Cargando {data.settled} de {data.total} participantes…
            </span>
          </div>
        )
      }
      return (
        <AnalyticsMessageSurface className="analytics-state-frame">
          Ninguno de los participantes elegidos tiene fijaciones en este escenario.
        </AnalyticsMessageSurface>
      )
    }
    if (!scenarioFileId) return <CenteredMessage>No se encontró imagen del escenario seleccionado.</CenteredMessage>
    return stimulus((box) =>
      groupMode === "average" ? (
        groupHeatmap.overlayUrl ? (
          <HeatmapOverlayImage src={groupHeatmap.overlayUrl} alt="Mapa de calor del grupo" box={box} testId="group-heatmap-overlay" />
        ) : null
      ) : (
        <GroupFixationLayer layers={groupLayers} box={box} />
      )
    )
  }

  return (
    <div className="analytics-stack">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <CardTitle>{TITLE}</CardTitle>
            <CardDescription>
              {groupMode === "overlay"
                ? "Fijaciones de varios participantes sobre el estímulo, cada uno con su color."
                : groupMode === "average"
                  ? "Densidad de atención de varios participantes sobre el estímulo; cada uno pesa lo mismo."
                  : DESCRIPTION}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {groupView.unsupportedReason ? (
            <GroupUnsupported reason={groupView.unsupportedReason} className="analytics-state-frame" />
          ) : groupMode ? (
            <>
              <GroupFigureKpis kpis={GROUP_KPIS} entries={groupFigures} />
              {groupStimulus()}
              <GroupSpatialFooter participants={groupMode === "overlay" ? groupLayers.map((layer) => layer.participant) : []} notes={groupNotes()} />
              {controls}
            </>
          ) : !participantCode ? (
            <CenteredMessage>Selecciona un participante para ver el mapa de calor.</CenteredMessage>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="analytics-kpi-grid">
                {KPIS.map(({ key, ...kpi }) => (
                  <KpiCard
                    key={key}
                    {...kpi}
                    value={fixData ? heatmapFigures(fixData)[key] : null}
                    description={INDIVIDUAL_DESCRIPTIONS[key]}
                    loading={fixLoading}
                    bgClass="bg-card"
                  />
                ))}
              </div>

              {/* Image + overlay area */}
              {loading ? (
                <Skeleton className="analytics-state-frame w-full animate-pulse rounded-lg bg-muted" />
              ) : heatmapError ? (
                <CenteredMessage>Error al cargar el mapa de calor: {heatmapError}</CenteredMessage>
              ) : !fixData || fixData.fixations.length === 0 ? (
                <CenteredMessage>No hay datos de fijación para los filtros seleccionados.</CenteredMessage>
              ) : !fixData.scenario_file_id ? (
                <CenteredMessage>No se encontró imagen del escenario seleccionado.</CenteredMessage>
              ) : (
                <>
                  {stimulus((box) =>
                    overlayUrl ? <HeatmapOverlayImage src={overlayUrl} alt="Mapa de calor" box={box} /> : null
                  )}
                  {controls}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {groupMode ? (
        <GroupFiguresCard
          entries={groupFigures}
          columns={COLUMNS}
          detail="Las mismas cifras que las tarjetas del mapa de calor de un participante."
        />
      ) : null}
    </div>
  )
}
