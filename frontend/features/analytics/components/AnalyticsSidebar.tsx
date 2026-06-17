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
          "flex items-center rounded-lg text-left text-sm",
          collapsed ? "h-10 w-10 justify-center p-0" : "w-full gap-2 px-3 py-2",
          isActive
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted"
        )}
        aria-label={sensor.label}
        title={sensor.label}
      >
        <sensor.Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")} />
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
    <aside className={cn("flex h-full flex-col border-r border-border bg-card", collapsed ? "w-14" : "w-60")}>
      <div className={cn(
        "flex items-center border-b border-border py-2",
        collapsed ? "justify-center px-2" : "justify-between px-3"
      )}>
        {!collapsed ? <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proyectos</span> : null}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "Expandir panel" : "Contraer panel"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <div className={cn("flex-1 overflow-y-auto", collapsed ? "p-2" : "p-4")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
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
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
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
                          ? "text-foreground"
                          : "text-muted-foreground hover:bg-muted"
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

      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-4")}>
        <button
          type="button"
          className={cn(
            "flex items-center rounded-lg text-sm text-muted-foreground hover:bg-muted",
            collapsed ? "h-10 w-10 justify-center p-0" : "w-full gap-2 px-3 py-2"
          )}
        >
          <Settings className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
          {!collapsed ? <span>Configuración</span> : null}
        </button>
      </div>
    </aside>
  )
}
