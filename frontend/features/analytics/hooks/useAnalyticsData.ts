"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AnalyticsApi } from "../api/analyticsApi"
import type {
  AnalyticsParticipant,
  AnalyticsScenario,
  PupilTimeseriesData,
  PupilStatistics,
  GazeAtData,
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
