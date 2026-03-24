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
}

export type UploadedProjectZip = UploadedProjectZipSummary
