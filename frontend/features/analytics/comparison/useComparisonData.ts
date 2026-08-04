"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { AnalyticsApi } from "../api/analyticsApi"
import {
  useAoiMetrics,
  useDistanceTimeseries,
  useEegPsd,
  useEegSpectrogram,
  useEegTimeseries,
  useFixationData,
  useFixationHistogram,
  useGazeTimeseries,
  useGsrTimeseries,
  useHeatmapOverlay,
  usePupilTimeseries,
  useScanpathData,
} from "../hooks/useAnalyticsData"
import type { GazeAtData } from "../types"
import type { VisualizationId } from "./registry"

interface ObjectUrlState {
  sourceUrl: string | null
  url: string | null
  loading: boolean
  error: string | null
}

const EMPTY_OBJECT_URL_STATE: ObjectUrlState = {
  sourceUrl: null,
  url: null,
  loading: false,
  error: null,
}

function useComparisonGazeAt(
  projectId: string | null,
  participantCode: string | null,
  scenario: string | null,
  activeTimeS: number | null
) {
  const [data, setData] = useState<GazeAtData | null>(null)
  const [loading, setLoading] = useState(false)
  const [requestedKey, setRequestedKey] = useState<string | null>(null)
  const requestId = useRef(0)
  const activeRequestKey =
    projectId && participantCode && scenario && activeTimeS != null
      ? JSON.stringify([projectId, participantCode, scenario, activeTimeS])
      : null

  const clear = useCallback(() => {
    requestId.current += 1
    setRequestedKey(null)
    setData(null)
    setLoading(false)
  }, [])

  const fetchGaze = useCallback(
    async (timeS: number) => {
      if (!projectId || !participantCode || !scenario) return
      const currentRequest = ++requestId.current
      setRequestedKey(
        JSON.stringify([projectId, participantCode, scenario, timeS])
      )
      setData(null)
      setLoading(true)
      try {
        const result = await AnalyticsApi.getGazeAt(
          projectId,
          participantCode,
          timeS,
          scenario
        )
        if (requestId.current === currentRequest) setData(result)
      } catch {
        if (requestId.current === currentRequest) setData(null)
      } finally {
        if (requestId.current === currentRequest) setLoading(false)
      }
    },
    [participantCode, projectId, scenario]
  )

  const matchesActiveRequest =
    activeRequestKey != null && requestedKey === activeRequestKey

  return {
    data: matchesActiveRequest ? data : null,
    loading: activeRequestKey != null && (!matchesActiveRequest || loading),
    clear,
    fetchGaze,
  }
}

function useObjectUrl(url: string | null, enabled: boolean): ObjectUrlState {
  const [state, setState] = useState<ObjectUrlState>(EMPTY_OBJECT_URL_STATE)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    if (!enabled || !url) {
      Promise.resolve().then(() => {
        if (!cancelled) setState(EMPTY_OBJECT_URL_STATE)
      })
      return () => {
        cancelled = true
      }
    }

    Promise.resolve().then(() => {
      if (!cancelled) {
        setState({ sourceUrl: url, url: null, loading: true, error: null })
      }
    })

    apiFetchBlob(url)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setState({
          sourceUrl: url,
          url: objectUrl,
          loading: false,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          sourceUrl: url,
          url: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "No se pudo cargar el estímulo.",
        })
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [enabled, url])

  if (!enabled || !url) return EMPTY_OBJECT_URL_STATE
  if (state.sourceUrl !== url) {
    return { sourceUrl: url, url: null, loading: true, error: null }
  }
  return state
}

export interface UseComparisonDataOptions {
  projectId: string
  participantCode: string | null
  scenario: string
  selectedIds: VisualizationId[]
  pinnedSourceTime: number | null
}

/**
 * One fixed-order orchestration point for the comparison screen. A dataset is
 * enabled by passing the project id only when at least one selected panel needs
 * it. Collapsing a panel never changes this list; removing it does.
 */
