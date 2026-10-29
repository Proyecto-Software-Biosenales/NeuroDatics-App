/**
 * The common time axis of the group modes and «Comparar participantes» with
 * «Todos los escenarios»: one slot per stimulus, where every participant's
 * recording of that stimulus is laid. Each stimulus starts at the same second for everybody, whatever each
 * recording held before the first stimulus or in the pauses between stimuli,
 * which are not drawn. Pure data (type-only imports) so `node --test` runs it.
 */

import type { CardResult } from "../participantComparison/cardData"
import type { ComparisonKind } from "../participantComparison/spec"
import type { StimulusSegment } from "../types"

export interface TimelineSlot {
  /** The scenario's name as the first participant showing it stores it. */
  scenario: string
  /** Seconds on the group axis. */
  start: number
  end: number
}

export interface StimulusTimeline {
  slots: TimelineSlot[]
  /** Per participant code, its own segment in each slot (same order as `slots`); null where it has none. */
  placements: ReadonlyMap<string, ReadonlyArray<StimulusSegment | null>>
}

/**
 * Space between consecutive slots, so the last sample of one stimulus and the
 * first of the next never share an instant; far below any sampling step.
 */
export const SLOT_GAP_S = 0.001

const identity = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** A stimulus and how many times the participant had already seen it: the slot it fills. */
function slotKeys(segments: readonly StimulusSegment[]): string[] {
  const seen = new Map<string, number>()
  return segments.map((segment) => {
    const name = identity(segment.scenario)
    const occurrence = seen.get(name) ?? 0
    seen.set(name, occurrence + 1)
    return `${name}\u0000${occurrence}`
  })
}

const usable = (segment: StimulusSegment) =>
  Number.isFinite(segment.onset_s) && Number.isFinite(segment.end_s) && segment.end_s >= segment.onset_s

/**
 * One slot per stimulus (a stimulus shown twice fills two), in the order
 * participants usually saw them (median position), each as long as the
 * longest recording of it. Null when no participant has a labelled scenario.
 */
export function buildStimulusTimeline(sequences: ReadonlyMap<string, readonly StimulusSegment[]>): StimulusTimeline | null {
  const slots = new Map<string, { scenario: string; positions: number[]; length: number; first: number }>()
  const keysByCode = new Map<string, string[]>()
  let appearance = 0
  for (const [code, raw] of sequences) {
    const segments = [...raw].filter(usable).sort((a, b) => a.onset_s - b.onset_s)
    if (segments.length === 0) continue
    const keys = slotKeys(segments)
    keysByCode.set(code, keys)
    keys.forEach((key, position) => {
      const length = segments[position].end_s - segments[position].onset_s
      const slot = slots.get(key)
      if (slot) {
        slot.positions.push(position)
        slot.length = Math.max(slot.length, length)
      } else {
        slots.set(key, { scenario: segments[position].scenario.trim(), positions: [position], length, first: appearance++ })
      }
    })
  }
  if (slots.size === 0) return null

  const ordered = [...slots.entries()].sort(
    ([, a], [, b]) => median(a.positions) - median(b.positions) || a.first - b.first
  )
  const index = new Map(ordered.map(([key], position) => [key, position]))
  let cursor = 0
  const timelineSlots = ordered.map(([, slot]) => {
    const placed = { scenario: slot.scenario, start: cursor, end: cursor + slot.length }
    cursor = placed.end + SLOT_GAP_S
    return placed
  })

  const placements = new Map<string, Array<StimulusSegment | null>>()
  for (const [code, raw] of sequences) {
    const keys = keysByCode.get(code)
    if (!keys) continue
    const segments = [...raw].filter(usable).sort((a, b) => a.onset_s - b.onset_s)
    const row: Array<StimulusSegment | null> = timelineSlots.map(() => null)
    keys.forEach((key, position) => {
      row[index.get(key)!] = segments[position]
    })
    placements.set(code, row)
  }
  return { slots: timelineSlots, placements }
}

/**
 * Where one participant's recording seconds fall on the group axis: NaN for a
 * second outside every stimulus (before the first one, or in a pause).
 */
