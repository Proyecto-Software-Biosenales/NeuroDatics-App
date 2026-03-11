export type ReportType = "complete" | "by-sensor" | "comparative" | null

export type ContentType =
  | "individual-charts"
  | "statistics"
  | "comparative-charts"

export interface ReportContent {
  "individual-charts": boolean
  statistics: boolean
  "comparative-charts": boolean
}

export interface ExportOptions {
  includeCover: boolean
  includeMetadata: boolean
}
