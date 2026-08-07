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
  EEG_CHANNEL_COLORS,
  FixationHistogramChart,
  TemporalLineChart,
  type TemporalChartPoint,
  type TemporalSeries,
} from "./ComparisonCharts"
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

function firstFinite(values: number[] | undefined) {
  return values?.find((value) => Number.isFinite(value)) ?? null
}

function toRelativeTime(sourceTime: number, origin: number) {
  return Math.round((sourceTime - origin) * 10000) / 10000
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

  // Pupil, gaze, distance and EEG endpoints retain their source timestamps.
  // Use one loaded origin for every compatible chart so a shared x value always
  // identifies the same real sample (and therefore the same gaze preview).
  const sharedTemporalOrigin = useMemo(() => {
    const candidates = [
      firstFinite(data.pupil.data?.time),
      firstFinite(data.distance.data?.time),
      firstFinite(data.gaze.data?.time),
      firstFinite(data.eegTimeseries.data?.time),
    ].filter((value): value is number => value != null)
    return candidates.length ? Math.min(...candidates) : null
  }, [
    data.distance.data?.time,
    data.eegTimeseries.data?.time,
    data.gaze.data?.time,
    data.pupil.data?.time,
  ])
  const pinnedDisplayTime = pinned
    ? toRelativeTime(
        pinned.sourceTime,
        sharedTemporalOrigin ?? pinned.sourceTime
      )
    : null

  const pupilChart = useMemo<TemporalChartPoint[]>(() => {
    const source = data.pupil.data
    if (!source) return []
    const origin = sharedTemporalOrigin ?? firstFinite(source.time) ?? 0
    return source.time.map((sourceTime, index) => ({
      time: toRelativeTime(sourceTime, origin),
      sourceTime,
      left: finiteOrGap(source.smooth_left[index]),
      right: finiteOrGap(source.smooth_right[index]),
    }))
  }, [data.pupil.data, sharedTemporalOrigin])
  const distanceChart = useMemo<TemporalChartPoint[]>(() => {
    const source = data.distance.data
    if (!source) return []
    const origin = sharedTemporalOrigin ?? firstFinite(source.time) ?? 0
    return source.time.map((sourceTime, index) => ({
      time: toRelativeTime(sourceTime, origin),
      sourceTime,
      distance: finiteOrGap(source.distance_cm[index]),
    }))
  }, [data.distance.data, sharedTemporalOrigin])
  const gazeChart = useMemo<TemporalChartPoint[]>(() => {
    const source = data.gaze.data
    if (!source) return []
    const origin = sharedTemporalOrigin ?? firstFinite(source.time) ?? 0
    return source.time.map((sourceTime, index) => ({
      time: toRelativeTime(sourceTime, origin),
      sourceTime,
      x: finiteOrGap(source.gx_clean[index]),
      y: finiteOrGap(source.gy_clean[index]),
    }))
  }, [data.gaze.data, sharedTemporalOrigin])
  const gsrChart = useMemo<TemporalChartPoint[]>(() => {
    const source = data.gsr.data
    if (!source) return []
    return source.time.map((sourceTime, index) => ({
      // The established GSR endpoint already rebases time to its first valid
      // sample, so it cannot safely participate in cross-endpoint sync.
      time: sourceTime,
      sourceTime,
      gsr: finiteOrGap(source.gsr_smooth[index]),
    }))
  }, [data.gsr.data])
  const eegChart = useMemo<TemporalChartPoint[]>(() => {
    const source = data.eegTimeseries.data
    if (!source) return []
    const origin = sharedTemporalOrigin ?? firstFinite(source.time) ?? 0
    return source.time.map((sourceTime, index) => {
      const point: TemporalChartPoint = {
        time: toRelativeTime(sourceTime, origin),
        sourceTime,
      }
      for (const channel of source.channels) {
        point[channel] = finiteOrGap(source.smooth[channel]?.[index])
      }
      return point
    })
  }, [data.eegTimeseries.data, sharedTemporalOrigin])

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

  const renderPanel = (id: VisualizationId) => {
    const pinnedTime = pinnedDisplayTime
    switch (id) {
      case "pupil":
        return (
          <PanelState
            loading={data.pupil.loading}
            error={data.pupil.error}
            empty={!pupilChart.length}
          >
            <TemporalLineChart
              data={pupilChart}
              series={[
                {
                  key: "left",
                  label: "Pupila izquierda",
                  color: "#F87171",
                  unit: "mm",
                },
                {
                  key: "right",
                  label: "Pupila derecha",
                  color: "#818CF8",
                  unit: "mm",
                },
              ]}
              yLabel="Diámetro (mm)"
              pinnedTime={pinnedTime}
              interactionHint={pointInteractionHint}
              onPin={
                pointPinningEnabled
                  ? (point) => pinEyePoint("pupil", point)
                  : undefined
              }
            />
          </PanelState>
        )
      case "distance":
        return (
          <PanelState
            loading={data.distance.loading}
            error={data.distance.error}
            empty={!distanceChart.length}
          >
            <TemporalLineChart
              data={distanceChart}
              series={[
                {
                  key: "distance",
                  label: "Distancia",
                  color: "#8B5CF6",
                  unit: "cm",
                },
              ]}
              yLabel="Distancia (cm)"
              pinnedTime={pinnedTime}
              interactionHint={pointInteractionHint}
              onPin={
                pointPinningEnabled
                  ? (point) => pinEyePoint("distance", point)
                  : undefined
              }
            />
          </PanelState>
        )
      case "gaze":
        return (
          <PanelState
            loading={data.gaze.loading}
            error={data.gaze.error}
            empty={!gazeChart.length}
          >
            <TemporalLineChart
              data={gazeChart}
              series={[
                { key: "x", label: "Posición X", color: "#F87171", unit: "%" },
                { key: "y", label: "Posición Y", color: "#8B5CF6", unit: "%" },
              ]}
              yLabel="Posición (%)"
              pinnedTime={pinnedTime}
              interactionHint={pointInteractionHint}
              onPin={
                pointPinningEnabled
                  ? (point) => pinEyePoint("gaze", point)
                  : undefined
              }
            />
          </PanelState>
        )
      case "gsr":
        return (
          <PanelState
            loading={data.gsr.loading}
            error={data.gsr.error}
            empty={!gsrChart.length}
          >
            <TemporalLineChart
              data={gsrChart}
              series={[
                {
                  key: "gsr",
                  label: "GSR suavizada",
                  color: "#10B981",
                  unit: "µS",
                },
              ]}
              yLabel="Conductancia (µS)"
              pinnedTime={null}
              synchronized={false}
            />
          </PanelState>
        )
      case "eeg_timeseries": {
        const source = data.eegTimeseries.data
        const series: TemporalSeries[] = (source?.channels ?? []).map(
          (channel) => ({
            key: channel,
            label: channel.toUpperCase(),
            color: EEG_CHANNEL_COLORS[channel] ?? "#64748B",
            unit: "µV",
          })
        )
        return (
          <PanelState
            loading={data.eegTimeseries.loading}
            error={data.eegTimeseries.error}
            empty={!eegChart.length || !series.length}
          >
            <TemporalLineChart
              data={eegChart}
              series={series}
              yLabel="Amplitud (µV)"
              pinnedTime={pinnedTime}
              height={380}
            />
          </PanelState>
        )
      }
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
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight xl:text-3xl">
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
        <div className="space-y-5">
          {panelIds.map((id) => (
            <ComparisonPanel
              key={id}
              id={id}
              collapsed={collapsedIds.has(id)}
              onToggle={() => toggleCollapsed(id)}
            >
              {renderPanel(id)}
              {pointActive && pinned?.ownerId === id ? (
                <div className="mt-6 border-t border-border pt-6">
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
