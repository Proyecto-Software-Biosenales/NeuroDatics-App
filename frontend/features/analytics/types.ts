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
