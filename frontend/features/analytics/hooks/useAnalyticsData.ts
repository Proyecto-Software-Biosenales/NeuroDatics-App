"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AnalyticsApi } from "../api/analyticsApi"
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

export function useAnalyticsParticipants(projectId: string | null) {
  const [participants, setParticipants] = useState<AnalyticsParticipant[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    AnalyticsApi.getParticipants(projectId)
      .then((data) => {
        if (!cancelled) setParticipants(data)
      })
      .catch(() => {
        if (!cancelled) setParticipants([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { participants, loading }
}

export function useAnalyticsScenarios(projectId: string | null) {
  const [scenarios, setScenarios] = useState<AnalyticsScenario[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    AnalyticsApi.getScenarios(projectId)
      .then((data) => {
        if (!cancelled) setScenarios(data)
      })
      .catch(() => {
        if (!cancelled) setScenarios([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { scenarios, loading }
}

export function usePupilTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<PupilTimeseriesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    AnalyticsApi.getPupilTimeseries(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading timeseries")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading, error }
}

export function usePupilStatistics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<PupilStatistics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    AnalyticsApi.getPupilStatistics(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading }
}

export function useGazeAt(projectId: string | null, participantCode: string | null) {
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
        const result = await AnalyticsApi.getGazeAt(projectId, participantCode, timeS)
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

export function useGazeTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<GazeTimeseriesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    AnalyticsApi.getGazeTimeseries(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading gaze timeseries")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading, error }
}

export function useGazeStatistics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<GazeStatistics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    AnalyticsApi.getGazeStatistics(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading }
}

export function useDistanceTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<DistanceTimeseriesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    AnalyticsApi.getDistanceTimeseries(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading distance timeseries")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading, error }
}

export function useDistanceStatistics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<DistanceStatistics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    AnalyticsApi.getDistanceStatistics(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading }
}

export function useGsrTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<GsrTimeseriesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    AnalyticsApi.getGsrTimeseries(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading GSR timeseries")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading, error }
}

export function useGsrStatistics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<GsrStatistics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    AnalyticsApi.getGsrStatistics(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading }
}

export function useEegTimeseries(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  channels: string[] = [],
  smoothWindowS: number = 0.2,
  maxPoints: number = 5000
) {
  const [data, setData] = useState<EegTimeseriesData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelsKey = channels.join(",")
  const canLoad = Boolean(projectId && participantCode)

  useEffect(() => {
    if (!projectId || !participantCode) return

    let cancelled = false
    const requestedChannels = channelsKey ? channelsKey.split(",") : []

    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })

    AnalyticsApi.getEegTimeseries(
      projectId,
      participantCode,
      scenario,
      requestedChannels,
      smoothWindowS,
      maxPoints
    )
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading EEG timeseries")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario, channelsKey, smoothWindowS, maxPoints])

  return {
    data: canLoad ? data : null,
    loading: canLoad ? loading : false,
    error: canLoad ? error : null,
  }
}

export function useEegPsd(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all",
  channels: string[] = [],
  maxFreqHz: number | null = null,
  useDb: boolean = true,
  maxPoints: number = 5000
) {
  const [data, setData] = useState<EegPsdData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelsKey = channels.join(",")
  const canLoad = Boolean(projectId && participantCode)

  useEffect(() => {
    if (!projectId || !participantCode) return

    let cancelled = false
    const requestedChannels = channelsKey ? channelsKey.split(",") : []

    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })

    AnalyticsApi.getEegPsd(
      projectId,
      participantCode,
      scenario,
      requestedChannels,
      maxFreqHz,
      useDb,
      maxPoints
    )
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading EEG PSD")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario, channelsKey, maxFreqHz, useDb, maxPoints])

  return {
    data: canLoad ? data : null,
    loading: canLoad ? loading : false,
    error: canLoad ? error : null,
  }
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
  const [data, setData] = useState<EegSpectrogramData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelsKey = channels.join(",")
  const canLoad = Boolean(projectId && participantCode)

  useEffect(() => {
    if (!projectId || !participantCode) return

    let cancelled = false
    const requestedChannels = channelsKey ? channelsKey.split(",") : []

    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })

    AnalyticsApi.getEegSpectrogram(
      projectId,
      participantCode,
      scenario,
      requestedChannels,
      maxFreqHz,
      useDb,
      normalize,
      maxTimeBins,
      maxFrequencyBins
    )
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading EEG spectrogram")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    projectId,
    participantCode,
    scenario,
    channelsKey,
    maxFreqHz,
    useDb,
    normalize,
    maxTimeBins,
    maxFrequencyBins,
  ])

  return {
    data: canLoad ? data : null,
    loading: canLoad ? loading : false,
    error: canLoad ? error : null,
  }
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
  const [data, setData] = useState<EegTopographyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelsKey = channels.join(",")
  const canLoad = Boolean(projectId && participantCode)

  useEffect(() => {
    if (!projectId || !participantCode) return

    let cancelled = false
    const requestedChannels = channelsKey ? channelsKey.split(",") : []

    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })

    AnalyticsApi.getEegTopography(
      projectId,
      participantCode,
      scenario,
      requestedChannels,
      windowS,
      overlapRatio,
      removeDc,
      maxFrames
    )
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading EEG topography")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    projectId,
    participantCode,
    scenario,
    channelsKey,
    windowS,
    overlapRatio,
    removeDc,
    maxFrames,
  ])

  return {
    data: canLoad ? data : null,
    loading: canLoad ? loading : false,
    error: canLoad ? error : null,
  }
}

export function useScanpathData(
  projectId: string | null,
  participantCode: string | null,
  scenario: string
) {
  const [data, setData] = useState<ScanpathData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !participantCode || !scenario || scenario === "all") {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    AnalyticsApi.getScanpath(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message || "Error loading scanpath data")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading, error }
}

export function useFixationData(
  projectId: string | null,
  participantCode: string | null,
  scenario: string
) {
  const [data, setData] = useState<FixationData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !participantCode || !scenario || scenario === "all") {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    AnalyticsApi.getFixationData(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message || "Error loading fixation data")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading, error }
}

export function useHeatmapOverlay(
  projectId: string | null,
  participantCode: string | null,
  scenario: string
) {
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOverlayUrl(null)
    if (!projectId || !participantCode || !scenario || scenario === "all") return

    let cancelled = false
    let currentUrl: string | null = null
    setLoading(true)
    setError(null)

    AnalyticsApi.getHeatmapOverlay(projectId, participantCode, scenario)
      .then((blob) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(blob)
        setOverlayUrl(currentUrl)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message || "Error loading heatmap")
          setOverlayUrl(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [projectId, participantCode, scenario])

  return { overlayUrl, loading, error }
}

export function useFixationHistogram(
  projectId: string | null,
  participantCode: string | null,
  scenario: string = "all"
) {
  const [data, setData] = useState<FixationHistogramData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !participantCode) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    AnalyticsApi.getFixationHistogram(projectId, participantCode, scenario)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Error loading histogram")
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, participantCode, scenario])

  return { data, loading, error }
}

export function useAoiMetrics(
  projectId: string | null,
  participantCode: string | null,
  scenario: string
) {
  const [data, setData] = useState<AoiMetricsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canLoad = Boolean(projectId && participantCode && scenario && scenario !== "all")

  useEffect(() => {
    if (!canLoad || !projectId || !participantCode) return

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await AnalyticsApi.getAoiMetrics(projectId, participantCode, scenario)
        if (!cancelled) setData(result)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error loading AOI metrics")
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [canLoad, projectId, participantCode, scenario])

  return {
    data: canLoad ? data : null,
    loading: canLoad ? loading : false,
    error: canLoad ? error : null,
  }
}
