export type SensorType = "EEG" | "GSR" | "EyeTracker"
export type ProjectStatus = "draft" | "active" | "archived"

export interface Project {
  id: string
  name: string
  description?: string
  status?: ProjectStatus
  ingestionStatus?: "PENDING" | "PROCESSING" | "READY" | "FAILED"
  createdAt: string
  updatedAt?: string
  sensors: SensorType[]
  participants?: number
}

/**
 * Compact file representation returned by ZIP ingestion endpoint.
 */
export interface UploadedProjectFile {
  id: string
  kind: string
  filename: string
  source_entry_path?: string | null
  external_id: string
  drive_web_view_link?: string | null
  mime_type?: string | null
}

export interface UploadedProjectZipCounts {
  folders_created: number
  files_uploaded: number
  images: number
  videos: number
  csv: number
  other: number
  scenaries_created: number
}

export interface UploadedProjectZipCsvProcessing {
  detected: number
  processed: number
  failed: number
}

export interface DetectedParticipant {
  participant_code: string
  user_index: number
}

/** One `Sujet_..._Scenario_..._RecN` folder found under `Acquisition/`. */
export interface AcquisitionRecordingSummary {
  folder_name: string
  subject_code?: string | null
  scenario_name?: string | null
  recording_index?: number | null
  documents: string[]
}

/**
 * Reference-only metadata read from `Acquisition/`. The backend never stores
 * anything from that folder; it is parsed purely to seed default values.
 */
export interface AcquisitionSummary {
  present: boolean
  folder_path?: string | null
  recordings: AcquisitionRecordingSummary[]
  default_participant_codes: string[]
  default_scenario_names: string[]
}

/** Which parts of an ambiguous archive the backend actually ingested. */
export interface ResolvedUploadSelection {
  csv_entry_path?: string | null
  images_folder?: string | null
  videos_folder?: string | null
  acquisition_folder?: string | null
}

export interface UploadedProjectZipSummary {
  id?: string
  project_id: string
  ingestion_status: "PROCESSING" | "READY" | "FAILED" | string
  drive_root_folder_id?: string | null
  drive_root_folder_name?: string | null
  drive_root_folder_url?: string | null
  zip_saved: boolean
  zip_file?: UploadedProjectFile | null
  counts: UploadedProjectZipCounts
  files: UploadedProjectFile[]
  csv_processing: UploadedProjectZipCsvProcessing
  manifest: {
    total_detected: number
    images: number
    videos: number
    csv: number
    other: number
  }
  detected_sensors?: string[]
  participants?: DetectedParticipant[]
  selection?: ResolvedUploadSelection
  acquisition?: AcquisitionSummary
  excluded_entries?: string[]
}

export type UploadedProjectZip = UploadedProjectZipSummary
