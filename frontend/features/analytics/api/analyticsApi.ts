import { apiFetch, apiFetchBlobWithHeaders } from "@/lib/api/apiFetch"
import { DEFAULT_FIXATION_DURATION_MS } from "../types"
import type {
  AoiMetricsData,
  AnalyticsParticipant,
  AnalyticsScenario,
  ComparisonChartsResponse,
  CorrelationResponse,
  DistanceStatistics,
  DistanceTimeseriesData,
  EegPsdData,
  EegSpectrogramData,
  EegTopographyData,
  EegTimeseriesData,
  FixationData,
  FixationDurationMs,
  FixationHistogramData,
  FixationSensitivityData,
  GazeAtData,
  GazeStatistics,
  GazeTimeseriesData,
  GsrStatistics,
  GsrTimeseriesData,
  PupilStatistics,
  PupilTimeseriesData,
  ScanpathData,
} from "../types"

function appendTimeWindowParams(
  params: URLSearchParams,
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  if (startTimeS != null) {
    params.set("start_time_s", String(startTimeS))
  }
  if (endTimeS != null) {
    params.set("end_time_s", String(endTimeS))
  }
}

export const AnalyticsApi = {
  getParticipants: (projectId: string, signal?: AbortSignal) =>
    apiFetch<AnalyticsParticipant[]>(
      `/api/projects/${projectId}/analytics/participants`,
      { signal }
    ),

  getScenarios: (projectId: string, signal?: AbortSignal) =>
    apiFetch<AnalyticsScenario[]>(
      `/api/projects/${projectId}/analytics/scenarios`,
      { signal }
    ),

  getCorrelations: (
    projectId: string,
    participantCode: string,
    scenario: string,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    return apiFetch<CorrelationResponse>(
      `/api/projects/${projectId}/analytics/correlations?${params}`,
      { signal }
    )
  },

  getComparisonCharts: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    visualizations: string[] = [],
    maxPoints: number = 5000,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      max_points: String(maxPoints),
    })
    if (visualizations.length > 0) {
      params.set("visualizations", visualizations.join(","))
    }
    return apiFetch<ComparisonChartsResponse>(
      `/api/projects/${projectId}/analytics/comparison/charts?${params}`,
      { signal }
    )
  },

  getPupilTimeseries: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    appendTimeWindowParams(params, startTimeS, endTimeS)
    return apiFetch<PupilTimeseriesData>(
      `/api/projects/${projectId}/analytics/timeseries/pupil?${params}`,
      { signal }
    )
  },

  getPupilStatistics: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    appendTimeWindowParams(params, startTimeS, endTimeS)
    return apiFetch<PupilStatistics>(
      `/api/projects/${projectId}/analytics/statistics/pupil?${params}`,
      { signal }
    )
  },

  getGazeAt: (
    projectId: string,
    participantCode: string,
    timeS: number,
    scenario?: string | null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      t_s: String(timeS),
    })
    if (scenario && scenario !== "all") params.set("scenario", scenario)
    return apiFetch<GazeAtData>(
      `/api/projects/${projectId}/analytics/gaze-at?${params}`,
      { signal }
    )
  },

  getGazeTimeseries: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    appendTimeWindowParams(params, startTimeS, endTimeS)
    return apiFetch<GazeTimeseriesData>(
      `/api/projects/${projectId}/analytics/timeseries/gaze?${params}`,
      { signal }
    )
  },

  getGazeStatistics: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    appendTimeWindowParams(params, startTimeS, endTimeS)
    return apiFetch<GazeStatistics>(
      `/api/projects/${projectId}/analytics/statistics/gaze?${params}`,
      { signal }
    )
  },

  getDistanceTimeseries: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    appendTimeWindowParams(params, startTimeS, endTimeS)
    return apiFetch<DistanceTimeseriesData>(
      `/api/projects/${projectId}/analytics/timeseries/distance?${params}`,
      { signal }
    )
  },

  getDistanceStatistics: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    appendTimeWindowParams(params, startTimeS, endTimeS)
    return apiFetch<DistanceStatistics>(
      `/api/projects/${projectId}/analytics/statistics/distance?${params}`,
      { signal }
    )
  },

  getGsrTimeseries: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    appendTimeWindowParams(params, startTimeS, endTimeS)
    return apiFetch<GsrTimeseriesData>(
      `/api/projects/${projectId}/analytics/timeseries/gsr?${params}`,
      { signal }
    )
  },

  getGsrStatistics: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    appendTimeWindowParams(params, startTimeS, endTimeS)
    return apiFetch<GsrStatistics>(
      `/api/projects/${projectId}/analytics/statistics/gsr?${params}`,
      { signal }
    )
  },

  getEegTimeseries: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    channels: string[] = [],
    smoothWindowS: number = 0.2,
    maxPoints: number = 5000,
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
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
    if (startTimeS != null) {
      params.set("start_time_s", String(startTimeS))
    }
    if (endTimeS != null) {
      params.set("end_time_s", String(endTimeS))
    }
    return apiFetch<EegTimeseriesData>(
      `/api/projects/${projectId}/analytics/timeseries/eeg?${params}`,
      { signal }
    )
  },

  getEegPsd: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    channels: string[] = [],
    maxFreqHz: number | null = null,
    useDb: boolean = true,
    maxPoints: number = 5000,
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    signal?: AbortSignal
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
    if (startTimeS != null) {
      params.set("start_time_s", String(startTimeS))
    }
    if (endTimeS != null) {
      params.set("end_time_s", String(endTimeS))
    }
    return apiFetch<EegPsdData>(
      `/api/projects/${projectId}/analytics/psd/eeg?${params}`,
      { signal }
    )
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
    maxFrequencyBins: number = 256,
    signal?: AbortSignal
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
    return apiFetch<EegSpectrogramData>(
      `/api/projects/${projectId}/analytics/spectrogram/eeg?${params}`,
      { signal }
    )
  },

  getEegTopography: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    channels: string[] = [],
    windowS: number = 0.33,
    overlapRatio: number = 0,
    removeDc: boolean = true,
    maxFrames: number = 5000,
    signal?: AbortSignal
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
    return apiFetch<EegTopographyData>(
      `/api/projects/${projectId}/analytics/topography/eeg?${params}`,
      { signal }
    )
  },

  getScanpath: (
    projectId: string,
    participantCode: string,
    scenario: string,
    minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    params.set("min_fixation_duration_ms", String(minFixationDurationMs))
    return apiFetch<ScanpathData>(
      `/api/projects/${projectId}/analytics/scanpath?${params}`,
      { signal }
    )
  },

  getFixationData: (
    projectId: string,
    participantCode: string,
    scenario: string,
    minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    params.set("min_fixation_duration_ms", String(minFixationDurationMs))
    return apiFetch<FixationData>(
      `/api/projects/${projectId}/analytics/fixations?${params}`,
      { signal }
    )
  },

  getHeatmapOverlay: (
    projectId: string,
    participantCode: string,
    scenario: string,
    transformToken: string = "screen-stimulus-v1",
    cacheGeneration?: number | null,
    minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    params.set("transform_token", transformToken)
    params.set("min_fixation_duration_ms", String(minFixationDurationMs))
    // The server ignores this for cache identity, but varying the URL is what
    // makes the browser and the in-memory blob cache drop the stale overlay
    // after a re-upload bumps the generation.
    if (cacheGeneration != null) {
      params.set("generation", String(cacheGeneration))
    }
    return apiFetchBlobWithHeaders(
      `/api/projects/${projectId}/analytics/heatmap?${params}`,
      { signal }
    )
  },

  getFixationHistogram: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    params.set("min_fixation_duration_ms", String(minFixationDurationMs))
    return apiFetch<FixationHistogramData>(
      `/api/projects/${projectId}/analytics/fixations/histogram?${params}`,
      { signal }
    )
  },

  getFixationSensitivity: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    return apiFetch<FixationSensitivityData>(
      `/api/projects/${projectId}/analytics/fixations/sensitivity?${params}`,
      { signal }
    )
  },

  getAoiMetrics: (
    projectId: string,
    participantCode: string,
    scenario: string,
    minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    params.set("min_fixation_duration_ms", String(minFixationDurationMs))
    return apiFetch<AoiMetricsData>(
      `/api/projects/${projectId}/analytics/aois?${params}`,
      { signal }
    )
  },
}
