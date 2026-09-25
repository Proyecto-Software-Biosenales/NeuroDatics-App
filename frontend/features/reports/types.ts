import type { SensorType } from "@/features/projects/types"

/** One device report, or every device of the project as one PDF each in a ZIP. */
export type ReportDevice = SensorType | "all"
export type ReportScopeKind = "participant" | "all-participants"

export interface ExecutiveReportPayload {
  project_id: string
  scope:
    | { kind: "participant"; participant_code: string }
    | { kind: "all_participants" }
  mode:
    | { kind: "comparative" }
    | { kind: "sensor"; sensor: SensorType }
  scenario_scope: "all_by_sections"
  include_cover: boolean
  include_metadata: boolean
}

export interface GeneratedReportFile {
  blob: Blob
  filename: string
}

export interface ExportOptions {
  includeCover: boolean
  includeMetadata: boolean
}
