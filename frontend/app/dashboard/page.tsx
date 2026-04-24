"use client"

import { useEffect, useMemo, useState } from "react"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import { ProjectsApi, type ApiProject } from "@/features/projects/api/projectsApi"
import { AnalyticsSidebar } from "@/features/analytics/components/AnalyticsSidebar"
import { FiltersBar } from "@/features/analytics/components/FiltersBar"
import { PlaceholderTab } from "@/features/analytics/components/PlaceholderTab"
import { PupilDilationTab } from "@/features/analytics/components/PupilDilationTab"
import { GazePointTab } from "@/features/analytics/components/GazePointTab"
import { DeviceDistanceTab } from "@/features/analytics/components/DeviceDistanceTab"
import { ScanpathTab } from "@/features/analytics/components/ScanpathTab"
import { HeatmapTab } from "@/features/analytics/components/HeatmapTab"
import { FixationHistogramTab } from "@/features/analytics/components/FixationHistogramTab"
import {
  useAnalyticsParticipants,
  useAnalyticsScenarios,
} from "@/features/analytics/hooks/useAnalyticsData"

type SensorSelection = "EyeTracker" | "EEG" | "GSR" | "Comparativas"

type AnalyticsTabKey =
  | "pupil_dilation"
  | "gaze_point"
  | "fixation_histogram"
  | "heatmap"
  | "scanpath"
  | "device_distance"

const ANALYTICS_TABS: Array<{ key: AnalyticsTabKey; label: string }> = [
  { key: "pupil_dilation", label: "Dilatación pupilar" },
  { key: "gaze_point", label: "Gaze point" },
  { key: "fixation_histogram", label: "Histograma de fijación" },
  { key: "heatmap", label: "Mapa de calor" },
  { key: "scanpath", label: "Mapa de recorridos" },
  { key: "device_distance", label: "Distancia dispositivo" },
]

const SENSOR_LABELS: Record<SensorSelection, string> = {
  EyeTracker: "Eye Tracker",
  EEG: "Electroencefalógrafo",
  GSR: "Sensor Galvánico",
  Comparativas: "Comparativas",
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedSensor, setSelectedSensor] = useState<SensorSelection>("EyeTracker")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<AnalyticsTabKey>("pupil_dilation")
  const [selectedParticipantOverride, setSelectedParticipantOverride] = useState<string | null>(null)
  const [selectedScenario, setSelectedScenario] = useState("all")

  const { participants, loading: participantsLoading } = useAnalyticsParticipants(selectedProjectId)
  const { scenarios, loading: scenariosLoading } = useAnalyticsScenarios(selectedProjectId)

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
    if (participants.length === 0) {
      return null
    }

    if (
      selectedParticipantOverride &&
      participants.some(
        (participant) => participant.participant_code === selectedParticipantOverride
      )
    ) {
      return selectedParticipantOverride
    }

    return participants[0].participant_code
  }, [participants, selectedParticipantOverride])

  const selectedSensorLabel = useMemo(() => SENSOR_LABELS[selectedSensor], [selectedSensor])

  return (
    <AuthGuard>
      <div className="flex h-screen bg-gray-50 dark:bg-black">
        <AnalyticsSidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          selectedSensor={selectedSensor}
          onSelectProject={setSelectedProjectId}
          onSelectSensor={setSelectedSensor}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
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

          <main className="flex-1 overflow-y-auto px-6 pb-6">
            {!selectedProjectId ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Selecciona un proyecto del panel lateral
              </div>
            ) : selectedSensor !== "EyeTracker" ? (
              <div className="py-6">
                <PlaceholderTab label={selectedSensorLabel} />
              </div>
            ) : (
              <>
                <div className="flex gap-6 text-muted-foreground border-b border-gray-200 dark:border-border px-6">
                  {ANALYTICS_TABS.map((tab) => {
                    const isActive = activeTab === tab.key
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={
                          isActive
                            ? "cursor-pointer border-b-2 border-gray-900 dark:border-white pb-3 text-sm font-semibold text-foreground"
                            : "cursor-pointer pb-3 text-sm text-muted-foreground hover:text-gray-700 dark:hover:text-gray-200"
                        }
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

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
                  />
                ) : activeTab === "heatmap" ? (
                  <HeatmapTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                  />
                ) : activeTab === "fixation_histogram" ? (
                  <FixationHistogramTab
                    key={`${selectedProjectId}-${selectedParticipant ?? "none"}-${selectedScenario}`}
                    projectId={selectedProjectId}
                    participantCode={selectedParticipant}
                    scenario={selectedScenario}
                  />
                ) : (
                  <div className="py-6">
                    <PlaceholderTab
                      label={ANALYTICS_TABS.find((tab) => tab.key === activeTab)?.label ?? "Analitica"}
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