export function useComparisonData({
  projectId,
  participantCode,
  scenario,
  selectedIds,
  pinnedSourceTime,
}: UseComparisonDataOptions) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const concreteScenario = Boolean(scenario && scenario.toLowerCase() !== "all")
  const enabledProject = (enabled: boolean) => (enabled ? projectId : null)

  // Temporal signals.
  const pupil = usePupilTimeseries(
    enabledProject(selected.has("pupil")),
    participantCode,
    scenario
  )
  const distance = useDistanceTimeseries(
    enabledProject(selected.has("distance")),
    participantCode,
    scenario
  )
  const gaze = useGazeTimeseries(
    enabledProject(selected.has("gaze")),
    participantCode,
    scenario
  )
  const gsr = useGsrTimeseries(
    enabledProject(selected.has("gsr")),
    participantCode,
    scenario
  )
  const eegTimeseries = useEegTimeseries(
    enabledProject(selected.has("eeg_timeseries")),
    participantCode,
    scenario,
    [],
    0.2,
    5000
  )

  // Distribution and frequency views.
  const fixationHistogram = useFixationHistogram(
    enabledProject(selected.has("fixation_histogram")),
    participantCode,
    scenario
  )
  const eegPsd = useEegPsd(
    enabledProject(selected.has("eeg_psd")),
    participantCode,
    scenario,
    [],
    45,
    true,
    5000
  )
  const eegSpectrogram = useEegSpectrogram(
    enabledProject(selected.has("eeg_spectrogram")),
    participantCode,
    scenario,
    [],
    45,
    true,
    "freq_demean",
    360,
    160
  )

  // Spatial views are intentionally gated before their hooks issue requests.
  const pointActive = concreteScenario && pinnedSourceTime != null
  const heatmapEnabled = concreteScenario && selected.has("heatmap")
  const scanpathEnabled = concreteScenario && selected.has("scanpath")
  const aoiEnabled =
    concreteScenario &&
    (pointActive || heatmapEnabled || scanpathEnabled || selected.has("aoi"))

  const fixation = useFixationData(
    enabledProject(heatmapEnabled),
    participantCode,
    scenario
  )
  const heatmap = useHeatmapOverlay(
    enabledProject(heatmapEnabled),
    participantCode,
    scenario
  )
  const scanpath = useScanpathData(
    enabledProject(scanpathEnabled),
    participantCode,
    scenario
  )
  const aoi = useAoiMetrics(
    enabledProject(aoiEnabled),
    participantCode,
    scenario
  )
  const gazeAt = useComparisonGazeAt(
    pointActive ? projectId : null,
    pointActive ? participantCode : null,
    pointActive ? scenario : null,
    pointActive ? pinnedSourceTime : null
  )
  const { clear: clearGazeAt, fetchGaze: fetchGazeAt } = gazeAt

  useEffect(() => {
    if (!pointActive || pinnedSourceTime == null) {
      clearGazeAt()
      return
    }
    void fetchGazeAt(pinnedSourceTime)
  }, [clearGazeAt, fetchGazeAt, pinnedSourceTime, pointActive])

  const staticFileId =
    fixation.data?.scenario_file_id ??
    scanpath.data?.scenario_file_id ??
    aoi.data?.scenario_file_id ??
    null
  const staticImage = useObjectUrl(
    staticFileId
      ? `/api/projects/${projectId}/files/${staticFileId}/image`
      : null,
    concreteScenario &&
      Boolean(staticFileId) &&
      (heatmapEnabled || scanpathEnabled || selected.has("aoi"))
  )

  const pointPreviewParams = useMemo(() => {
    if (!gazeAt.data?.scenario_file_id) return null
    const params = new URLSearchParams({
      time_s: String(gazeAt.data.nearest_time_s),
    })
    if (participantCode) params.set("participant_code", participantCode)
    if (gazeAt.data.scenario) params.set("scenario", gazeAt.data.scenario)
    return `/api/projects/${projectId}/files/${gazeAt.data.scenario_file_id}/preview?${params}`
  }, [gazeAt.data, participantCode, projectId])
  const pointPreview = useObjectUrl(
    pointPreviewParams,
    pointActive && Boolean(pointPreviewParams)
  )

  return {
    pupil,
    distance,
    gaze,
    gsr,
    eegTimeseries,
    fixationHistogram,
    eegPsd,
    eegSpectrogram,
    fixation,
    heatmap,
    scanpath,
    aoi,
    gazeAt,
    staticImage,
    pointPreview,
  }
}

export type ComparisonData = ReturnType<typeof useComparisonData>
