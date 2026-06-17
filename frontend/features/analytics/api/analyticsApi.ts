import { apiFetch, apiFetchBlob } from "@/lib/api/apiFetch"
import type {
  AoiMetricsData,
  AnalyticsParticipant,
  AnalyticsScenario,
  DistanceStatistics,
  DistanceTimeseriesData,
  EegPsdData,
  EegSpectrogramData,
  EegTopographyData,
  EegTimeseriesData,
  FixationData,
  FixationHistogramData,
  GazeAtData,
  GazeStatistics,
  GazeTimeseriesData,
  GsrStatistics,
  GsrTimeseriesData,
  PupilStatistics,
  PupilTimeseriesData,
  ScanpathData,
} from "../types"

export const AnalyticsApi = {
  getParticipants: (projectId: string) =>
    apiFetch<AnalyticsParticipant[]>(`/api/projects/${projectId}/analytics/participants`),

  getScenarios: (projectId: string) =>
    apiFetch<AnalyticsScenario[]>(`/api/projects/${projectId}/analytics/scenarios`),

  getPupilTimeseries: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<PupilTimeseriesData>(`/api/projects/${projectId}/analytics/timeseries/pupil?${params}`)
  },

  getPupilStatistics: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<PupilStatistics>(`/api/projects/${projectId}/analytics/statistics/pupil?${params}`)
  },

  getGazeAt: (projectId: string, participantCode: string, timeS: number) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      t_s: String(timeS),
    })
    return apiFetch<GazeAtData>(`/api/projects/${projectId}/analytics/gaze-at?${params}`)
  },

  getGazeTimeseries: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<GazeTimeseriesData>(`/api/projects/${projectId}/analytics/timeseries/gaze?${params}`)
  },

  getGazeStatistics: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<GazeStatistics>(`/api/projects/${projectId}/analytics/statistics/gaze?${params}`)
  },

  getDistanceTimeseries: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<DistanceTimeseriesData>(`/api/projects/${projectId}/analytics/timeseries/distance?${params}`)
  },

  getDistanceStatistics: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<DistanceStatistics>(`/api/projects/${projectId}/analytics/statistics/distance?${params}`)
  },

  getGsrTimeseries: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<GsrTimeseriesData>(`/api/projects/${projectId}/analytics/timeseries/gsr?${params}`)
  },

  getGsrStatistics: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<GsrStatistics>(`/api/projects/${projectId}/analytics/statistics/gsr?${params}`)
  },

  getEegTimeseries: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    channels: string[] = [],
    smoothWindowS: number = 0.2,
    maxPoints: number = 5000
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      smooth_window_s: String(smoothWindowS),
      max_points: String(maxPoints),
    })
    if (channels.length > 0) {
      params.set("channels", channels.join(","))
    }
    return apiFetch<EegTimeseriesData>(`/api/projects/${projectId}/analytics/timeseries/eeg?${params}`)
  },

  getEegPsd: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    channels: string[] = [],
    maxFreqHz: number | null = null,
    useDb: boolean = true,
    maxPoints: number = 5000
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      use_db: String(useDb),
      max_points: String(maxPoints),
    })
    if (channels.length > 0) {
      params.set("channels", channels.join(","))
    }
    if (maxFreqHz != null) {
      params.set("max_freq_hz", String(maxFreqHz))
    }
    return apiFetch<EegPsdData>(`/api/projects/${projectId}/analytics/psd/eeg?${params}`)
  },

  getEegSpectrogram: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    channels: string[] = [],
    maxFreqHz: number | null = 25,
    useDb: boolean = true,
    normalize: string = "freq_demean",
    maxTimeBins: number = 600,
    maxFrequencyBins: number = 256
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      use_db: String(useDb),
      normalize,
      max_time_bins: String(maxTimeBins),
      max_frequency_bins: String(maxFrequencyBins),
    })
    if (channels.length > 0) {
      params.set("channels", channels.join(","))
    }
    if (maxFreqHz != null) {
      params.set("max_freq_hz", String(maxFreqHz))
    }
    return apiFetch<EegSpectrogramData>(`/api/projects/${projectId}/analytics/spectrogram/eeg?${params}`)
  },

  getEegTopography: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    channels: string[] = [],
    windowS: number = 0.33,
    overlapRatio: number = 0,
    removeDc: boolean = true,
    maxFrames: number = 5000
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      window_s: String(windowS),
      overlap_ratio: String(overlapRatio),
      remove_dc: String(removeDc),
      max_frames: String(maxFrames),
    })
    if (channels.length > 0) {
      params.set("channels", channels.join(","))
    }
    return apiFetch<EegTopographyData>(`/api/projects/${projectId}/analytics/topography/eeg?${params}`)
  },

  getScanpath: (projectId: string, participantCode: string, scenario: string) => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<ScanpathData>(`/api/projects/${projectId}/analytics/scanpath?${params}`)
  },

  getFixationData: (projectId: string, participantCode: string, scenario: string) => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<FixationData>(`/api/projects/${projectId}/analytics/fixations?${params}`)
  },

  getHeatmapOverlay: (projectId: string, participantCode: string, scenario: string) => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetchBlob(`/api/projects/${projectId}/analytics/heatmap?${params}`)
  },

  getFixationHistogram: (projectId: string, participantCode: string, scenario: string = "all") => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<FixationHistogramData>(`/api/projects/${projectId}/analytics/fixations/histogram?${params}`)
  },

  getAoiMetrics: (projectId: string, participantCode: string, scenario: string) => {
    const params = new URLSearchParams({ participant_code: participantCode, scenario })
    return apiFetch<AoiMetricsData>(`/api/projects/${projectId}/analytics/aois?${params}`)
  },
}
