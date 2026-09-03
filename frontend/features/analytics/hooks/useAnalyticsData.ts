"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AnalyticsApi } from "../api/analyticsApi"
import { DEFAULT_FIXATION_DURATION_MS } from "../types"
import type { AnalyticsParticipant, AnalyticsScenario, FixationDurationMs, GazeAtData, HeatmapTransformHeaders } from "../types"

const EMPTY_PARTICIPANTS: AnalyticsParticipant[] = []
const EMPTY_SCENARIOS: AnalyticsScenario[] = []

type RequestState<T> = {
  request: object | null
  data: T | null
  loading: boolean
  error: string | null
}

function pendingRequest<T>(request: object | null): RequestState<T> {
  return { request, data: null, loading: request !== null, error: null }
}

function useRequestState<T>(request: object | null) {
  const [state, setState] = useState(() => pendingRequest<T>(request))
  // Reset before children render a different selection. A request's identity is
  // its memoized callback, including every API argument and disabled selection.
  if (state.request !== request) {
    const next = pendingRequest<T>(request)
    setState(next)
    return [next, setState] as const
  }
  return [state, setState] as const
}

function useAnalyticsRequest<T>(
  request: (() => Promise<T>) | null,
  errorMessage = "Error loading analytics"
) {
  const [state, setState] = useRequestState<T>(request)
  useEffect(() => {
    if (!request) return
    let cancelled = false
    request().then(
      (data) => {
        if (!cancelled) setState({ request, data, loading: false, error: null })
      },
      (error: unknown) => {
        if (!cancelled) setState({
          request,
          data: null,
          loading: false,
          error: error instanceof Error && error.message ? error.message : errorMessage,
        })
      }
    )
    return () => { cancelled = true }
  }, [request, errorMessage, setState])
  return { data: state.data, loading: state.loading, error: state.error }
}

export function useAnalyticsParticipants(projectId: string | null) {
  const load = useCallback(
    () => AnalyticsApi.getParticipants(
      projectId!
    ),
    [projectId]
  )
  const { data, loading } = useAnalyticsRequest(
    projectId ? load : null
  )
  return { participants: data ?? EMPTY_PARTICIPANTS, loading }
}

export function useAnalyticsScenarios(projectId: string | null) {
  const load = useCallback(
    () => AnalyticsApi.getScenarios(
      projectId!
    ),
    [projectId]
  )
  const { data, loading } = useAnalyticsRequest(
    projectId ? load : null
  )
  return { scenarios: data ?? EMPTY_SCENARIOS, loading }
}

export function usePupilTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const load = useCallback(
    () => AnalyticsApi.getPupilTimeseries(
      projectId!,
      participantCode!,
      scenario,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, startTimeS, endTimeS]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading timeseries"
  )
  return { data, loading, error }
}

export function usePupilStatistics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const load = useCallback(
    () => AnalyticsApi.getPupilStatistics(
      projectId!,
      participantCode!,
      scenario,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, startTimeS, endTimeS]
  )
  const { data, loading } = useAnalyticsRequest(
    projectId && participantCode ? load : null
  )
  return { data, loading }
}

export function useGazeAt(
  projectId: string | null,
  participantCode: string | null
) {
  const [data, setData] = useState<GazeAtData | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchGaze = useCallback(
    async (timeS: number) => {
      if (!projectId || !participantCode) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      try {
        const result = await AnalyticsApi.getGazeAt(
          projectId,
          participantCode,
          timeS
        )
        if (!controller.signal.aborted) setData(result)
      } catch {
        if (!controller.signal.aborted) setData(null)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [projectId, participantCode]
  )

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setData(null)
  }, [])

  return { data, loading, fetchGaze, clear }
}

export function useComparisonCharts(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  visualizationIds: string[] = [],
  maxPoints: number = 5000
) {
  const visualizationsKey = visualizationIds.join(",")
  const load = useCallback(
    () => AnalyticsApi.getComparisonCharts(
      projectId!,
      participantCode!,
      scenario,
      visualizationsKey.split(",").filter(Boolean),
      maxPoints
    ),
    [projectId, participantCode, scenario, visualizationsKey, maxPoints]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode && visualizationsKey ? load : null, "Error loading comparison charts"
  )
  return { data, loading, error }
}

