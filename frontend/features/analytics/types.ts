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
