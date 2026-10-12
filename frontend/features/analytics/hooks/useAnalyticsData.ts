"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AnalyticsApi } from "../api/analyticsApi"
import { requestAnalytics } from "../analyticsCache"
import { useAnalyticsRevision } from "./useAnalyticsContext"
import { DEFAULT_FIXATION_DURATION_MS } from "../types"
import type {
  AnalyticsParticipant,
  AnalyticsScenario,
  FixationDurationMs,
  GazeAtData,
  HeatmapTransformHeaders,
} from "../types"

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
  request: ((signal: AbortSignal) => Promise<T>) | null,
  errorMessage = "Error loading analytics"
) {
  const [state, setState] = useRequestState<T>(request)
  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    request(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setState({ request, data, loading: false, error: null })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            request,
            data: null,
            loading: false,
            error:
              error instanceof Error && error.message
                ? error.message
                : errorMessage,
          })
      }
    )
    return () => {
      controller.abort()
    }
  }, [request, errorMessage, setState])
  return { data: state.data, loading: state.loading, error: state.error }
}

// Prepare complete API tuples before serializing: defaults and list contents are
// part of the request identity, while newly allocated but equal arrays are not.
function makeAnalyticsHook<
  Args extends unknown[],
  Result,
  HookArgs extends unknown[],
>(
  operation: string,
  apiMethod: (...args: [...Args, signal?: AbortSignal]) => Promise<Result>,
  prepare: (...args: HookArgs) => Args | null,
  errorMessage = "Error loading analytics"
) {
  return function useGeneratedAnalytics(...args: HookArgs) {
    const revision = useAnalyticsRevision()
    const requestKey = JSON.stringify(prepare(...args))
    const load = useCallback(
      (signal: AbortSignal) => {
        const prepared = JSON.parse(requestKey) as Args
        return requestAnalytics(String(prepared[0]), operation, prepared,
          (sharedSignal) => apiMethod(...prepared, sharedSignal), signal, revision)
      },
      [requestKey, revision]
    )
    return useAnalyticsRequest(
      requestKey === "null" ? null : load,
      errorMessage
    )
  }
}


type ApiArgs<Method extends (...args: never[]) => unknown> =
  Parameters<Method> extends [...infer Args, signal?: AbortSignal] ? Args : never

function projectArgs(projectId: string | null): [string] | null {
  return projectId ? [projectId] : null
}

function selectionArgs(
  projectId: string | null,
  participantCode: string | null,
  scenario = "all"
): [string, string, string] | null {
  return projectId && participantCode
    ? [projectId, participantCode, scenario]
    : null
}

function windowArgs(
  projectId: string | null,
  participantCode: string | null,
  scenario = "all",
  startTimeS: number | null = null,
  endTimeS: number | null = null
): [string, string, string, number | null, number | null] | null {
  const selection = selectionArgs(projectId, participantCode, scenario)
  return selection ? [...selection, startTimeS, endTimeS] : null
}

function fixationArgs(
  projectId: string | null,
  participantCode: string | null,
  scenario = "all",
  minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS
): [string, string, string, FixationDurationMs] | null {
  const selection = selectionArgs(projectId, participantCode, scenario)
  return selection ? [...selection, minFixationDurationMs] : null
}

function spatialArgs(
  projectId: string | null,
  participantCode: string | null,
  scenario: string,
  minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS
) {
  return scenario && scenario !== "all"
    ? fixationArgs(projectId, participantCode, scenario, minFixationDurationMs)
    : null
}

const useParticipants = makeAnalyticsHook(
  "getParticipants", AnalyticsApi.getParticipants,
  projectArgs
)
const useScenarios = makeAnalyticsHook(
  "getScenarios", AnalyticsApi.getScenarios, projectArgs)

export function useAnalyticsParticipants(projectId: string | null) {
  const { data, loading } = useParticipants(projectId)
  return { participants: data ?? EMPTY_PARTICIPANTS, loading }
}

export function useAnalyticsScenarios(projectId: string | null) {
  const { data, loading } = useScenarios(projectId)
  return { scenarios: data ?? EMPTY_SCENARIOS, loading }
}

