"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MapPin, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetchBlob } from "@/lib/api/apiFetch"
import { getStimulusPreviewUrl } from "@/features/projects/api/stimulusUrls"
import { AnalyticsApi } from "../api/analyticsApi"
import { requestAnalytics } from "../analyticsCache"
import type { AnalyticsChartNote } from "../components/AnalyticsChartShell"
import { GroupSpatialFooter } from "../components/GroupSpatial"
import { MissingStimulusImage } from "../components/MissingStimulusImage"
import { getContainedImageBox, imagePointToContainerPercent, type ContainedImageBox } from "../components/stimulusGeometry"
import { getPreviewFailureMessage } from "../components/stimulusState"
import { useAnalyticsRevision } from "../hooks/useAnalyticsContext"
import { useBlobUrl } from "../participantComparison/cardHooks"
import type { GazeAtData } from "../types"
import { useGroupMode, type GroupParticipant } from "./GroupModeProvider"
import { timelineToRecording } from "./stimulusTimeline"
import type { GroupView } from "./useGroupData"

/**
 * «Superposición» / «Promedio» of a temporal view: where each chosen
 * participant was looking at the instant clicked on the group chart, as one
 * point in its colour over the stimulus. The instant is on the group's time
 * axis; each participant's gaze is asked at the matching second of its own
 * recording.
 */

type GazeState = { status: "success"; data: GazeAtData } | { status: "error" }

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError"
const isGazeCoordinate = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
const formatSeconds = (value: number) => value.toFixed(2).replace(".", ",")
const namesText = (participants: readonly GroupParticipant[]) => participants.map((participant) => participant.label).join(", ")
const countText = (count: number) => (count === 1 ? "1 participante" : `${count} participantes`)

interface GazeTarget {
  participant: GroupParticipant
  /** Seconds of that participant's own recording. */
  recordingTime: number
  /** The scenario to look in; null for the whole recording. */
  scenario: string | null
}

/** Each drawn participant's recording second (and scenario) for `time` on the group axis. */
function gazeTargets(view: GroupView, time: number | null, scenario: string): GazeTarget[] {
  if (time == null) return []
  const timeline = view.data.timeline
  return view.data.entries.flatMap((entry) => {
    const result = entry.result
    if (entry.status !== "success" || result?.type !== "temporal") return []
    if (timeline) {
      // Lined up by stimulus: the instant is a second of one stimulus, in each participant's own recording of it.
      const placed = timelineToRecording(timeline, entry.participant.code, time)
      return placed ? [{ participant: entry.participant, ...placed }] : []
    }
    if ((view.timeAxis.aligned && !result.aligned) || result.recordingOffset == null) return []
    // Drawn time = data time + displayOffset; recording time = data time + recordingOffset.
    return [{
      participant: entry.participant,
      recordingTime: time - result.displayOffset + result.recordingOffset,
      scenario: view.timeAxis.aligned ? scenario : null,
    }]
  })
}

/** The gaze of every target at its own second; a lookup by code, null while pending. */
function useGroupGazeAt(targets: GazeTarget[]): (code: string) => GazeState | null {
  const { projectId } = useGroupMode()
  const revision = useAnalyticsRevision()
  const [states, setStates] = useState<Record<string, GazeState>>({})
  const keyOf = useCallback(
    (code: string, time: number, scenario: string | null) => JSON.stringify([revision, code, time, scenario]),
    [revision]
  )
  const targetsKey = JSON.stringify(targets.map((target) => [target.participant.code, target.recordingTime, target.scenario]))

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    for (const [code, time, scenario] of JSON.parse(targetsKey) as Array<[string, number, string | null]>) {
      const key = keyOf(code, time, scenario)
      requestAnalytics(projectId, "gaze-at", [code, time, scenario],
        (signal) => AnalyticsApi.getGazeAt(projectId, code, time, scenario, signal), controller.signal, revision).then(
        (data) => {
          if (!controller.signal.aborted) setStates((current) => ({ ...current, [key]: { status: "success", data } }))
        },
        (error: unknown) => {
          if (controller.signal.aborted || isAbort(error)) return
          setStates((current) => ({ ...current, [key]: { status: "error" } }))
        }
      )
    }
    return () => controller.abort()
  }, [keyOf, projectId, revision, targetsKey])

  const byCode = useMemo(() => new Map(targets.map((target) => [target.participant.code, target])), [targets])
  return useCallback(
    (code: string) => {
      const target = byCode.get(code)
      return target == null ? null : states[keyOf(code, target.recordingTime, target.scenario)] ?? null
    },
    [byCode, keyOf, states]
  )
}

