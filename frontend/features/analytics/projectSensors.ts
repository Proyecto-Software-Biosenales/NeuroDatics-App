import type { ApiProject } from "@/features/projects/api/projectsApi"
import type { SensorType } from "@/features/projects/types"

export type AnalyticsSensor = SensorType
export type SensorSelection = AnalyticsSensor | "Comparativas"

// Sidebar order; the first sensor present is the project's default view.
const SENSOR_ORDER: readonly AnalyticsSensor[] = ["EyeTracker", "EEG", "GSR"]

export function getProjectSensors(project: ApiProject): AnalyticsSensor[] {
  const types = new Set((project.sensors ?? []).map((sensor) => sensor.sensor_type))
  return SENSOR_ORDER.filter((sensor) => types.has(sensor))
}