export const usePupilTimeseries = makeAnalyticsHook(
  "getPupilTimeseries", AnalyticsApi.getPupilTimeseries,
  windowArgs,
  "Error loading timeseries"
)
export const useGazeTimeseries = makeAnalyticsHook(
  "getGazeTimeseries", AnalyticsApi.getGazeTimeseries,
  windowArgs,
  "Error loading gaze timeseries"
)
export const useGazeStatistics = makeAnalyticsHook(
  "getGazeStatistics", AnalyticsApi.getGazeStatistics,
  windowArgs
)
export const useDistanceTimeseries = makeAnalyticsHook(
  "getDistanceTimeseries", AnalyticsApi.getDistanceTimeseries,
  windowArgs,
  "Error loading distance timeseries"
)
export const useDistanceStatistics = makeAnalyticsHook(
  "getDistanceStatistics", AnalyticsApi.getDistanceStatistics,
  windowArgs
)
export const useGsrTimeseries = makeAnalyticsHook(
  "getGsrTimeseries", AnalyticsApi.getGsrTimeseries,
  windowArgs,
  "Error loading GSR timeseries"
)
export const useGsrStatistics = makeAnalyticsHook(
  "getGsrStatistics", AnalyticsApi.getGsrStatistics,
  windowArgs
)
export const useScanpathData = makeAnalyticsHook(
  "getScanpath", AnalyticsApi.getScanpath,
  spatialArgs,
  "Error loading scanpath data"
)
export const useFixationData = makeAnalyticsHook(
  "getFixationData", AnalyticsApi.getFixationData,
  spatialArgs,
  "Error loading fixation data"
)
export const useAoiMetrics = makeAnalyticsHook(
  "getAoiMetrics", AnalyticsApi.getAoiMetrics,
  spatialArgs,
  "Error loading AOI metrics"
)
export const useFixationHistogram = makeAnalyticsHook(
  "getFixationHistogram", AnalyticsApi.getFixationHistogram,
  fixationArgs,
  "Error loading histogram"
)
export const useFixationSensitivity = makeAnalyticsHook(
  "getFixationSensitivity", AnalyticsApi.getFixationSensitivity,
  selectionArgs,
  "Error loading fixation sensitivity"
)

export const useComparisonCharts = makeAnalyticsHook(
  "getComparisonCharts:v3", AnalyticsApi.getComparisonCharts,
  (
    projectId: string | null,
    participantCode: string | null,
    scenario: string = "all",
    visualizationIds: string[] = [],
    maxPoints: number = 5000
  ): ApiArgs<typeof AnalyticsApi.getComparisonCharts> | null =>
    projectId && participantCode && visualizationIds.join(",")
      ? [
          projectId,
          participantCode,
          scenario,
          visualizationIds.join(",").split(",").filter(Boolean),
          maxPoints,
        ]
      : null,
  "Error loading comparison charts"
)

export const useEegTimeseries = makeAnalyticsHook(
  "getEegTimeseries", AnalyticsApi.getEegTimeseries,
  (
    projectId: string | null,
    participantCode: string | null,
    scenario: string = "all",
    channels: string[] = [],
    smoothWindowS: number = 0.2,
    maxPoints: number = 5000,
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    decimation: string = "linspace"
  ): ApiArgs<typeof AnalyticsApi.getEegTimeseries> | null =>
    projectId && participantCode
      ? [
          projectId,
          participantCode,
          scenario,
          channels.join(",") ? channels.join(",").split(",") : [],
          smoothWindowS,
          maxPoints,
          startTimeS,
          endTimeS,
          decimation,
        ]
      : null,
  "Error loading EEG timeseries"
)

export const useEegPsd = makeAnalyticsHook(
  "getEegPsd", AnalyticsApi.getEegPsd,
  (
    projectId: string | null,
    participantCode: string | null,
    scenario: string = "all",
    channels: string[] = [],
    maxFreqHz: number | null = null,
    useDb: boolean = true,
    maxPoints: number = 5000,
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    excludeArtifactWindows: boolean = false
  ): ApiArgs<typeof AnalyticsApi.getEegPsd> | null =>
    projectId && participantCode
      ? [
          projectId,
          participantCode,
          scenario,
          channels.join(",") ? channels.join(",").split(",") : [],
          maxFreqHz,
          useDb,
          maxPoints,
          startTimeS,
          endTimeS,
          excludeArtifactWindows,
        ]
      : null,
  "Error loading EEG PSD"
)

export const useEegSpectrogram = makeAnalyticsHook(
  "getEegSpectrogram", AnalyticsApi.getEegSpectrogram,
  (
    projectId: string | null,
    participantCode: string | null,
    scenario: string = "all",
    channels: string[] = [],
    maxFreqHz: number | null = 25,
    useDb: boolean = true,
    normalize: string = "none",
    maxTimeBins: number = 600,
    maxFrequencyBins: number = 256,
    startTimeS: number | null = null,
    endTimeS: number | null = null,
    perChannelColorDomain: boolean = false
  ): ApiArgs<typeof AnalyticsApi.getEegSpectrogram> | null =>
    projectId && participantCode
      ? [
          projectId,
          participantCode,
          scenario,
          channels.join(",") ? channels.join(",").split(",") : [],
          maxFreqHz,
          useDb,
          normalize,
          maxTimeBins,
          maxFrequencyBins,
          startTimeS,
          endTimeS,
          perChannelColorDomain,
        ]
      : null,
  "Error loading EEG spectrogram"
)

