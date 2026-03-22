export type SensorType = "EEG" | "GSR" | "EyeTracker"
export type ProjectStatus = "draft" | "active" | "archived"

export interface Project {
  id: string
  name: string
  description?: string
  status?: ProjectStatus
  createdAt: string
  sensors: SensorType[]
  participants?: number
}
