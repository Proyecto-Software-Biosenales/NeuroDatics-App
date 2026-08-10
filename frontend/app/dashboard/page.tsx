"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import {
  ProjectsApi,
  type ApiProject,
} from "@/features/projects/api/projectsApi"
import { AnalyticsSidebar } from "@/features/analytics/components/AnalyticsSidebar"
import { FiltersBar } from "@/features/analytics/components/FiltersBar"
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
import {
  useAnalyticsParticipants,
  useAnalyticsScenarios,
  useFixationSensitivity,
} from "@/features/analytics/hooks/useAnalyticsData"
import {
  DEFAULT_FIXATION_DURATION_MS,
  type FixationDurationMs,
} from "@/features/analytics/types"

type SensorSelection = "EyeTracker" | "EEG" | "GSR" | "Comparativas"

type AnalyticsTabKey =
  | "pupil_dilation"
  | "gaze_point"
  | "fixation_histogram"
  | "heatmap"
  | "scanpath"
  | "device_distance"
  | "aoi_comparison"

type EegTabKey = "timeseries" | "psd" | "spectrogram" | "topography"

const ANALYTICS_TABS: Array<{ key: AnalyticsTabKey; label: string }> = [
  { key: "pupil_dilation", label: "Dilatación pupilar" },
  { key: "gaze_point", label: "Gaze point" },
  { key: "fixation_histogram", label: "Histograma de fijación" },
  { key: "heatmap", label: "Mapa de calor" },
  { key: "scanpath", label: "Mapa de recorridos" },
  { key: "device_distance", label: "Distancia dispositivo" },
  { key: "aoi_comparison", label: "Comparativa AOIs" },
]

const FIXATION_DERIVED_TABS = new Set<AnalyticsTabKey>([
  "fixation_histogram",
  "heatmap",
  "scanpath",
  "aoi_comparison",
])

const EEG_TABS: Array<{ key: EegTabKey; label: string }> = [
  { key: "timeseries", label: "EEG por canal" },
  { key: "psd", label: "Densidad espectral" },
  { key: "spectrogram", label: "Espectrograma de frecuencias" },
  { key: "topography", label: "Topografía EEG" },
]

export default function DashboardPage() {
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  )
  const [selectedSensor, setSelectedSensor] =
    useState<SensorSelection>("EyeTracker")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<AnalyticsTabKey>("pupil_dilation")
  const [minFixationDurationMs, setMinFixationDurationMs] =
    useState<FixationDurationMs>(DEFAULT_FIXATION_DURATION_MS)
  const [activeEegTab, setActiveEegTab] = useState<EegTabKey>("timeseries")
  const [selectedParticipantOverride, setSelectedParticipantOverride] =
    useState<string | null>(null)
  const [selectedScenario, setSelectedScenario] = useState("all")
  const [participantDataProjectId, setParticipantDataProjectId] = useState<
    string | null
  >(null)
  const sawParticipantLoading = useRef(false)

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

  const availableSensors = useMemo(
    () => (selectedProject?.sensors ?? []).map((sensor) => sensor.sensor_type),
    [selectedProject]
  )

  const handleSelectProject = (projectId: string) => {
    if (projectId !== selectedProjectId) {
      sawParticipantLoading.current = false
      setParticipantDataProjectId(null)
      setSelectedParticipantOverride(null)
      setSelectedScenario("all")
      setMinFixationDurationMs(DEFAULT_FIXATION_DURATION_MS)
    }
    setSelectedProjectId(projectId)
  }

  return (
    <AuthGuard>
      <div className="fixed inset-x-0 top-[var(--app-nav-height)] bottom-0 flex min-h-0 min-w-0 overflow-hidden bg-gray-50 dark:bg-black">
        <AnalyticsSidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          selectedSensor={selectedSensor}
          onSelectProject={handleSelectProject}
          onSelectSensor={setSelectedSensor}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <FiltersBar
            scenarios={scenarios}
            participants={participants}
            selectedScenario={selectedScenario}
            selectedParticipant={selectedParticipant}
            onScenarioChange={setSelectedScenario}
            onParticipantChange={setSelectedParticipantOverride}
            scenariosLoading={scenariosLoading}
            participantsLoading={participantsLoading}
          />

          <main className="analytics-shell min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-4 xl:px-6 xl:pb-6">
            {!selectedProjectId ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Selecciona un proyecto del panel lateral
              </div>
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
              <>
                <div className="dashboard-tab-list flex min-w-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-2 text-muted-foreground [scrollbar-width:none] 2xl:gap-2 2xl:px-5 [&::-webkit-scrollbar]:hidden">
                  {EEG_TABS.map((tab) => {
                    const isActive = activeEegTab === tab.key
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveEegTab(tab.key)}
                        className={
                          isActive
                            ? "dashboard-tab-button dashboard-tab-button-active shrink-0 border-b-2 border-foreground px-3 py-2.5 text-sm leading-5 font-semibold whitespace-nowrap text-foreground"
                            : "dashboard-tab-button shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm leading-5 whitespace-nowrap text-muted-foreground hover:text-foreground"
                        }
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                <EegTab
                  key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                  projectId={selectedProjectId}
                  participantCode={selectedParticipant}
                  scenario={selectedScenario}
                  view={activeEegTab}
                />
              </>
            ) : (
              <>
                <div className="dashboard-tab-list flex min-w-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-2 text-muted-foreground [scrollbar-width:none] 2xl:gap-2 2xl:px-5 [&::-webkit-scrollbar]:hidden">
                  {ANALYTICS_TABS.map((tab) => {
                    const isActive = activeTab === tab.key
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={
                          isActive
                            ? "dashboard-tab-button dashboard-tab-button-active shrink-0 border-b-2 border-foreground px-3 py-2.5 text-sm leading-5 font-semibold whitespace-nowrap text-foreground"
                            : "dashboard-tab-button shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm leading-5 whitespace-nowrap text-muted-foreground hover:text-foreground"
                        }
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                {FIXATION_DERIVED_TABS.has(activeTab) &&
                  selectedParticipant && (
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

                {activeTab === "pupil_dilation" ? (
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
              </>
            )}
          </main>
        </div>
      </div>
    </AuthGuard>
  )
}
