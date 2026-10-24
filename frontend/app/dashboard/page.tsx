"use client"

import { AnalyticsTabs } from "@/features/analytics/components/AnalyticsTabs"
import { useAnalyticsProjectContext } from "@/features/analytics/hooks/useAnalyticsContext"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import {
  ProjectsApi,
  type ApiProject,
} from "@/features/projects/api/projectsApi"
import { AnalyticsSidebar } from "@/features/analytics/components/AnalyticsSidebar"
import { getProjectSensors, type SensorSelection } from "@/features/analytics/projectSensors"
import { FiltersBar } from "@/features/analytics/components/FiltersBar"
import { participantLabelMap } from "@/features/analytics/participantLabel"
import { PlaceholderTab } from "@/features/analytics/components/PlaceholderTab"
import { PupilDilationTab } from "@/features/analytics/components/PupilDilationTab"
import { GazePointTab } from "@/features/analytics/components/GazePointTab"
import { DeviceDistanceTab } from "@/features/analytics/components/DeviceDistanceTab"
import { EegTab } from "@/features/analytics/components/EegTab"
import { GsrTab } from "@/features/analytics/components/GsrTab"
import { ScanpathTab } from "@/features/analytics/components/ScanpathTab"
import { HeatmapTab } from "@/features/analytics/components/HeatmapTab"
import { FixationHistogramTab } from "@/features/analytics/components/FixationHistogramTab"
import { AoiComparisonTab } from "@/features/analytics/components/AoiComparisonTab"
import { FixationDurationControl } from "@/features/analytics/components/FixationDurationControl"
import { ComparisonTab } from "@/features/analytics/comparison/ComparisonTab"
import { ParticipantComparisonProvider } from "@/features/analytics/participantComparison/ParticipantComparisonProvider"
import { FiltersBarCompareButton } from "@/features/analytics/participantComparison/CompareParticipantsButton"
import type { ComparisonKind } from "@/features/analytics/participantComparison/spec"
import { GroupModeProvider } from "@/features/analytics/groupMode/GroupModeProvider"
import { GroupUnsupported } from "@/features/analytics/groupMode/GroupUnsupported"
import {
  COMPARATIVAS_UNSUPPORTED,
  GROUP_MODE_LABELS,
  groupUnsupportedReason,
  type GroupMode,
} from "@/features/analytics/groupMode/groupSupport"
import {
  useAnalyticsParticipants,
  useAnalyticsScenarios,
  useFixationSensitivity,
} from "@/features/analytics/hooks/useAnalyticsData"
import {
  DEFAULT_FIXATION_DURATION_MS,
  type FixationDurationMs,
} from "@/features/analytics/types"

type AnalyticsTabKey =
  | "pupil_dilation"
  | "gaze_point"
  | "fixation_histogram"
  | "heatmap"
  | "scanpath"
  | "device_distance"
  | "aoi_comparison"

type EegTabKey = "timeseries" | "psd" | "spectrogram" | "topography"

const ANALYTICS_TABS: Array<{ key: AnalyticsTabKey; label: string; hint: string }> = [
  { key: "pupil_dilation", label: "Dilatación pupilar", hint: "Cambios en el tamaño de la pupila. Suele crecer con el esfuerzo mental o la emoción." },
  { key: "gaze_point", label: "Punto de mirada", hint: "Dónde miraba la persona en la pantalla en cada momento." },
  { key: "fixation_histogram", label: "Histograma de fijaciones", hint: "Cuántas fijaciones hubo según su duración. Una fijación es una pausa de la mirada sobre un punto." },
  { key: "heatmap", label: "Mapa de calor", hint: "Zonas del estímulo donde más se detuvo la mirada: los colores cálidos marcan más atención." },
  { key: "scanpath", label: "Mapa de recorridos", hint: "El orden en que la mirada pasó de un punto a otro: cada círculo es una fijación y cada línea, un salto entre ellas." },
  { key: "device_distance", label: "Distancia al dispositivo", hint: "Distancia entre los ojos y la pantalla durante la prueba; muestra si la persona se acercó o se alejó." },
  { key: "aoi_comparison", label: "Comparativa AOIs", hint: "Compara las áreas de interés (AOI): zonas del estímulo marcadas para medir cuánto y cuándo se miraron." },
]

const FIXATION_DERIVED_TABS = new Set<AnalyticsTabKey>([
  "fixation_histogram",
  "heatmap",
  "scanpath",
  "aoi_comparison",
])

