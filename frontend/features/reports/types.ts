import type { SensorType } from "@/features/projects/types"

export type ReportMode = "comparative" | "by-sensor"
export type ReportScopeKind = "participant" | "all-participants"

export type ReportType = ReportMode | null

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

export interface ExportOptions {
  includeCover: boolean
  includeMetadata: boolean
}

export type ContentType =
  | "individual-charts"
  | "statistics"
  | "comparative-charts"

export interface ReportContent {
  "individual-charts": boolean
  statistics: boolean
  "comparative-charts": boolean
}