export const useEegTopography = makeAnalyticsHook(
  "getEegTopography", AnalyticsApi.getEegTopography,
  (
    projectId: string | null,
    participantCode: string | null,
    scenario: string = "all",
    channels: string[] = [],
    windowS: number = 2.0,
    overlapRatio: number = 0.5,
    removeDc: boolean = true,
    maxFrames: number = 600,
    startTimeS: number | null = null,
    endTimeS: number | null = null
  ): ApiArgs<typeof AnalyticsApi.getEegTopography> | null =>
    projectId && participantCode
      ? [
          projectId,
          participantCode,
          scenario,
          channels.join(",") ? channels.join(",").split(",") : [],
          windowS,
          overlapRatio,
          removeDc,
          maxFrames,
          startTimeS,
          endTimeS,
        ]
      : null,
  "Error loading EEG topography"
)

export function useGazeAt(
  projectId: string | null,
  participantCode: string | null
) {
  const revision = useAnalyticsRevision()
  const [data, setData] = useState<GazeAtData | null>(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const selectionKey = JSON.stringify([projectId, participantCode, revision])
  const [previousSelection, setPreviousSelection] = useState(selectionKey)
  if (selectionKey !== previousSelection) {
    setPreviousSelection(selectionKey)
    setData(null)
    setLoading(false)
  }

  const fetchGaze = useCallback(
    async (timeS: number) => {
      if (!projectId || !participantCode) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      try {
        const result = await requestAnalytics(projectId, "gaze-at", [participantCode, timeS, null],
          (signal) => AnalyticsApi.getGazeAt(projectId, participantCode, timeS, undefined, signal), controller.signal, revision)
        if (!controller.signal.aborted) setData(result)
      } catch {
        if (!controller.signal.aborted) setData(null)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [projectId, participantCode, revision]
  )

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [projectId, participantCode, revision]
  )

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setData(null)
    setLoading(false)
  }, [])

  return { data, loading, fetchGaze, clear }
}

export function useHeatmapOverlay(
  projectId: string | null,
  participantCode: string | null,
  scenario: string,
  transformToken: string = "screen-stimulus-v1",
  cacheGeneration: number | null = null,
  minFixationDurationMs: FixationDurationMs = DEFAULT_FIXATION_DURATION_MS
) {
  const revision = useAnalyticsRevision()
  const load = useCallback(
    (signal: AbortSignal) =>
      requestAnalytics(projectId!, "heatmap-overlay", [participantCode, scenario, transformToken, cacheGeneration, minFixationDurationMs], (sharedSignal) => AnalyticsApi.getHeatmapOverlay(
        projectId!,
        participantCode!,
        scenario,
        transformToken,
        cacheGeneration,
        minFixationDurationMs,
        sharedSignal
      ), signal, revision),
    [
      projectId,
      participantCode,
      scenario,
      transformToken,
      cacheGeneration,
      minFixationDurationMs,
      revision,
    ]
  )
  const request =
    projectId &&
    participantCode &&
    scenario &&
    scenario !== "all" &&
    cacheGeneration != null
      ? load
      : null
  const [state, setState] = useRequestState<{
    overlayUrl: string
    coordinateTransform: HeatmapTransformHeaders
  }>(request)

  useEffect(() => {
    // A generation is required: generation-free URLs can hit an older ingestion.
    if (!request) return
    const controller = new AbortController()
    let currentUrl: string | null = null
    request(controller.signal)
      .then(({ blob, headers }) => {
        if (controller.signal.aborted) return
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
              status: headers.get(
                "X-Stimulus-Transform-Status"
              ) as HeatmapTransformHeaders["status"],
              coordinateSpace: headers.get("X-Stimulus-Coordinate-Space"),
              contractVersion: version && version !== "none" ? version : null,
              contractFingerprint:
                fingerprint && fingerprint !== "none" ? fingerprint : null,
              warningCodes: warnings ? warnings.split(",").filter(Boolean) : [],
            },
          },
        })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            request,
            data: null,
            loading: false,
            error:
              error instanceof Error && error.message
                ? error.message
                : "Error loading heatmap",
          })
      })
    return () => {
      controller.abort()
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
