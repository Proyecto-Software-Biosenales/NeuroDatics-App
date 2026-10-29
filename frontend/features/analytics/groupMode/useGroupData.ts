"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { analyticsKey, analyticsKeyCacheable, isAnalyticsKeyCurrent, waitForAnalyticsContext } from "../analyticsCache"
import { useAnalyticsRevision } from "../hooks/useAnalyticsContext"
import { loadCardData, type CardResult } from "../participantComparison/cardData"
import { participantComparisonLoader } from "../participantComparison/cardHooks"
import { estimateWeight, type EntryState } from "../participantComparison/comparisonLoader"
import {
  cardCacheKey,
  CARD_POINT_BUDGET,
  EEG_CARD_POINT_BUDGET,
  type ParticipantComparisonSpec,
} from "../participantComparison/spec"
import type { WindowTransfer } from "../participantComparison/timeAlignment"
import { useGroupMode, type GroupParticipant } from "./GroupModeProvider"
import { groupTimeAxis, groupUnsupportedReason, type GroupTimeAxis } from "./groupSupport"
import { alignsByStimulus, placeCardResult, type StimulusTimeline } from "./stimulusTimeline"
import { useStimulusTimeline } from "./useStimulusTimeline"

export type GroupEntryStatus = "loading" | "empty" | "error" | "success"

export interface GroupEntry {
  participant: GroupParticipant
  status: GroupEntryStatus
  /** Present when `status` is "success". */
  result: Exclude<CardResult, { type: "empty" }> | null
  /** Why there is no chart: the empty message or the error. */
  message: string | null
  key: string
}

export interface GroupSuccess<T extends CardResult = Exclude<CardResult, { type: "empty" }>> {
  participant: GroupParticipant
  result: T
}

export interface GroupData {
  entries: GroupEntry[]
  successes: GroupSuccess[]
  failures: GroupEntry[]
  empties: GroupEntry[]
  total: number
  /** Participants whose answer (data, empty or error) has arrived. */
  settled: number
  loading: boolean
  retry: (entry: GroupEntry) => void
  retryFailed: () => void
  /**
   * With «Todos los escenarios», the stimulus axis every participant was laid
   * on; null when the recordings label no scenario (each keeps its own time).
   */
  timeline: StimulusTimeline | null
}

const NO_TRANSFER: WindowTransfer = { kind: "none" }
const EMPTY_WINDOW = { start: null, end: null }

/**
 * The group modes always read the whole scenario (aligned on its onset) or,
 * with «Todos los escenarios», the whole recording: a window typed in
 * recording seconds belongs to one recording only.
 */
export function groupRequestSpec(spec: ParticipantComparisonSpec): ParticipantComparisonSpec {
  const params: Record<string, unknown> = { ...spec.params }
  if ("window" in params) params.window = EMPTY_WINDOW
  if ("timeZoom" in params) params.timeZoom = null
  // No heatmap image per participant: the group modes draw their own.
  if (spec.kind === "heatmap") params.overlay = false
  return { ...spec, sourceParticipant: null, origin: "individual", params } as ParticipantComparisonSpec
}

const LOADING: EntryState<CardResult> = { status: "queued", data: null, error: null }

/**
 * Per-participant data for the open view in group mode, through the same
 * queue and cache as «Comparar participantes» (four requests at a time).
 * Pass null while the view is individual or the mode is unsupported.
 */
