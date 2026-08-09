"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  LoaderCircle,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card"
import { useAuth } from "@/lib/providers/AuthProvider"
import {
  EegPsdChart,
  EegSpectrogramGrid,
  FixationHistogramChart,
  TemporalLineChart,
  type TemporalChartPoint,
} from "./ComparisonCharts"
import type { ComparisonChartConfig } from "../types"
import { ComparisonStatistics } from "./ComparisonStatistics"
import { CorrelationMatrixSection } from "./CorrelationMatrixSection"
import {
  loadComparisonPreferences,
  saveComparisonPreferences,
} from "./comparisonPreferences"
import {
  canPinComparisonPoint,
  isComparisonPointActive,
} from "./chartInteraction"
import {
  AoiPanel,
  HeatmapPanel,
  PointOnStimulusPanel,
  ScanpathPanel,
  ScenarioRequiredMessage,
} from "./SpatialPanels"
import { VisualizationSelector } from "./VisualizationSelector"
import {
  VISUALIZATION_BY_ID,
  VISUALIZATION_REGISTRY,
  availableVisualizationIds,
  defaultVisualizationIds,
  type VisualizationId,
} from "./registry"
import { useComparisonData } from "./useComparisonData"

export interface ComparisonTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  availableSensors: string[]
}

interface ComparisonWorkspaceProps extends ComparisonTabProps {
  preferenceUserId: string | null
}

type PointOwnerId = Extract<VisualizationId, "pupil" | "distance" | "gaze">

interface PinnedTime {
  context: string
  sourceTime: number
  ownerId: PointOwnerId
}

function finiteOrGap(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NaN
}

function chartToTemporalPoints(
  chart: ComparisonChartConfig | null | undefined
): TemporalChartPoint[] {
  if (!chart) return []
  return chart.data
    .map((row) => {
      const time = finiteOrGap(row.time)
      const sourceTime = finiteOrGap(row.sourceTime ?? row.time)
      if (!Number.isFinite(time) || !Number.isFinite(sourceTime)) return null
      const point: TemporalChartPoint = { time, sourceTime }
      for (const series of chart.series) {
        point[series.key] = finiteOrGap(row[series.key])
      }
      return point
    })
    .filter((point): point is TemporalChartPoint => point != null)
}

function PanelState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean
  error: string | null
  empty: boolean
  children: ReactNode
}) {
  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Cargando
        visualización…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 px-6 text-center text-sm text-destructive">
        <AlertCircle className="h-6 w-6" />
        <span>{error}</span>
      </div>
    )
  }
  if (empty) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
        No hay datos para los filtros seleccionados.
      </div>
    )
  }
  return children
}

