import { apiFetch, apiFetchBlob } from "@/lib/api/apiFetch"
import type {
  AnalyticsParticipant,
  AnalyticsScenario,
  DistanceStatistics,
  DistanceTimeseriesData,
  FixationData,
  FixationHistogramData,
  GazeAtData,
  GazeStatistics,
  GazeTimeseriesData,
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
}
