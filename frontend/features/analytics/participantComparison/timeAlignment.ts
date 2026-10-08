/**
 * Time references for comparing one scenario across recordings.
 *
 * Each recording has its own clock, so two participants' absolute seconds are
 * never compared. With a concrete scenario every card is drawn in seconds since
 * that scenario's onset in its own recording (the first row the recording
 * labels with the scenario), and every point keeps its original recording time
 * as `sourceTime`. With "Todos los escenarios" there is no common instant: each
 * card keeps the time axis of its individual view and windows are not moved
 * from one recording to another.
 */

import type { TimeWindow } from "./spec"

// Kept local (same rule as spec.ts) so this module has no runtime imports and
// runs under `node --test` without a loader.
function isConcreteScenario(scenario: string | null | undefined): boolean {
  const value = (scenario ?? "").trim()
  return value.length > 0 && value.toLowerCase() !== "all"
}

export interface ScenarioTiming {
  scenario: string
  time_basis: "scenario_onset" | "recording"
  onset_s: number | null
  end_s: number | null
  gsr_origin_s: number | null
}

export type TimeBasis = "recording" | "gsr_relative"

const round = (value: number) => Math.round(value * 1e6) / 1e6

/** Recording seconds of a time expressed in `basis`, or null if unknowable. */
export function toRecordingTime(time: number, basis: TimeBasis, timing: ScenarioTiming | null): number | null {
  if (!Number.isFinite(time)) return null
  if (basis === "recording") return time
  const origin = timing?.gsr_origin_s
  return origin != null && Number.isFinite(origin) ? time + origin : null
}

/** Recording seconds converted to `basis`. */
export function fromRecordingTime(time: number, basis: TimeBasis, timing: ScenarioTiming | null): number | null {
  if (!Number.isFinite(time)) return null
  if (basis === "recording") return time
  const origin = timing?.gsr_origin_s
  return origin != null && Number.isFinite(origin) ? time - origin : null
}

/** Seconds since the scenario onset, from a time in `basis`. */
export function toStimulusTime(time: number, basis: TimeBasis, timing: ScenarioTiming | null): number | null {
  const recording = toRecordingTime(time, basis, timing)
  const onset = timing?.onset_s
  if (recording == null || onset == null || !Number.isFinite(onset)) return null
  return recording - onset
}

/** A time since the scenario onset expressed in one recording's `basis`. */
export function fromStimulusTime(time: number, basis: TimeBasis, timing: ScenarioTiming | null): number | null {
  const onset = timing?.onset_s
  if (!Number.isFinite(time) || onset == null || !Number.isFinite(onset)) return null
  return fromRecordingTime(time + onset, basis, timing)
}

export type WindowTransfer =
  | { kind: "none" }
  | { kind: "relative"; start: number | null; end: number | null }
  | { kind: "not_transferable"; reason: string }

/**
 * Express the source view's window in seconds since the stimulus onset. It
 * can only be carried to other recordings through that common reference.
 */
export function transferWindow(
  window: TimeWindow | null,
  basis: TimeBasis,
  scenario: string,
  sourceTiming: ScenarioTiming | null
): WindowTransfer {
  if (!window || (window.start == null && window.end == null)) return { kind: "none" }
  if (!isConcreteScenario(scenario)) {
    return {
      kind: "not_transferable",
      reason: "La ventana temporal de la vista original no se aplica: con «Todos los escenarios» los tiempos de grabaciones distintas no son equivalentes.",
    }
  }
  const start = window.start == null ? null : toStimulusTime(window.start, basis, sourceTiming)
  const end = window.end == null ? null : toStimulusTime(window.end, basis, sourceTiming)
  if ((window.start != null && start == null) || (window.end != null && end == null)) {
    return {
      kind: "not_transferable",
      reason: "No se pudo ubicar la ventana temporal respecto al inicio del estímulo del participante de origen; se muestra el escenario completo.",
    }
  }
  return { kind: "relative", start: start == null ? null : round(start), end: end == null ? null : round(end) }
}

/**
 * The server window for one participant, or `null` when the relative window
 * falls entirely before that recording's time axis.
 */
export function participantWindow(
  transfer: WindowTransfer,
  basis: TimeBasis,
  timing: ScenarioTiming | null
): TimeWindow | null {
  if (transfer.kind !== "relative") return { start: null, end: null }
  const convert = (value: number | null) => (value == null ? null : fromStimulusTime(value, basis, timing))
  const start = convert(transfer.start)
  const end = convert(transfer.end)
  if ((transfer.start != null && start == null) || (transfer.end != null && end == null)) return null
  // The API rejects negative bounds; the data simply starts later than asked.
  if (end != null && end <= 0) return null
  const clampedStart = start == null ? null : Math.max(0, round(start))
  const clampedEnd = end == null ? null : round(end)
  if (clampedStart != null && clampedEnd != null && clampedEnd <= clampedStart) return null
  return { start: clampedStart, end: clampedEnd }
}

/**
 * How a card's data time maps to the drawn axis and to recording time.
 * `display = time + displayOffset`, `recording = time + recordingOffset`.
 */
export function axisOffsets(
  basis: TimeBasis,
  scenario: string,
  timing: ScenarioTiming | null
): { displayOffset: number; recordingOffset: number | null; aligned: boolean } {
  const recordingOffset = basis === "recording" ? 0 : timing?.gsr_origin_s ?? null
  if (!isConcreteScenario(scenario)) {
    return { displayOffset: 0, recordingOffset, aligned: false }
  }
  const onset = timing?.onset_s
  if (onset == null || recordingOffset == null) return { displayOffset: 0, recordingOffset, aligned: false }
  return { displayOffset: recordingOffset - onset, recordingOffset, aligned: true }
}
