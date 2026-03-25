import type { SensorType, UploadedProjectZip } from "@/features/projects/types"
import type { ProjectStatus } from "@/features/projects/types"

export type { SensorType }
export type { ProjectStatus }

export interface ParticipantData {
  id: string
  sex: "male" | "female" | "other" | null
  age: string
}

export interface scenaries {
  id: string
  projectId?: string
  name: string
  type?: "image" | "video"
  fileId?: string | null
  imageUrl?: string | null
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
  description: string
  status: ProjectStatus
  experimentZip: File | null  // No opcional, pero puede ser null
  folderPath: string
  uploadedZip: UploadedProjectZip | null  // Result from backend after upload
  sensors: SensorType[]
  participants: ParticipantData[]
  scenaries: scenaries[]
}