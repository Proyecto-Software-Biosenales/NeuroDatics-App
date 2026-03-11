import type { SensorType } from "@/features/projects/types"

export type { SensorType }

export interface ParticipantData {
  id: string
  sex: string | null
  age: string
}

export interface Stimulus {
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
  folderPath: string
  sensors: SensorType[]
  participants: ParticipantData[]
  stimuli: Stimulus[]
}