export function placeOnTimeline(timeline: StimulusTimeline, code: string, recordingTimes: ArrayLike<number>): Float64Array {
  const out = new Float64Array(recordingTimes.length).fill(Number.NaN)
  const row = timeline.placements.get(code)
  if (!row) return out
  const own = row
    .map((segment, slot) => (segment ? { segment, start: timeline.slots[slot].start } : null))
    .filter((item): item is { segment: StimulusSegment; start: number } => item != null)
    .sort((a, b) => a.segment.onset_s - b.segment.onset_s)
  for (let index = 0; index < recordingTimes.length; index += 1) {
    const time = recordingTimes[index]
    if (!Number.isFinite(time)) continue
    // The last segment starting at or before `time`.
    let low = 0
    let high = own.length - 1
    let found = -1
    while (low <= high) {
      const middle = (low + high) >> 1
      if (own[middle].segment.onset_s <= time) {
        found = middle
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    if (found < 0) continue
    const { segment, start } = own[found]
    if (time <= segment.end_s) out[index] = start + (time - segment.onset_s)
  }
  return out
}

/**
 * The participant's recording second and scenario at `time` on the group
 * axis; null outside its own recording of the stimulus there.
 */
export function timelineToRecording(
  timeline: StimulusTimeline,
  code: string,
  time: number
): { recordingTime: number; scenario: string } | null {
  if (!Number.isFinite(time)) return null
  const slot = timeline.slots.findIndex((item) => time >= item.start && time <= item.end)
  const segment = slot < 0 ? null : timeline.placements.get(code)?.[slot] ?? null
  if (!segment) return null
  const offset = time - timeline.slots[slot].start
  if (offset > segment.end_s - segment.onset_s) return null
  return { recordingTime: segment.onset_s + offset, scenario: segment.scenario }
}

type DrawnResult = Exclude<CardResult, { type: "empty" }>

/**
 * A participant's card data laid on the timeline: its time series (and
 * spectrogram windows) keep only what falls inside a stimulus, at that
 * stimulus's second on the group axis. Each point keeps its recording time as
 * `sourceTime`. Other results pass unchanged; null when nothing falls inside.
 */
export function alignOnTimeline(result: DrawnResult, timeline: StimulusTimeline, code: string): DrawnResult | null {
  if (result.type === "temporal") {
    const placed = placeOnTimeline(timeline, code, result.points.map((point) => point.sourceTime))
    const points = result.points
      .flatMap((point, index) => (Number.isFinite(placed[index]) ? [{ ...point, time: placed[index] }] : []))
      .sort((a, b) => a.time - b.time)
    return points.length > 0 ? { ...result, points, displayOffset: 0, aligned: true } : null
  }
  if (result.type === "spectrogram") {
    const { data, displayOffset, recordingOffset } = result
    if (recordingOffset == null) return null
    const placed = placeOnTimeline(timeline, code, data.time.map((time) => time - displayOffset + recordingOffset))
    const columns = data.time.flatMap((_, index) => (Number.isFinite(placed[index]) ? [index] : [])).sort((a, b) => placed[a] - placed[b])
    if (columns.length === 0) return null
    const power = Object.fromEntries(
      Object.entries(data.power).map(([channel, rows]) => [channel, rows.map((row) => columns.map((index) => row[index]))])
    )
    return { ...result, data: { ...data, time: columns.map((index) => placed[index]), power }, displayOffset: 0, aligned: true }
  }
  return result
}

/** Views drawn over time: with «Todos los escenarios» they line participants up by stimulus. */
const BY_STIMULUS = new Set<ComparisonKind>(["pupil", "gaze", "distance", "gsr", "eeg_timeseries", "eeg_spectrogram"])

/** Whether `kind` with `scenario` lines participants up by stimulus: «Todos los escenarios» in a time view. */
export function alignsByStimulus(kind: ComparisonKind, scenario: string | null | undefined): boolean {
  const value = (scenario ?? "").trim()
  return BY_STIMULUS.has(kind) && (value.length === 0 || value.toLowerCase() === "all")
}

const UNPLACED = "La grabación de este participante no marca ningún escenario: no se puede alinear con los demás por estímulo."
const OUTSIDE = "Este participante no tiene datos durante los estímulos."

/** A card result laid on the timeline, or an empty one saying why it cannot be. */
export function placeCardResult(result: CardResult, timeline: StimulusTimeline, code: string): CardResult {
  if (result.type === "empty") return result
  if (!timeline.placements.has(code)) return { type: "empty", message: UNPLACED }
  return alignOnTimeline(result, timeline, code) ?? { type: "empty", message: OUTSIDE }
}