function ComparisonPanel({
  id,
  collapsed,
  onToggle,
  children,
}: {
  id: VisualizationId
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const definition = VISUALIZATION_BY_ID[id]
  const contentId = `comparison-panel-${id}`
  return (
    <Card>
      <CardHeader className="p-0 xl:p-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className="flex w-full items-start gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset xl:p-6"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <definition.Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{definition.label}</CardTitle>
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {definition.sensor}
              </span>
            </span>
            <CardDescription className="mt-1">
              {definition.description}
            </CardDescription>
          </span>
          {collapsed ? (
            <ChevronDown className="mt-1 h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronUp className="mt-1 h-5 w-5 text-muted-foreground" />
          )}
        </button>
      </CardHeader>
      {!collapsed ? (
        <div id={contentId}>
          <CardContent>{children}</CardContent>
        </div>
      ) : null}
    </Card>
  )
}

export function ComparisonTab(props: ComparisonTabProps) {
  const { currentUser } = useAuth()
  const preferenceUserId = currentUser?.id ?? null

  // Remount per user/project so each workspace restores its own applied views
  // while participant and scenario changes keep the current layout intact.
  return (
    <ComparisonWorkspace
      key={`${preferenceUserId ?? "anonymous"}:${props.projectId}`}
      {...props}
      preferenceUserId={preferenceUserId}
    />
  )
}

function ComparisonWorkspace({
  projectId,
  participantCode,
  scenario,
  availableSensors,
  preferenceUserId,
}: ComparisonWorkspaceProps) {
  const availableIds = useMemo(
    () => availableVisualizationIds(availableSensors),
    [availableSensors]
  )
  const [selectedIds, setSelectedIds] = useState<VisualizationId[]>(() => {
    const defaults = defaultVisualizationIds(availableSensors)
    if (!preferenceUserId || typeof window === "undefined") return defaults

    return (
      loadComparisonPreferences(
        window.localStorage,
        preferenceUserId,
        projectId,
        availableIds
      ) ?? defaults
    )
  })
  const [collapsedIds, setCollapsedIds] = useState<Set<VisualizationId>>(
    () => new Set()
  )
  const [pinState, setPinState] = useState<PinnedTime | null>(null)
  const pinContext = `${participantCode ?? "none"}\u0000${scenario}`
  const pinned =
    pinState?.context === pinContext && selectedIds.includes(pinState.ownerId)
      ? pinState
      : null
  const pointPinningEnabled = canPinComparisonPoint(participantCode, scenario)
  const pointActive = Boolean(
    pinned &&
    isComparisonPointActive(participantCode, scenario, pinned.sourceTime)
  )
  const pointInteractionHint = pointPinningEnabled
    ? "Haz clic en un punto para ver el estímulo."
    : "Selecciona un participante y un escenario para ver el estímulo al hacer clic."

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setPinState(null)
    })
    return () => {
      cancelled = true
    }
  }, [pinContext])

  const data = useComparisonData({
    projectId,
    participantCode,
    scenario,
    selectedIds,
    pinnedSourceTime: pinned?.sourceTime ?? null,
  })

  const chartById = useMemo(() => {
    return new Map(
      (data.comparisonCharts.data?.charts ?? []).map((chart) => [
        chart.id,
        chart,
      ])
    )
  }, [data.comparisonCharts.data?.charts])
  const chartRowsById = useMemo(() => {
    return new Map(
      [...chartById.entries()].map(([id, chart]) => [
        id,
        chartToTemporalPoints(chart),
      ])
    )
  }, [chartById])
  const pinnedDisplayTime = pinned?.sourceTime ?? null

  const pinEyePoint = (ownerId: PointOwnerId, point: TemporalChartPoint) => {
    if (!pointPinningEnabled) return
    setPinState({
      context: pinContext,
      sourceTime: point.sourceTime,
      ownerId,
    })
  }

  const toggleCollapsed = (id: VisualizationId) => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applySelection = (ids: VisualizationId[]) => {
    setSelectedIds(ids)
    if (preferenceUserId && typeof window !== "undefined") {
      saveComparisonPreferences(
        window.localStorage,
        preferenceUserId,
        projectId,
        ids
      )
    }
    setCollapsedIds(
      (current) => new Set([...current].filter((id) => ids.includes(id)))
    )
    setPinState((current) => {
      if (current && ids.includes(current.ownerId)) {
        return current
      }
      return null
    })
  }

  const renderTemporalPanel = (
    id: Extract<
      VisualizationId,
      "pupil" | "distance" | "gaze" | "gsr" | "eeg_timeseries"
    >,
    fallbackYLabel: string,
    onPin?: (point: TemporalChartPoint) => void,
    interactionHint?: string
  ) => {
    const chart = chartById.get(id)
    const chartRows = chartRowsById.get(id) ?? []

    return (
      <PanelState
        loading={data.comparisonCharts.loading}
        error={data.comparisonCharts.error}
        empty={!chartRows.length || !chart?.series.length}
      >
        <TemporalLineChart
          data={chartRows}
          series={chart?.series ?? []}
          yLabel={chart?.y_label ?? fallbackYLabel}
          xLabel={chart?.x_label}
          xDomain={chart?.x_domain}
          peaks={chart?.peaks}
          pinnedTime={id === "gsr" ? null : pinnedDisplayTime}
          interactionHint={interactionHint}
          synchronized={chart?.synchronized ?? id !== "gsr"}
          height={chart?.height ?? (id === "eeg_timeseries" ? 380 : 320)}
          onPin={onPin}
        />
      </PanelState>
    )
  }

  const renderPanel = (id: VisualizationId) => {
    switch (id) {
      case "pupil":
        return renderTemporalPanel(
          "pupil",
          "Diametro (mm)",
          pointPinningEnabled
            ? (point) => pinEyePoint("pupil", point)
            : undefined,
          pointInteractionHint
        )
      case "distance":
        return renderTemporalPanel(
          "distance",
          "Distancia (cm)",
          pointPinningEnabled
            ? (point) => pinEyePoint("distance", point)
            : undefined,
          pointInteractionHint
        )
      case "gaze":
        return renderTemporalPanel(
          "gaze",
          "Posicion (%)",
          pointPinningEnabled ? (point) => pinEyePoint("gaze", point) : undefined,
          pointInteractionHint
        )
      case "gsr":
        return renderTemporalPanel("gsr", "Conductancia (uS)")
      case "eeg_timeseries":
        return renderTemporalPanel("eeg_timeseries", "Amplitud (uV)")
      case "fixation_histogram":
        return (
          <PanelState
            loading={data.fixationHistogram.loading}
            error={data.fixationHistogram.error}
            empty={!data.fixationHistogram.data?.bins.length}
          >
            {data.fixationHistogram.data ? (
              <FixationHistogramChart data={data.fixationHistogram.data} />
            ) : null}
          </PanelState>
        )
      case "eeg_psd":
        return (
          <PanelState
            loading={data.eegPsd.loading}
            error={data.eegPsd.error}
            empty={!data.eegPsd.data?.frequency.length}
          >
            {data.eegPsd.data ? <EegPsdChart data={data.eegPsd.data} /> : null}
          </PanelState>
        )
      case "eeg_spectrogram":
        return (
          <PanelState
            loading={data.eegSpectrogram.loading}
            error={data.eegSpectrogram.error}
            empty={
              !data.eegSpectrogram.data?.channels.length ||
              !data.eegSpectrogram.data.time.length ||
              !data.eegSpectrogram.data.frequency.length
            }
          >
            {data.eegSpectrogram.data ? (
              <EegSpectrogramGrid data={data.eegSpectrogram.data} />
            ) : null}
          </PanelState>
        )
      case "heatmap":
        return scenario === "all" ? (
          <ScenarioRequiredMessage label="el mapa de calor" />
        ) : (
          <HeatmapPanel
            fixation={data.fixation.data}
            loading={data.fixation.loading || data.heatmap.loading}
            error={data.fixation.error || data.heatmap.error}
            image={data.staticImage}
            overlayUrl={data.heatmap.overlayUrl}
            aoi={data.aoi.data}
          />
        )
      case "scanpath":
        return scenario === "all" ? (
          <ScenarioRequiredMessage label="el mapa de recorridos" />
        ) : (
          <ScanpathPanel
            data={data.scanpath.data}
            loading={data.scanpath.loading}
            error={data.scanpath.error}
            image={data.staticImage}
            aoi={data.aoi.data}
          />
        )
      case "aoi":
        return scenario === "all" ? (
          <ScenarioRequiredMessage label="la comparativa AOI" />
        ) : (
          <AoiPanel
            data={data.aoi.data}
            loading={data.aoi.loading}
            error={data.aoi.error}
            image={data.staticImage}
          />
        )
    }
  }

  const panelIds = VISUALIZATION_REGISTRY.filter((item) =>
    selectedIds.includes(item.id)
  ).map((item) => item.id)

  return (
    <div className="analytics-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight 2xl:text-3xl">
            Comparativas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lectura visual y estadística de las señales seleccionadas en un solo
            espacio.
          </p>
        </div>
        <VisualizationSelector
          appliedIds={selectedIds}
          availableIds={availableIds}
          onApply={applySelection}
        />
      </div>

      {!participantCode ? (
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center pt-6 text-center text-sm text-muted-foreground">
            Selecciona un participante para cargar las visualizaciones
            comparativas.
          </CardContent>
        </Card>
      ) : selectedIds.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 pt-6 text-center text-sm text-muted-foreground">
            <Eye className="h-8 w-8 text-muted-foreground/40" />
            No hay visualizaciones seleccionadas. Usa “Gráficas a comparar” para
            agregarlas.
          </CardContent>
        </Card>
      ) : (
        <div className="analytics-panel-stack">
          {panelIds.map((id) => (
            <ComparisonPanel
              key={id}
              id={id}
              collapsed={collapsedIds.has(id)}
              onToggle={() => toggleCollapsed(id)}
            >
              {renderPanel(id)}
              {pointActive && pinned?.ownerId === id ? (
                <div className="mt-5 border-t border-border pt-5 2xl:mt-6 2xl:pt-6">
                  <PointOnStimulusPanel
                    pinnedTime={pinnedDisplayTime}
                    gaze={data.gazeAt.data}
                    gazeLoading={data.gazeAt.loading}
                    preview={data.pointPreview}
                    aoi={data.pointAoi.data}
                    onClear={() => setPinState(null)}
                  />
                </div>
              ) : null}
            </ComparisonPanel>
          ))}
        </div>
      )}

      <ComparisonStatistics
        selectedIds={selectedIds}
        data={data}
        pinnedTime={pinnedDisplayTime}
      />

      <CorrelationMatrixSection
        projectId={projectId}
        participantCode={participantCode}
        scenario={scenario}
        selectedViewIds={selectedIds}
      />
    </div>
  )
}
