import type { SensorType } from "@/features/projects/types"

export type { SensorType }

export interface ParticipantData {
  id: string
  sex: "male" | "female" | "other" | null
  age: string
}

export interface scenaries {
  id: string
  name: string
  aois: AOI[]
}

export interface AOI {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
}

export interface ProjectFormData {
  projectName: string
  experimentZip: File | null  // No opcional, pero puede ser null
  folderPath: string
  sensors: SensorType[]
  participants: ParticipantData[]
  scenaries: scenaries[]
}