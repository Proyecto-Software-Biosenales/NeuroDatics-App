import type { SensorType, UploadedProjectZip } from "@/features/projects/types"
import type { ProjectStatus } from "@/features/projects/types"
import type { ScreenSettings } from "@/features/settings/screenSettings"
import type { StimulusPlacementDraft } from "./stimulusPlacement"

export type { SensorType }
export type { ProjectStatus }

export interface ParticipantData {
  /** Code extracted from the recording ("Grabación:"); it keys the data and is never edited. */
  id: string
  sex: "male" | "female" | "other" | null
  age: string
  /** Optional name; when filled it labels the participant in the dashboard. */
  name: string
  /** Document shown in the app; starts as the extracted code and can be corrected. */
  document: string
}

export type ParticipantField = "sex" | "age" | "name" | "document"

/** Initial form state for a participant detected in the uploaded data. */
export const newParticipantData = (id: string): ParticipantData => ({
  id,
  age: "",
  sex: null,
  name: "",
  document: id,
})

/** Form state from a stored participant (project detail). */
export const participantDataFromApi = (
  p: { participant_code: string; age?: number | null; name?: string | null; document?: string | null },
  sex: ParticipantData["sex"],
): ParticipantData => ({
  id: p.participant_code,
  age: p.age != null ? String(p.age) : "",
  sex,
  name: p.name ?? "",
  document: p.document || p.participant_code,
})

/** Request body for PUT /projects/{id}/participants. Blank labels clear the stored value. */
export const participantToApi = (p: ParticipantData) => ({
  participant_code: p.id,
  age: p.age && !isNaN(Number(p.age)) ? Number(p.age) : null,
  sex: p.sex === "male" || p.sex === "female" || p.sex === "other" ? p.sex : null,
  name: p.name.trim() || null,
  // An emptied document falls back to the extracted code.
  document: p.document.trim() || p.id,
})

export interface FixationScreenGeometryInput {
  enabled: boolean
  widthPx: string
  heightPx: string
  widthCm: string
  heightCm: string
}

export const createEmptyFixationScreenGeometry = (): FixationScreenGeometryInput => ({
  enabled: false,
  widthPx: "",
  heightPx: "",
  widthCm: "",
  heightCm: "",
})

/**
 * The screen the fixations are measured on: the one typed for this experiment when the person
 * said another screen was used, else the one saved in Configuración once it has physical size.
 * Null leaves the detection in normalized coordinates.
 */
export const resolveFixationGeometry = (
  geometry: FixationScreenGeometryInput | undefined,
  saved: ScreenSettings | null | undefined,
): FixationScreenGeometryInput | null => {
  if (geometry?.enabled) return geometry
  if (!saved || saved.width_cm === null || saved.height_cm === null) return null
  return {
    enabled: true,
    widthPx: String(saved.width_px),
    heightPx: String(saved.height_px),
    widthCm: String(saved.width_cm),
    heightCm: String(saved.height_cm),
  }
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