export function useGazeTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const load = useCallback(
    () => AnalyticsApi.getGazeTimeseries(
      projectId!,
      participantCode!,
      scenario,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, startTimeS, endTimeS]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading gaze timeseries"
  )
  return { data, loading, error }
}

export function useGazeStatistics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const load = useCallback(
    () => AnalyticsApi.getGazeStatistics(
      projectId!,
      participantCode!,
      scenario,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, startTimeS, endTimeS]
  )
  const { data, loading } = useAnalyticsRequest(
    projectId && participantCode ? load : null
  )
  return { data, loading }
}

export function useDistanceTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const load = useCallback(
    () => AnalyticsApi.getDistanceTimeseries(
      projectId!,
      participantCode!,
      scenario,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, startTimeS, endTimeS]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading distance timeseries"
  )
  return { data, loading, error }
}

export function useDistanceStatistics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const load = useCallback(
    () => AnalyticsApi.getDistanceStatistics(
      projectId!,
      participantCode!,
      scenario,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, startTimeS, endTimeS]
  )
  const { data, loading } = useAnalyticsRequest(
    projectId && participantCode ? load : null
  )
  return { data, loading }
}

export function useGsrTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const load = useCallback(
    () => AnalyticsApi.getGsrTimeseries(
      projectId!,
      participantCode!,
      scenario,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, startTimeS, endTimeS]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading GSR timeseries"
  )
  return { data, loading, error }
}

export function useGsrStatistics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const load = useCallback(
    () => AnalyticsApi.getGsrStatistics(
      projectId!,
      participantCode!,
      scenario,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, startTimeS, endTimeS]
  )
  const { data, loading } = useAnalyticsRequest(
    projectId && participantCode ? load : null
  )
  return { data, loading }
}

export function useEegTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  channels: string[] = [],
  smoothWindowS: number = 0.2,
  maxPoints: number = 5000,
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const channelsKey = channels.join(",")
  const load = useCallback(
    () => AnalyticsApi.getEegTimeseries(
      projectId!,
      participantCode!,
      scenario,
      channelsKey ? channelsKey.split(",") : [],
      smoothWindowS,
      maxPoints,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, channelsKey, smoothWindowS, maxPoints, startTimeS, endTimeS]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading EEG timeseries"
  )
  return { data, loading, error }
}

export function useEegPsd(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  channels: string[] = [],
  maxFreqHz: number | null = null,
  useDb: boolean = true,
  maxPoints: number = 5000,
  startTimeS: number | null = null,
  endTimeS: number | null = null
) {
  const channelsKey = channels.join(",")
  const load = useCallback(
    () => AnalyticsApi.getEegPsd(
      projectId!,
      participantCode!,
      scenario,
      channelsKey ? channelsKey.split(",") : [],
      maxFreqHz,
      useDb,
      maxPoints,
      startTimeS,
      endTimeS
    ),
    [projectId, participantCode, scenario, channelsKey, maxFreqHz, useDb, maxPoints, startTimeS, endTimeS]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading EEG PSD"
  )
  return { data, loading, error }
}

export function useEegSpectrogram(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  channels: string[] = [],
  maxFreqHz: number | null = 25,
  useDb: boolean = true,
  normalize: string = "freq_demean",
  maxTimeBins: number = 600,
  maxFrequencyBins: number = 256
) {
  const channelsKey = channels.join(",")
  const load = useCallback(
    () => AnalyticsApi.getEegSpectrogram(
      projectId!,
      participantCode!,
      scenario,
      channelsKey ? channelsKey.split(",") : [],
      maxFreqHz,
      useDb,
      normalize,
      maxTimeBins,
      maxFrequencyBins
    ),
    [projectId, participantCode, scenario, channelsKey, maxFreqHz, useDb, normalize, maxTimeBins, maxFrequencyBins]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading EEG spectrogram"
  )
  return { data, loading, error }
}

export function useEegTopography(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  channels: string[] = [],
  windowS: number = 0.33,
  overlapRatio: number = 0,
  removeDc: boolean = true,
  maxFrames: number = 5000
) {
  const channelsKey = channels.join(",")
  const load = useCallback(
    () => AnalyticsApi.getEegTopography(
      projectId!,
      participantCode!,
      scenario,
      channelsKey ? channelsKey.split(",") : [],
      windowS,
      overlapRatio,
      removeDc,
      maxFrames
    ),
    [projectId, participantCode, scenario, channelsKey, windowS, overlapRatio, removeDc, maxFrames]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading EEG topography"
  )
  return { data, loading, error }
}

