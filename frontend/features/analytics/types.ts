export interface AnalyticsParticipant {
  participant_code: string
  user_index: number
}

export interface AnalyticsScenario {
  name: string
  type: string
  file_id: string | null
}

export interface PupilTimeseriesData {
  time: number[]
  left: number[]
  right: number[]
  average: number[]
  smooth_left: number[]
  smooth_right: number[]
}

export interface PupilStatistics {
  mean: number
  min: number
  max: number
  std: number
  median: number
  baseline: number
  raw_mean: number | null
  raw_min: number | null
  raw_max: number | null
  raw_std: number | null
  raw_median: number | null
  raw_baseline: number | null
}

export interface GazeAtData {
  requested_time_s: number
  nearest_time_s: number
  scenario: string | null
  gx: number | null
  gy: number | null
  scenario_file_id: string | null
  scenario_type?: string | null
  scenario_time_s?: number | null
}

export interface GazeTimeseriesData {
  time: number[]
  gx_clean: number[]
  gy_clean: number[]
}

export interface GazeStatistics {
  gx_mean: number
  gx_min: number
  gx_max: number
  gx_std: number
  gx_median: number
  gx_baseline: number
  gy_mean: number
  gy_min: number
  gy_max: number
  gy_std: number
  gy_median: number
  gy_baseline: number
}

export interface DistanceTimeseriesData {
  time: number[]
  distance_cm: number[]
}

export interface DistanceStatistics {
  mean: number
  min: number
  max: number
  std: number
  median: number
  baseline: number
}

export interface GsrTimeseriesData {
  time: number[]
  gsr: number[]
  gsr_smooth: number[]
}

export interface GsrStatistics {
  mean: number
  min: number
  max: number
  std: number
  median: number
  baseline: number
  raw_mean: number | null
  raw_min: number | null
  raw_max: number | null
  raw_std: number | null
  raw_median: number | null
  raw_baseline: number | null
}

export interface EegTimeseriesData {
  time: number[]
  channels: string[]
  available_channels: string[]
  sampling_rate_hz: number
  raw: Record<string, number[]>
  smooth: Record<string, number[]>
}

export interface EegPsdData {
  frequency: number[]
  channels: string[]
  available_channels: string[]
  sampling_rate_hz: number
  use_db: boolean
  unit: string
  power: Record<string, number[]>
}

export interface ColorDomain {
  min: number
  max: number
}

export interface EegSpectrogramData {
  time: number[]
  frequency: number[]
  channels: string[]
  available_channels: string[]
  sampling_rate_hz: number
  use_db: boolean
  normalize: string
  unit: string
  power: Record<string, number[][]>
  color_domain: ColorDomain
}

export interface EegTopographyData {
  time: number[]
  channels: string[]
  available_channels: string[]
  sampling_rate_hz: number
  unit: string
  positions: Record<string, number[]>
  power: Record<string, number[]>
  color_domain: ColorDomain
  window_s: number
  overlap_ratio: number
  remove_dc: boolean
}

export interface ComparisonChartSeries {
  key: string
  label: string
  color: string
  unit: string
}

export interface ComparisonChartLegendItem {
  label: string
  color: string
}

export interface ComparisonChartPeak {
  kind: "min" | "max"
  series_key: string
  series_label: string
  value: number
  time_s: number
  unit: string
  color: string
  line_style: "dotted" | "dashed"
  label: string
}

export interface ComparisonChartConfig {
  id: string
  title: string
  x_label: string
  y_label: string
  time_basis: "absolute"
  x_domain: [number, number] | null
  data: Array<Record<string, number | null>>
  series: ComparisonChartSeries[]
  legend: ComparisonChartLegendItem[]
  peaks: ComparisonChartPeak[]
  annotations: Array<Record<string, unknown>>
  synchronized: boolean
  height: number
}

export interface ComparisonChartsResponse {
  charts: ComparisonChartConfig[]
}