/** The stimulus at the reference gaze: the scenario image, or the video frame at that second. */
function useStimulusFrame(reference: { participant: GroupParticipant; gaze: GazeAtData } | null) {
  const { projectId } = useGroupMode()
  const fileId = reference?.gaze.scenario_file_id ?? null
  const url =
    projectId && reference && fileId
      ? getStimulusPreviewUrl(projectId, fileId, {
          timeS: reference.gaze.nearest_time_s,
          participantCode: reference.participant.code,
          scenario: reference.gaze.scenario,
        })
      : null
  const [state, setState] = useState<{ url: string; blob: Blob | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!projectId || !url) return
    const controller = new AbortController()
    requestAnalytics(projectId, "stimulus-preview", [url], (signal) => apiFetchBlob(url, { signal }), controller.signal).then(
      (blob) => {
        if (!controller.signal.aborted) setState({ url, blob, error: null })
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) return
        setState({ url, blob: null, error: error instanceof Error ? error.message : "No se pudo cargar el estímulo visual" })
      }
    )
    return () => controller.abort()
  }, [projectId, url])
  const current = url && state?.url === url ? state : null
  const objectUrl = useBlobUrl(current?.blob ?? null)
  return { url: objectUrl, loading: Boolean(url) && (!current || (Boolean(current.blob) && !objectUrl)), error: current?.error ?? null }
}

interface GazeMark {
  participant: GroupParticipant
  gx: number
  gy: number
}

/** One point per participant over a frame whose box (`box`) maps percent coordinates; null box = the frame itself. */
function GazeMarks({ marks, box }: { marks: GazeMark[]; box: ContainedImageBox | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="group-gaze-points">
      {marks.map(({ participant, gx, gy }) => {
        const position = box ? imagePointToContainerPercent(box, gx, gy) : { x: gx, y: gy }
        const label = `${participant.label}: (${gx.toFixed(0)}, ${gy.toFixed(0)})`
        return (
          <span
            key={participant.code}
            role="img"
            aria-label={label}
            title={label}
            data-participant={participant.code}
            className="pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-help rounded-full border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
            style={{ left: `${position.x}%`, top: `${position.y}%`, backgroundColor: participant.color }}
          />
        )
      })}
    </div>
  )
}

const FRAME_CLASS = "flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center text-sm text-muted-foreground"