const EEG_TABS: Array<{ key: EegTabKey; label: string; hint: string }> = [
  { key: "timeseries", label: "EEG por canal", hint: "La actividad eléctrica que registró cada electrodo a lo largo del tiempo." },
  { key: "psd", label: "Densidad espectral", hint: "Cuánta energía tiene la señal en cada frecuencia, de los ritmos lentos a los rápidos, en todo el intervalo." },
  { key: "spectrogram", label: "Espectrograma de frecuencias", hint: "Cómo cambia la energía de cada frecuencia a lo largo del tiempo." },
  { key: "topography", label: "Topografía EEG", hint: "Mapa de la cabeza que muestra en qué zonas hubo más actividad." },
]

const TAB_KINDS: Record<AnalyticsTabKey, ComparisonKind> = {
  pupil_dilation: "pupil",
  gaze_point: "gaze",
  fixation_histogram: "fixation_histogram",
  heatmap: "heatmap",
  scanpath: "scanpath",
  device_distance: "distance",
  aoi_comparison: "aoi",
}

const EEG_TAB_KINDS: Record<EegTabKey, ComparisonKind> = {
  timeseries: "eeg_timeseries",
  psd: "eeg_psd",
  spectrogram: "eeg_spectrogram",
  topography: "eeg_topography",
}

/**
 * Views that draw «Superposición» and «Promedio» themselves (useGroupView).
 * Every other view shows why it cannot, in place of its chart.
 */
const GROUP_READY_TABS = new Set<AnalyticsTabKey>(["pupil_dilation", "heatmap", "scanpath", "aoi_comparison"])
const GROUP_READY_EEG_TABS = new Set<EegTabKey>([])
const GROUP_READY_GSR = false

function groupBlockedReason(mode: GroupMode, kind: ComparisonKind | "comparativas", scenario: string): string {
  if (kind === "comparativas") return COMPARATIVAS_UNSUPPORTED
  return groupUnsupportedReason(kind, mode, scenario) ?? `Esta vista todavía no admite «${GROUP_MODE_LABELS[mode]}».`
}

function GroupBlockedView({ reason }: { reason: string }) {
  return (
    <div className="analytics-stack">
      <GroupUnsupported reason={reason} className="analytics-state-frame" />
    </div>
  )
}

