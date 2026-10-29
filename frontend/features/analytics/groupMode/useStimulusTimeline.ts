"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnalyticsApi } from "../api/analyticsApi"
import { requestAnalytics } from "../analyticsCache"
import { useAnalyticsRevision } from "../hooks/useAnalyticsContext"
import type { StimulusSegment } from "../types"
import { buildStimulusTimeline, type StimulusTimeline } from "./stimulusTimeline"

/**
 * The stimulus timeline of `codes` in `projectId` (null to skip it):
 * undefined while some sequence is pending, null when none labels a scenario.
 * A sequence that fails to load counts as one without scenarios.
 */
export function useStimulusTimeline(
  projectId: string | null,
  generation: number | null,
  codes: readonly string[]
): StimulusTimeline | null | undefined {
  const revision = useAnalyticsRevision()
  const [sequences, setSequences] = useState<Record<string, StimulusSegment[]>>({})
  const keyOf = useCallback((code: string) => JSON.stringify([revision, generation, code]), [generation, revision])
  const codesKey = codes.join("\n")

  useEffect(() => {
    if (!projectId || !codesKey) return
    const controller = new AbortController()
    for (const code of codesKey.split("\n")) {
      const key = keyOf(code)
      const settle = (segments: StimulusSegment[]) => {
        if (!controller.signal.aborted) setSequences((current) => (key in current ? current : { ...current, [key]: segments }))
      }
      requestAnalytics(projectId, "stimulus-sequence", [generation, code],
        (signal) => AnalyticsApi.getStimulusSequence(projectId, code, signal), controller.signal, revision).then(
        (data) => settle(data.segments ?? []),
        (error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) settle([])
        }
      )
    }
    return () => controller.abort()
  }, [codesKey, generation, keyOf, projectId, revision])

  return useMemo(() => {
    if (!projectId || !codesKey) return null
    const loaded = new Map<string, StimulusSegment[]>()
    for (const code of codesKey.split("\n")) {
      const segments = sequences[keyOf(code)]
      if (!segments) return undefined
      loaded.set(code, segments)
    }
    return buildStimulusTimeline(loaded)
  }, [codesKey, keyOf, projectId, sequences])
}
