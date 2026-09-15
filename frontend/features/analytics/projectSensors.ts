import type { ApiProject } from "@/features/projects/api/projectsApi"

export type AnalyticsSensor = "EyeTracker" | "EEG" | "GSR"
export type SensorSelection = AnalyticsSensor | "Comparativas"

export function getProjectSensors(project: ApiProject): AnalyticsSensor[] {
  return (project.sensors ?? [])
    .map((sensor) => sensor.sensor_type)
    .filter((sensor): sensor is AnalyticsSensor =>
      sensor === "EyeTracker" || sensor === "EEG" || sensor === "GSR"
    )
}
