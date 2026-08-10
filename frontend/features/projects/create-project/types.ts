import type { SensorType, UploadedProjectZip } from "@/features/projects/types"
import type { ProjectStatus } from "@/features/projects/types"
import type { StimulusPlacementDraft } from "./stimulusPlacement"

export type { SensorType }
export type { ProjectStatus }

export interface ParticipantData {
  id: string
  sex: "male" | "female" | "other" | null
  age: string
}

export interface FixationScreenGeometryInput {
  enabled: boolean
  widthPx: string
  heightPx: string
  widthCm: string
  heightCm: string
  viewingDistanceCm: string
}

export const createEmptyFixationScreenGeometry = (): FixationScreenGeometryInput => ({
  enabled: false,
  widthPx: "",
  heightPx: "",
  widthCm: "",
  heightCm: "",
  viewingDistanceCm: "",
})

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
  color: string
  shapeType?: "rect" | "circle" | "polygon"
  x: number
  y: number
  width: number
  height: number
  points?: Array<{ x: number; y: number }>
}

export interface ProjectFormData {
  projectName: string
  description: string
  status: ProjectStatus
  experimentFolderFiles: File[] | null  // No opcional, pero puede ser null
  folderPath: string
  uploadedZip: UploadedProjectZip | null  // Result from backend after upload
  sensors: SensorType[]
  participants: ParticipantData[]
  scenaries: scenaries[]
  fixationGeometry?: FixationScreenGeometryInput
  stimulusPlacements: StimulusPlacementDraft[]
}
