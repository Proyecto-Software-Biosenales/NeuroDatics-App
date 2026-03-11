export type SensorType = "EEG" | "GSR" | "EyeTracker"

export interface Project {
  id: string
  name: string
  createdAt: string
  sensors: SensorType[]
  participants?: number
}
