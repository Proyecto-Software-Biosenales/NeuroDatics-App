"use client"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

import { useMemo } from "react"
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
import { getProjectSensors, type SensorSelection } from "@/features/analytics/projectSensors"

type SensorKey = SensorSelection

interface AnalyticsSidebarProps {
  projects: ApiProject[]
  selectedProjectId: string | null
  selectedSensor: string
  onSelectProject: (projectId: string, sensor?: SensorKey) => void
  expandedProjects: Record<string, boolean>
  onToggleProject: (projectId: string) => void
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
  expandedProjects,
  onToggleProject,
  collapsed,
  onToggleCollapse,
}: AnalyticsSidebarProps) {
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  const renderSensorItem = (
    projectId: string,
    sensor: { key: SensorKey; label: string; Icon: typeof Eye }
  ) => {
    const isActive = selectedProjectId === projectId && selectedSensor === sensor.key

    return (
      <Button variant="selection"
        key={`${projectId}-${sensor.key}`}
        type="button"
        onClick={() => onSelectProject(projectId, sensor.key)}
        className={cn(
          "min-w-0 overflow-hidden border-transparent text-left",
          collapsed ? "h-10 w-10 justify-center p-0" : "h-auto w-full justify-start gap-2 px-3 py-2"
        )}
        aria-label={sensor.label}
        aria-pressed={isActive}
        title={sensor.label}
      >
        <sensor.Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")} />
        {!collapsed ? <span className="min-w-0 flex-1 truncate">{sensor.label}</span> : null}
      </Button>
    )
  }

  const collapsedSensors = useMemo(() => {
    if (!selectedProject) {
      return [ALWAYS_SENSOR]
    }

    const projectSensors = getProjectSensors(selectedProject)
      .map((sensorType) => ({ key: sensorType, ...SENSOR_META[sensorType] }))

    return [...projectSensors, ALWAYS_SENSOR]
  }, [selectedProject])

  return (
    <aside className={cn("flex h-full shrink-0 flex-col border-r border-border bg-card", collapsed ? "w-14" : "absolute inset-y-0 left-0 z-30 w-60 shadow-lg md:static md:shadow-none xl:w-64")}>
      <div className={cn(
        "flex items-center border-b border-border py-2",
        collapsed ? "justify-center px-2" : "justify-between px-3"
      )}>
        {!collapsed ? <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proyectos</span> : null}
        <Button variant="ghost"
          size="icon-sm"
          type="button"
          onClick={onToggleCollapse}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "Expandir panel" : "Contraer panel"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>

      <div className={cn("flex-1 overflow-y-auto", collapsed ? "p-2" : "p-3 xl:p-4")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            {selectedProjectId ? collapsedSensors.map((sensor) => renderSensorItem(selectedProjectId, sensor)) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => {
              const isExpanded = expandedProjects[project.id] ?? false
              const sensorItems = getProjectSensors(project)
                .map((sensorType) => ({ key: sensorType, ...SENSOR_META[sensorType] }))

              return (
                <Collapsible key={project.id} open={isExpanded} onOpenChange={() => onToggleProject(project.id)} className="space-y-1">
                  <div className="flex items-center gap-1">
                    <CollapsibleTrigger asChild>
                    <Button variant="ghost"
                      size="icon-xs"
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={isExpanded ? "Contraer proyecto" : "Expandir proyecto"}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    </CollapsibleTrigger>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => onSelectProject(project.id)}
                      className={cn(
                        "min-w-0 flex-1 justify-start px-2 py-1.5 text-left",
                        selectedProject?.id === project.id
                          ? "text-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <span className="block truncate">{project.name}</span>
                    </Button>
                  </div>

                    <CollapsibleContent className="space-y-1 pl-5 xl:pl-6">
                      {sensorItems.map((sensor) => renderSensorItem(project.id, sensor))}
                      {renderSensorItem(project.id, ALWAYS_SENSOR)}
                    </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
      </div>

      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3 xl:p-4")}>
        <Button variant="ghost"
          type="button"
          className={cn(
            "flex min-w-0 items-center rounded-lg text-sm text-muted-foreground hover:bg-muted",
            collapsed ? "h-10 w-10 justify-center p-0" : "w-full gap-2 px-3 py-2"
          )}
        >
          <Settings className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
          {!collapsed ? <span className="min-w-0 flex-1 truncate">Configuración</span> : null}
        </Button>
      </div>
    </aside>
  )
}
