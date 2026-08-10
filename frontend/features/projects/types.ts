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

export interface CsvChannelProcessingMetadata {
  raw_name: string
  canonical_name: string
  start_time?: string | null
  declared_frequency_hz?: number | null
  unit?: string | null
}

export interface CsvBlockProcessingMetadata {
  user_index: number
  participant_code: string
  recording_label?: string | null
  source_start_line: number
  header_line: number
  source_end_line: number
  delimiter: string
  original_columns: string[]
  normalized_columns: string[]
  extra_columns: string[]
  detected_sensors: string[]
  declared_file_rate_hz?: number | null
  observed_grid_rate_hz?: number | null
  declared_gaze_rate_hz?: number | null
  effective_detection_rate_hz?: number | null
  resampled_for_detection: boolean
  sample_count: number
  time_start?: number | null
  time_end?: number | null
  fixation_available: boolean
  fixation_method?: string | null
  fixation_detector_version?: string | null
  fixation_source?: string | null
  channels: CsvChannelProcessingMetadata[]
  warnings: string[]
}

export interface UploadedProjectZipCsvProcessing {
  detected: number
  processed: number
  failed: number
  block_metadata?: CsvBlockProcessingMetadata[]
  warnings?: string[]
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
  ingestion_generation?: number
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
  stimulus_placements?: Record<string, Record<string, unknown>>
}

export type UploadedProjectZip = UploadedProjectZipSummary