export function GroupStimulusCard({ view, scenario }: { view: GroupView; scenario: string }) {
  const time = view.selectedTime
  const targets = useMemo(() => gazeTargets(view, time, scenario), [scenario, time, view])
  const gazeOf = useGroupGazeAt(targets)

  const resolved = targets.map((target) => ({ ...target, state: gazeOf(target.participant.code) }))
  const pending = resolved.some((entry) => entry.state == null)
  const gazes = resolved.flatMap((entry) =>
    entry.state?.status === "success" ? [{ participant: entry.participant, gaze: entry.state.data }] : []
  )
  // The first participant (in selection order) with a stimulus sets the frame;
  // without any, the first one with a gaze names the scenario.
  const reference = gazes.find((entry) => entry.gaze.scenario_file_id) ?? gazes[0] ?? null
  const referenceScenario = reference?.gaze.scenario ?? null
  const frame = useStimulusFrame(reference?.gaze.scenario_file_id ? reference : null)

  const marks: GazeMark[] = []
  const missing: GroupParticipant[] = []
  const elsewhere: GroupParticipant[] = []
  for (const entry of resolved) {
    if (entry.state == null) continue
    const gaze = entry.state.status === "success" ? entry.state.data : null
    if (gaze && referenceScenario != null && gaze.scenario !== referenceScenario) elsewhere.push(entry.participant)
    else if (gaze && isGazeCoordinate(gaze.gx) && isGazeCoordinate(gaze.gy)) marks.push({ participant: entry.participant, gx: gaze.gx, gy: gaze.gy })
    else missing.push(entry.participant)
  }
  const notes: AnalyticsChartNote[] = [
    ...(missing.length > 0
      ? [{ id: "group-gaze-missing", label: `${countText(missing.length)} sin mirada`, detail: `${namesText(missing)}: sin mirada registrada en este instante.` }]
      : []),
    ...(elsewhere.length > 0
      ? [{ id: "group-gaze-elsewhere", label: `${countText(elsewhere.length)} en otro escenario`, detail: `${namesText(elsewhere)}: en este segundo de su grabación veía otro escenario.` }]
      : []),
  ]

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [box, setBox] = useState<ContainedImageBox | null>(null)
  const measure = useCallback(() => setBox(getContainedImageBox(imageRef.current, containerRef.current)), [])
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [frame.url, measure])

  if (!view.mode || view.unsupportedReason) return null
  const origin = view.timeAxis.aligned ? view.timeAxis.origin : "el inicio de cada grabación"

  let body
  if (time == null) {
    body = <div className={FRAME_CLASS}>Haz clic en la gráfica para ver dónde miraba cada participante en ese instante.</div>
  } else if (targets.length === 0) {
    body = <div className={FRAME_CLASS}>Ningún participante dibujado tiene datos en este instante.</div>
  } else if (!reference) {
    body = pending ? (
      <Skeleton className="h-48 animate-pulse rounded-xl bg-muted" />
    ) : (
      <div className={FRAME_CLASS}>No se pudo ubicar la mirada de ningún participante en este instante.</div>
    )
  } else if (!reference.gaze.scenario_file_id) {
    body = (
      <div className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-xl border border-border bg-gray-950">
        <MissingStimulusImage scenario={referenceScenario} showGazePoint={false} className="rounded-none" />
        <GazeMarks marks={marks} box={null} />
      </div>
    )
  } else if (frame.loading) {
    body = <Skeleton className="h-48 animate-pulse rounded-xl bg-muted" />
  } else if (!frame.url) {
    body = <div className={FRAME_CLASS}>{getPreviewFailureMessage(reference.gaze, frame.error)}</div>
  } else {
    body = (
      <div className="relative overflow-hidden rounded-xl bg-card" ref={containerRef}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imageRef} src={frame.url} alt="Escenario" className="max-h-[500px] w-full object-contain" onLoad={measure} />
        {box ? <GazeMarks marks={marks} box={box} /> : null}
      </div>
    )
  }

  return (
    <Card className="overflow-hidden" data-testid="group-stimulus">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">Punto de fijación sobre estímulo visual</CardTitle>
            {time != null && referenceScenario ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                <MapPin className="h-3 w-3 shrink-0" />
                {referenceScenario}
              </span>
            ) : null}
          </div>
          <CardDescription>
            {time == null
              ? "Dónde miraba cada participante en el instante elegido de la gráfica."
              : `Dónde miraba cada participante a los ${formatSeconds(time)} s desde ${origin}.`}
          </CardDescription>
        </div>
        {time != null ? (
          <Button variant="ghost" type="button" onClick={() => view.selectTime(null)} className="shrink-0 gap-1.5 text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
            Limpiar selección
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="mt-4">
        {body}
        {time != null && reference ? (
          <GroupSpatialFooter participants={marks.map((mark) => mark.participant)} notes={notes} />
        ) : null}
      </CardContent>
    </Card>
  )
}