export interface ScanpathObjective {
  id: number
  cx: number            // normalized 0-1 (horizontal position)
  cy: number            // normalized 0-1 (vertical position)
  duration_s: number    // fixation duration in seconds
  radius_norm: number   // normalized radius (0-1 scale, for rendering)
  t_start: number
  t_end: number
  n_points: number
}

export interface ScanpathData {
  objectives: ScanpathObjective[]
  n_objectives: number
  total_distance_px: number    // in pixels at 1920x1080 reference resolution
  avg_duration_s: number       // average fixation duration in seconds
  scenario_file_id: string | null
}

export interface FixationPoint {
  x_norm: number
  y_norm: number
  time_s: number
  duration_s: number
}

export interface FixationStats {
  n_fixations: number
  max_duration_s: number
  avg_duration_s: number
}

export interface FixationData {
  fixations: FixationPoint[]
  stats: FixationStats
  scenario_file_id: string | null
}

export interface FixationHistogramBin {
  rango_min: number
  rango_max: number
  label: string
  conteo: number
  porcentaje: number
  promedio_ms: number
}

export interface FixationHistogramData {
  bins: FixationHistogramBin[]
  n_fixations: number
  total_duration_ms: number
  mean_duration_ms: number
  min_duration_ms: number
  max_duration_ms: number
}

export interface AoiShape {
  x: number
  y: number
  width: number
  height: number
  points?: Array<{ x: number; y: number }>
}

export interface AoiMetricItem {
  id: string
  name: string
  color: string
  shape_type: string
  shape: AoiShape
  fixation_count: number
  total_dwell_time_ms: number
  total_dwell_time_percent: number
  avg_fixation_duration_ms: number
  ttff_ms: number | null
  hit_rate_percent: number
  fixations_to_target: number | null
  pupil_sample_count: number
  avg_pupil_mm: number | null
  pupil_delta_from_baseline_mm: number | null
  pupil_delta_percent: number | null
  distance_sample_count: number
  avg_distance_cm: number | null
  distance_delta_from_baseline_cm: number | null
  distance_delta_percent: number | null
}

export interface AoiTransitionRow {
  from_aoi: string
  counts: Record<string, number>
  total: number
}

export interface AoiEventItem {
  id: string
  label: string
  metric: string
  kind: string
  value: number
  unit: string
  time_s: number | null
  gx: number | null
  gy: number | null
  aoi_id: string | null
  aoi_name: string | null
  aoi_color: string | null
}

export interface AoiMetricsData {
  scenario: string
  scenario_file_id: string | null
  aois: AoiMetricItem[]
  transitions: AoiTransitionRow[]
  events?: AoiEventItem[]
  total_fixations: number
  total_dwell_time_ms: number
  observed_aoi_dwell_time_ms: number
  observed_aoi_dwell_time_percent: number
}

export type CorrelationSignalId =
  | "pupil_avg_mm"
  | "gaze_x_pct"
  | "gaze_y_pct"
  | "distance_cm"
  | "gsr_smoothed_us"
  | "eeg_broadband_power_db"

export type CorrelationCellStatus =
  | "ok"
  | "unavailable"
  | "insufficient_overlap"
  | "constant_signal"

export interface CorrelationSignal {
  id: CorrelationSignalId
  label: string
  unit: string
  available: boolean
  valid_bins: number
  coverage: number
  source_columns: string[]
  unavailable_reason: string | null
}

export interface CorrelationCell {
  signal_x: CorrelationSignalId
  signal_y: CorrelationSignalId
  coefficient: number | null
  n_samples: number
  coverage: number
  status: CorrelationCellStatus
}

export interface CorrelationResponse {
  participant_code: string
  scenario: string
  method: "pearson"
  time_basis: "scenario_relative"
  bin_size_s: number
  min_pair_samples: number
  duration_s: number
  total_bins: number
  signals: CorrelationSignal[]
  matrix: CorrelationCell[][]
}