const compactSidebarQuery = "(max-width: 767px)"
const subscribeToCompactViewport = (onChange: () => void) => {
  const query = window.matchMedia(compactSidebarQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const getCompactViewport = () => window.matchMedia(compactSidebarQuery).matches
const getServerCompactViewport = () => false

export default function DashboardPage() {
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  )
  const [selectedSensor, setSelectedSensor] =
    useState<SensorSelection>("EyeTracker")
  const compactViewport = useSyncExternalStore(subscribeToCompactViewport, getCompactViewport, getServerCompactViewport)
  const [sidebarCollapsedOverride, setSidebarCollapsed] = useState<boolean | null>(null)
  const sidebarCollapsed = sidebarCollapsedOverride ?? compactViewport
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<AnalyticsTabKey>("pupil_dilation")
  const [minFixationDurationMs, setMinFixationDurationMs] =
    useState<FixationDurationMs>(DEFAULT_FIXATION_DURATION_MS)
  const [activeEegTab, setActiveEegTab] = useState<EegTabKey>("timeseries")
  const [selectedParticipantOverride, setSelectedParticipantOverride] =
    useState<string | null>(null)
  const [selectedScenario, setSelectedScenario] = useState("all")
  // «Superposición» / «Promedio» and its participants (null = all of them).
  const [groupMode, setGroupMode] = useState<GroupMode | null>(null)
  const [groupSelection, setGroupSelection] = useState<string[] | null>(null)
  const [participantDataProjectId, setParticipantDataProjectId] = useState<
    string | null
  >(null)
  const sawParticipantLoading = useRef(false)
  useAnalyticsProjectContext(selectedProjectId)

  const { participants, loading: participantsLoading } =
    useAnalyticsParticipants(selectedProjectId)
  const { scenarios, loading: scenariosLoading } =
    useAnalyticsScenarios(selectedProjectId)

  useEffect(() => {
    if (participantsLoading) {
      sawParticipantLoading.current = true
      return
    }
    if (!selectedProjectId || !sawParticipantLoading.current) return

    const readyProjectId = selectedProjectId
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setParticipantDataProjectId(readyProjectId)
    })
    return () => {
      cancelled = true
    }
  }, [participantsLoading, selectedProjectId])

  useEffect(() => {
    let cancelled = false
    ProjectsApi.list()
      .then((items) => {
        if (cancelled) return
        setProjects(items)
        // A project card opens its own dashboard: `/dashboard?proyecto=<id>`.
        const requested = new URLSearchParams(window.location.search).get("proyecto")
        const initialProject = items.find((item) => item.id === requested) ?? items[0]
        if (initialProject) {
          setSelectedProjectId(initialProject.id)
          setSelectedSensor(getProjectSensors(initialProject)[0] ?? "Comparativas")
          setExpandedProjects({ [initialProject.id]: true })
        }
      })
      .catch(() => {
        if (cancelled) return
        setProjects([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const selectedParticipant = useMemo(() => {
    if (
      participantDataProjectId !== selectedProjectId ||
      participants.length === 0
    ) {
      return null
    }

    if (
      selectedParticipantOverride &&
      participants.some(
        (participant) =>
          participant.participant_code === selectedParticipantOverride
      )
    ) {
      return selectedParticipantOverride
    }

    return participants[0].participant_code
  }, [
    participantDataProjectId,
    participants,
    selectedParticipantOverride,
    selectedProjectId,
  ])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const fixationDurationViewActive =
    selectedSensor === "EyeTracker" && FIXATION_DERIVED_TABS.has(activeTab)
  const {
    data: fixationSensitivityData,
    loading: fixationSensitivityLoading,
    error: fixationSensitivityError,
  } = useFixationSensitivity(
    fixationDurationViewActive ? selectedProjectId : null,
    fixationDurationViewActive ? selectedParticipant : null,
    selectedScenario
  )
  const availableFixationDurations =
    fixationSensitivityData?.available_min_fixation_durations_ms
  const effectiveMinFixationDurationMs =
    availableFixationDurations &&
    availableFixationDurations.length > 0 &&
    !availableFixationDurations.includes(minFixationDurationMs)
      ? (availableFixationDurations.find(
          (duration) => duration === DEFAULT_FIXATION_DURATION_MS
        ) ?? availableFixationDurations[0])
      : minFixationDurationMs

  // Only the current project's participants, never the previous project's list.
  const comparisonParticipantCodes = useMemo(
    () =>
      participantDataProjectId === selectedProjectId
        ? participants.map((participant) => participant.participant_code)
        : [],
    [participantDataProjectId, participants, selectedProjectId]
  )
  const comparisonParticipantLabels = useMemo(
    () => participantLabelMap(participants),
    [participants]
  )

  const availableSensors = useMemo(
    () => (selectedProject?.sensors ?? []).map((sensor) => sensor.sensor_type),
    [selectedProject]
  )

  const groupTabBlocked = groupMode != null && !GROUP_READY_TABS.has(activeTab)

  const handleSelectProject = (projectId: string, sensor?: SensorSelection) => {
    const project = projects.find((item) => item.id === projectId)
    if (!project) return

    if (projectId !== selectedProjectId) {
      sawParticipantLoading.current = false
      setParticipantDataProjectId(null)
      setSelectedParticipantOverride(null)
      setGroupMode(null)
      setGroupSelection(null)
      setSelectedScenario("all")
      setMinFixationDurationMs(DEFAULT_FIXATION_DURATION_MS)
    }
    setSelectedProjectId(projectId)
    setSelectedSensor(sensor ?? getProjectSensors(project)[0] ?? "Comparativas")
    setExpandedProjects((prev) => ({ ...prev, [projectId]: true }))
  }

  const handleToggleProject = (projectId: string) => {
    if (expandedProjects[projectId]) {
      setExpandedProjects((prev) => ({ ...prev, [projectId]: false }))
    } else {
      handleSelectProject(projectId)
    }
  }

  return (
    <AuthGuard>
      <div className="fixed inset-x-0 top-[var(--app-nav-height)] bottom-0 flex min-h-0 min-w-0 overflow-hidden bg-muted/30">
        <AnalyticsSidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          selectedSensor={selectedSensor}
          onSelectProject={handleSelectProject}
          expandedProjects={expandedProjects}
          onToggleProject={handleToggleProject}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ParticipantComparisonProvider
            projectId={selectedProjectId}
            participantCodes={comparisonParticipantCodes}
            participantLabels={comparisonParticipantLabels}
            generation={selectedProject?.ingestion_generation ?? null}
          >
          <GroupModeProvider
            projectId={selectedProjectId}
            generation={selectedProject?.ingestion_generation ?? null}
            participantCodes={comparisonParticipantCodes}
            labels={comparisonParticipantLabels}
            mode={groupMode}
            selection={groupSelection}
            onModeChange={setGroupMode}
            onSelectionChange={setGroupSelection}
          >
          <FiltersBar
            scenarios={scenarios}
            participants={participants}
            selectedScenario={selectedScenario}
            selectedParticipant={selectedParticipant}
            onScenarioChange={setSelectedScenario}
            onParticipantChange={setSelectedParticipantOverride}
            scenariosLoading={scenariosLoading}
            participantsLoading={participantsLoading}
            compareAction={<FiltersBarCompareButton />}
          />

          <main className="analytics-shell min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-4 xl:px-6 xl:pb-6">
            {!selectedProjectId ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Selecciona un proyecto del panel lateral
              </div>
            ) : groupMode && selectedSensor === "Comparativas" ? (
              <GroupBlockedView reason={groupBlockedReason(groupMode, "comparativas", selectedScenario)} />
            ) : groupMode && selectedSensor === "GSR" && !GROUP_READY_GSR ? (
              <GroupBlockedView reason={groupBlockedReason(groupMode, "gsr", selectedScenario)} />
            ) : selectedSensor === "Comparativas" ? (
              <ComparisonTab
                key={selectedProjectId}
                projectId={selectedProjectId}
                participantCode={selectedParticipant}
                scenario={selectedScenario}
                availableSensors={availableSensors}
              />
            ) : selectedSensor === "GSR" ? (
              <GsrTab
                key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                projectId={selectedProjectId}
                participantCode={selectedParticipant}
                scenario={selectedScenario}
              />
            ) : selectedSensor === "EEG" ? (
              <AnalyticsTabs value={activeEegTab} onValueChange={setActiveEegTab} options={EEG_TABS} label="Vistas EEG">
                {groupMode && !GROUP_READY_EEG_TABS.has(activeEegTab) ? (
                  <GroupBlockedView reason={groupBlockedReason(groupMode, EEG_TAB_KINDS[activeEegTab], selectedScenario)} />
                ) : (

                <EegTab
                  key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                  projectId={selectedProjectId}
                  participantCode={selectedParticipant}
                  scenario={selectedScenario}
                  view={activeEegTab}
                />
                )}
              </AnalyticsTabs>
            ) : (
              <AnalyticsTabs value={activeTab} onValueChange={setActiveTab} options={ANALYTICS_TABS} label="Vistas del eye tracker">

                {FIXATION_DERIVED_TABS.has(activeTab) &&
                  selectedParticipant &&
                  !groupTabBlocked && (
                    <div className="flex min-w-0 items-center justify-end border-b border-border bg-muted/10 px-4 py-2 xl:px-6">
                      <FixationDurationControl
                        value={effectiveMinFixationDurationMs}
                        onChange={setMinFixationDurationMs}
                        availableDurations={availableFixationDurations}
                        loading={fixationSensitivityLoading}
                        error={fixationSensitivityError}
                      />
                    </div>
                  )}

                {groupMode && groupTabBlocked ? (
                  <GroupBlockedView reason={groupBlockedReason(groupMode, TAB_KINDS[activeTab], selectedScenario)} />
                ) : activeTab === "pupil_dilation" ? (
                  <PupilDilationTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                  />
                ) : activeTab === "gaze_point" ? (
                  <GazePointTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                  />
                ) : activeTab === "device_distance" ? (
                  <DeviceDistanceTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                  />
                ) : activeTab === "scanpath" ? (
                  <ScanpathTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                    minFixationDurationMs={effectiveMinFixationDurationMs}
                  />
                ) : activeTab === "heatmap" ? (
                  <HeatmapTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                    minFixationDurationMs={effectiveMinFixationDurationMs}
                  />
                ) : activeTab === "fixation_histogram" ? (
                  <FixationHistogramTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                    minFixationDurationMs={effectiveMinFixationDurationMs}
                    onMinFixationDurationChange={setMinFixationDurationMs}
                    sensitivityData={fixationSensitivityData}
                    sensitivityLoading={fixationSensitivityLoading}
                    sensitivityError={fixationSensitivityError}
                  />
                ) : activeTab === "aoi_comparison" ? (
                  <AoiComparisonTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                    minFixationDurationMs={effectiveMinFixationDurationMs}
                  />
                ) : (
                  <div className="py-6">
                    <PlaceholderTab
                      label={
                        ANALYTICS_TABS.find((tab) => tab.key === activeTab)
                          ?.label ?? "Analitica"
                      }
                    />
                  </div>
                )}
              </AnalyticsTabs>
            )}
          </main>
          </GroupModeProvider>
          </ParticipantComparisonProvider>
        </div>
      </div>
    </AuthGuard>
  )
}
