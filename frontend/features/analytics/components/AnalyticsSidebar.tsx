"use client"

import { useMemo, useState } from "react"
import {
  Activity,
  BarChart3,
  Brain,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  Eye,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApiProject } from "@/features/projects/api/projectsApi"

type SensorKey = "EyeTracker" | "EEG" | "GSR" | "Comparativas"

interface AnalyticsSidebarProps {
  projects: ApiProject[]
  selectedProjectId: string | null
  selectedSensor: string
  onSelectProject: (projectId: string) => void
  onSelectSensor: (sensor: SensorKey) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

const SENSOR_META: Record<Exclude<SensorKey, "Comparativas">, { label: string; Icon: typeof Eye }> = {
  EyeTracker: { label: "Eye Tracker", Icon: Eye },
  EEG: { label: "Electroencefalógrafo", Icon: Brain },
  GSR: { label: "Sensor Galvánico", Icon: Activity },
}

const ALWAYS_SENSOR: { key: SensorKey; label: string; Icon: typeof BarChart3 } = {
  key: "Comparativas",
  label: "Comparativas",
  Icon: BarChart3,
}

export function AnalyticsSidebar({
  projects,
  selectedProjectId,
  selectedSensor,
  onSelectProject,
  onSelectSensor,
  collapsed,
  onToggleCollapse,
}: AnalyticsSidebarProps) {
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }))
  }

  const renderSensorItem = (
    projectId: string,
    sensor: { key: SensorKey; label: string; Icon: typeof Eye }
  ) => {
    const isActive = selectedProjectId === projectId && selectedSensor === sensor.key

    return (
      <button
        key={`${projectId}-${sensor.key}`}
        type="button"
        onClick={() => {
          onSelectProject(projectId)
          onSelectSensor(sensor.key)
        }}
        className={cn(
          "flex w-full items-center rounded-lg text-left text-sm",
          collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2",
          isActive
            ? "bg-gray-900 text-white"
            : "text-gray-700 hover:bg-gray-100"
        )}
        aria-label={sensor.label}
        title={sensor.label}
      >
        <sensor.Icon className="h-4 w-4" />
        {!collapsed ? <span>{sensor.label}</span> : null}
      </button>
    )
  }

  const collapsedSensors = useMemo(() => {
    if (!selectedProject) {
      return [ALWAYS_SENSOR]
    }

    const projectSensors = (selectedProject.sensors ?? [])
      .map((sensor) => sensor.sensor_type as Exclude<SensorKey, "Comparativas">)
      .filter((sensorType) => sensorType in SENSOR_META)
      .map((sensorType) => ({ key: sensorType, ...SENSOR_META[sensorType] }))

    return [...projectSensors, ALWAYS_SENSOR]
  }, [selectedProject])

  return (
    <aside className={cn("flex h-full flex-col border-r border-gray-200 bg-white", collapsed ? "w-12" : "w-60")}>
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        {!collapsed ? <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Proyectos</span> : null}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label={collapsed ? "Expandir panel" : "Contraer panel"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {collapsed ? (
          <div className="space-y-2">
            {selectedProjectId ? collapsedSensors.map((sensor) => renderSensorItem(selectedProjectId, sensor)) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => {
              const isExpanded = expandedProjects[project.id] ?? false
              const sensorItems = (project.sensors ?? [])
                .map((sensor) => sensor.sensor_type as Exclude<SensorKey, "Comparativas">)
                .filter((sensorType) => sensorType in SENSOR_META)
                .map((sensorType) => ({ key: sensorType, ...SENSOR_META[sensorType] }))

              return (
                <div key={project.id} className="space-y-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.id)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      aria-label={isExpanded ? "Contraer proyecto" : "Expandir proyecto"}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectProject(project.id)}
                      className={cn(
                        "flex-1 rounded-lg px-2 py-1.5 text-left text-sm font-medium",
                        selectedProject?.id === project.id
                          ? "text-gray-900"
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                    >
                      {project.name}
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="ml-6 space-y-1">
                      {sensorItems.map((sensor) => renderSensorItem(project.id, sensor))}
                      {renderSensorItem(project.id, ALWAYS_SENSOR)}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 p-4">
        <button
          type="button"
          className={cn(
            "flex w-full items-center rounded-lg text-sm text-gray-700 hover:bg-gray-100",
            collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2"
          )}
        >
          <Settings className="h-4 w-4" />
          {!collapsed ? <span>Configuración</span> : null}
        </button>
      </div>
    </aside>
  )
}