export function useScanpathData(
  projectId: string | null,
  participantCode: string | null,
  scenario: string,
  minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS
) {
  const load = useCallback(
    () => AnalyticsApi.getScanpath(
      projectId!,
      participantCode!,
      scenario,
      minFixationDurationMs
    ),
    [projectId, participantCode, scenario, minFixationDurationMs]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode && scenario && scenario !== "all" ? load : null, "Error loading scanpath data"
  )
  return { data, loading, error }
}

export function useFixationData(
  projectId: string | null,
  participantCode: string | null,
  scenario: string,
  minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS
) {
  const load = useCallback(
    () => AnalyticsApi.getFixationData(
      projectId!,
      participantCode!,
      scenario,
      minFixationDurationMs
    ),
    [projectId, participantCode, scenario, minFixationDurationMs]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode && scenario && scenario !== "all" ? load : null, "Error loading fixation data"
  )
  return { data, loading, error }
}

export function useHeatmapOverlay(
  projectId: string | null,
  participantCode: string | null,
  scenario: string,
  transformToken: string = "screen-stimulus-v1",
  cacheGeneration: number | null = null,
  minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS
) {
  const load = useCallback(
    () => AnalyticsApi.getHeatmapOverlay(
      projectId!,
      participantCode!,
      scenario,
      transformToken,
      cacheGeneration,
      minFixationDurationMs
    ),
    [projectId, participantCode, scenario, transformToken, cacheGeneration, minFixationDurationMs]
  )
  const request = projectId && participantCode && scenario && scenario !== "all" && cacheGeneration != null ? load : null
  const [state, setState] = useRequestState<{
    overlayUrl: string
    coordinateTransform: HeatmapTransformHeaders
  }>(request)

  useEffect(() => {
    // A generation is required: generation-free URLs can hit an older ingestion.
    if (!request) return
    let cancelled = false
    let currentUrl: string | null = null
    request()
      .then(({ blob, headers }) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        const warnings = headers.get("X-Stimulus-Transform-Warnings")
        const version = headers.get("X-Stimulus-Transform-Version")
        const fingerprint = headers.get("X-Stimulus-Transform-Fingerprint")
        setState({
          request,
          loading: false,
          error: null,
          data: {
            overlayUrl: currentUrl,
            coordinateTransform: {
              status: headers.get("X-Stimulus-Transform-Status") as HeatmapTransformHeaders["status"],
              coordinateSpace: headers.get("X-Stimulus-Coordinate-Space"),
              contractVersion: version && version !== "none" ? version : null,
              contractFingerprint: fingerprint && fingerprint !== "none" ? fingerprint : null,
              warningCodes: warnings ? warnings.split(",").filter(Boolean) : [],
            },
          },
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({
          request,
          data: null,
          loading: false,
          error: error instanceof Error && error.message ? error.message : "Error loading heatmap",
        })
      })
    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [request, setState])

  return {
    overlayUrl: state.data?.overlayUrl ?? null,
    coordinateTransform: state.data?.coordinateTransform ?? null,
    loading: state.loading,
    error: state.error,
  }
}

export function useFixationHistogram(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS
) {
  const load = useCallback(
    () => AnalyticsApi.getFixationHistogram(
      projectId!,
      participantCode!,
      scenario,
      minFixationDurationMs
    ),
    [projectId, participantCode, scenario, minFixationDurationMs]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading histogram"
  )
  return { data, loading, error }
}

export function useFixationSensitivity(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const load = useCallback(
    () => AnalyticsApi.getFixationSensitivity(
      projectId!,
      participantCode!,
      scenario
    ),
    [projectId, participantCode, scenario]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode ? load : null, "Error loading fixation sensitivity"
  )
  return { data, loading, error }
}

export function useAoiMetrics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string,
  minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS
) {
  const load = useCallback(
    () => AnalyticsApi.getAoiMetrics(
      projectId!,
      participantCode!,
      scenario,
      minFixationDurationMs
    ),
    [projectId, participantCode, scenario, minFixationDurationMs]
  )
  const { data, loading, error } = useAnalyticsRequest(
    projectId && participantCode && scenario && scenario !== "all" ? load : null, "Error loading AOI metrics"
  )
  return { data, loading, error }
}