export function useGroupData(spec: ParticipantComparisonSpec | null, options: { frameStimulusTime?: number | null } = {}): GroupData {
  const group = useGroupMode()
  const revision = useAnalyticsRevision()
  const { projectId, generation, selected } = group
  const frameStimulusTime = options.frameStimulusTime ?? null
  const requestSpec = useMemo(() => (spec ? groupRequestSpec(spec) : null), [spec])
  const specKey = requestSpec ? JSON.stringify(requestSpec) : null

  const jobs = useMemo(() => {
    void revision
    if (!requestSpec || !projectId) return []
    const budget = requestSpec.kind === "eeg_timeseries" ? EEG_CARD_POINT_BUDGET : CARD_POINT_BUDGET
    return selected.map((participant) => ({
      participant,
      // Same identity as a comparison card, so both share cached results.
      key: analyticsKey(projectId, "participant-card", [
        cardCacheKey({ projectId, generation }, participant.code, requestSpec, budget),
        NO_TRANSFER,
        frameStimulusTime,
      ]),
    }))
    // specKey stands for requestSpec's content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameStimulusTime, generation, projectId, revision, selected, specKey])

  const [states, setStates] = useState<Record<string, EntryState<CardResult>>>({})
  const jobsKey = jobs.map((job) => job.key).join("\n")

  useEffect(() => {
    if (!requestSpec || !projectId || jobs.length === 0) return
    const controller = new AbortController()
    const releases: Array<(options?: { keepRunning?: boolean }) => void> = []
    jobs.forEach(({ participant, key }, index) => {
      const subscribe = () => {
        if (controller.signal.aborted || !isAnalyticsKeyCurrent(key)) return
        releases.push(
          participantComparisonLoader.subscribe<CardResult>(
            key,
            (signal) =>
              loadCardData(
                { projectId, generation, participant: participant.code, spec: requestSpec, transfer: NO_TRANSFER, frameStimulusTime },
                signal
              ),
            (entry) => setStates((current) => (current[key] === entry ? current : { ...current, [key]: entry })),
            { priority: index, weigh: estimateWeight, group: participant.code, cacheable: analyticsKeyCacheable(key) }
          )
        )
      }
      void waitForAnalyticsContext(projectId, controller.signal, key).then(subscribe, (error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : "No se pudo cargar."
        setStates((current) => ({ ...current, [key]: { status: "error", data: null, error: message } }))
      })
    })
    return () => {
      controller.abort()
      // A running request finishes into the cache; a queued one is dropped.
      for (const release of releases) release({ keepRunning: true })
    }
    // jobsKey stands for jobs' content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobsKey])

  const byStimulus = requestSpec != null && alignsByStimulus(requestSpec.kind, requestSpec.scenario)
  const codes = useMemo(() => selected.map((participant) => participant.code), [selected])
  const timeline = useStimulusTimeline(byStimulus ? projectId : null, generation, codes)

  const entries = useMemo<GroupEntry[]>(
    () =>
      jobs.map(({ participant, key }) => {
        const state = states[key] ?? LOADING
        if (state.status === "error") return { participant, key, status: "error", result: null, message: state.error }
        // Nothing is drawn on the recording's own time while the stimulus axis is pending.
        if (state.status !== "success" || !state.data || timeline === undefined) return { participant, key, status: "loading", result: null, message: null }
        if (state.data.type === "empty") return { participant, key, status: "empty", result: null, message: state.data.message }
        const result = timeline ? placeCardResult(state.data, timeline, participant.code) : state.data
        if (result.type === "empty") return { participant, key, status: "empty", result: null, message: result.message }
        return { participant, key, status: "success", result, message: null }
      }),
    [jobs, states, timeline]
  )

  const retry = useCallback((entry: GroupEntry) => participantComparisonLoader.retry(entry.key), [])
  return useMemo(() => {
    const failures = entries.filter((entry) => entry.status === "error")
    return {
      entries,
      successes: entries.flatMap((entry) => (entry.status === "success" && entry.result ? [{ participant: entry.participant, result: entry.result }] : [])),
      failures,
      empties: entries.filter((entry) => entry.status === "empty"),
      total: entries.length,
      settled: entries.filter((entry) => entry.status !== "loading").length,
      loading: entries.some((entry) => entry.status === "loading"),
      retry,
      retryFailed: () => failures.forEach((entry) => participantComparisonLoader.retry(entry.key)),
      timeline: timeline ?? null,
    }
  }, [entries, retry, timeline])
}

export interface GroupView {
  /** A group mode is on: the view renders its group pieces instead of its own. */
  active: boolean
  mode: "overlay" | "average" | null
  /** Why this view cannot show the mode; the view renders `GroupUnsupported`. */
  unsupportedReason: string | null
  /** How participants are lined up in time: scenario onset, or each recording's start. */
  timeAxis: GroupTimeAxis
  data: GroupData
  /** The instant clicked on the group chart, on `timeAxis`; null without one. */
  selectedTime: number | null
  selectTime: (time: number | null) => void
}

/**
 * Everything a view needs for the group modes: whether one is on, whether this
 * chart kind supports it in this scenario, and the participants' data.
 * `spec` is the same spec the view gives «Comparar participantes».
 */
export function useGroupView(spec: ParticipantComparisonSpec | null, options?: { frameStimulusTime?: number | null }): GroupView {
  const group = useGroupMode()
  const active = group.active && spec != null
  const unsupportedReason = active && group.mode ? groupUnsupportedReason(spec.kind, spec.scenario) : null
  const data = useGroupData(active && !unsupportedReason ? spec : null, options)
  const kind = spec?.kind ?? "pupil"
  const scenario = spec?.scenario ?? ""
  const byStimulus = data.timeline != null
  const timeAxis = useMemo(() => groupTimeAxis(kind, scenario, byStimulus), [byStimulus, kind, scenario])
  // An instant belongs to one time axis and mode: another scenario or mode starts without one.
  const selectionKey = JSON.stringify([kind, scenario, active ? group.mode : null, byStimulus])
  const [selection, setSelection] = useState<{ key: string; time: number } | null>(null)
  const selectedTime = selection?.key === selectionKey ? selection.time : null
  const selectTime = useCallback(
    (time: number | null) => setSelection(time == null ? null : { key: selectionKey, time }),
    [selectionKey]
  )
  return { active, mode: active ? group.mode : null, unsupportedReason, timeAxis, data, selectedTime, selectTime }
}
