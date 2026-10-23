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
  PupilTimeseriesData,
  ScanpathData,
  ScenarioTimingData,
} from "../types"

interface DisplayTimeseriesData {
  pupil: PupilTimeseriesData
  gaze: GazeTimeseriesData
  distance: DistanceTimeseriesData
  gsr: GsrTimeseriesData
}
export type DisplayTimeseriesKind = keyof DisplayTimeseriesData

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

  getComparisonCharts: async (
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
    const response = await apiFetch<ComparisonChartsResponse>(
      `/api/projects/${projectId}/analytics/comparison/charts?${params}`,
      { signal }
    )
    if (
      response.contract_version !== "comparison-charts-v3" ||
      response.statistics_schema_version !== "comparison-statistics-v1" ||
      !Array.isArray(response.statistics)
    ) {
      throw new Error("Versión incompatible de la respuesta de comparativas")
    }
    return response
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
    decimation: string = "linspace",
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      smooth_window_s: String(smoothWindowS),
      max_points: String(maxPoints),
      decimation,
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
    excludeArtifactWindows: boolean = false,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      use_db: String(useDb),
      max_points: String(maxPoints),
      exclude_artifact_windows: String(excludeArtifactWindows),
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
    normalize: string = "none",
    maxTimeBins: number = 600,
    maxFrequencyBins: number = 256,
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    perChannelColorDomain: boolean = false,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      use_db: String(useDb),
      normalize,
      max_time_bins: String(maxTimeBins),
      max_frequency_bins: String(maxFrequencyBins),
      per_channel_color_domain: String(perChannelColorDomain),
      // A short scenario otherwise returns ~10 windows, drawn as wide blocks.
      min_time_bins: String(Math.min(120, maxTimeBins)),
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
    windowS: number = 2.0,
    overlapRatio: number = 0.5,
    removeDc: boolean = true,
    maxFrames: number = 600,
    startTimeS: number | null = null,
    endTimeS: number | null = null,
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
    if (startTimeS != null) {
      params.set("start_time_s", String(startTimeS))
    }
    if (endTimeS != null) {
      params.set("end_time_s", String(endTimeS))
    }
    return apiFetch<EegTopographyData>(
      `/api/projects/${projectId}/analytics/topography/eeg?${params}`,
      { signal }
    )
  },

  /** Where a scenario starts in one recording (seconds of that recording). */
  getScenarioTiming: (
    projectId: string,
    participantCode: string,
    scenario: string = "all",
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
    })
    return apiFetch<ScenarioTimingData>(
      `/api/projects/${projectId}/analytics/scenario-timing?${params}`,
      { signal }
    )
  },

  /**
   * Pupil, gaze, distance or GSR trace with an explicit point budget and
   * display reduction; "minmax_envelope" keeps every bucket's extremes.
   */
  getDisplayTimeseries: <Kind extends DisplayTimeseriesKind>(
    kind: Kind,
    projectId: string,
    participantCode: string,
    scenario: string,
    options: {
      startTimeS?: number | null
      endTimeS?: number | null
      maxPoints: number
      decimation?: "linspace" | "minmax_envelope"
    },
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams({
      participant_code: participantCode,
      scenario,
      max_points: String(options.maxPoints),
      decimation: options.decimation ?? "linspace",
    })
    appendTimeWindowParams(params, options.startTimeS ?? null, options.endTimeS ?? null)
    return apiFetch<DisplayTimeseriesData[Kind]>(
      `/api/projects/${projectId}/analytics/timeseries/${kind}?${params}`,
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
      { signal, cache: "no-store" }
    )
  },

  getGroupHeatmapOverlay: async (
    projectId: string,
    participantCodes: string[],
    scenario: string,
    minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS,
    generation?: number | null,
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams()
    // Sorted so the same group always asks for the same URL.
    for (const code of [...new Set(participantCodes)].sort()) {
      params.append("participant_codes", code)
    }
    params.set("scenario", scenario)
    params.set("min_fixation_duration_ms", String(minFixationDurationMs))
    if (generation != null) {
      params.set("generation", String(generation))
    }
    const { blob, headers } = await apiFetchBlobWithHeaders(
      `/api/projects/${projectId}/analytics/heatmap/group?${params}`,
      { signal, cache: "no-store" }
    )
    // Each code is percent-encoded by the server, so a comma inside one is safe.
    const codes = (name: string) =>
      (headers.get(name) ?? "")
        .split(",")
        .filter(Boolean)
        .map((code) => decodeURIComponent(code))
    return {
      blob,
      headers,
      participants: codes("X-Group-Participants"),
      skipped: codes("X-Group-Participants-Skipped"),
    }
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
