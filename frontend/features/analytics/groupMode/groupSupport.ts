/**
 * Which views offer «Superposición» and «Promedio», and why a view that does
 * cannot show them in a scenario. Pure data (type-only imports) so
 * `node --test` runs it directly.
 */

import type { ComparisonKind } from "../participantComparison/spec"

export type GroupMode = "overlay" | "average"

export const GROUP_MODE_LABELS: Record<GroupMode, string> = {
  overlay: "Superposición",
  average: "Promedio",
}

const BOTH: readonly GroupMode[] = ["overlay", "average"]
const AVERAGE: readonly GroupMode[] = ["average"]
const NONE: readonly GroupMode[] = []

/**
 * The group modes each view offers in the participant select; a view lists
 * only what it can draw. EEG overlaid would carry several channels per
 * participant, so it is only averaged; scanpaths cannot be averaged;
 * topographies and the fixation histogram are seen one participant at a time.
 */
const GROUP_MODES: Record<ComparisonKind, readonly GroupMode[]> = {
  pupil: BOTH,
  gaze: BOTH,
  distance: BOTH,
  gsr: BOTH,
  eeg_timeseries: AVERAGE,
  eeg_psd: AVERAGE,
  eeg_spectrogram: AVERAGE,
  eeg_topography: NONE,
  heatmap: BOTH,
  scanpath: ["overlay"],
  aoi: BOTH,
  fixation_histogram: NONE,
}

/** The group modes a view offers; `null` is «Comparativas», which offers none. */
export function groupModesOf(kind: ComparisonKind | null): readonly GroupMode[] {
  return kind ? GROUP_MODES[kind] : NONE
}

/**
 * The group mode kept on moving to a view that offers `modes`: the same one,
 * else the one it offers, else none (back to one participant).
 */
export function carriedGroupMode(mode: GroupMode | null, modes: readonly GroupMode[]): GroupMode | null {
  if (mode == null || modes.includes(mode)) return mode
  return modes[0] ?? null
}

/** Views drawn over one stimulus image: they need a concrete scenario. */
const SPATIAL = new Set<ComparisonKind>(["heatmap", "scanpath", "aoi"])

function isConcreteScenario(scenario: string | null | undefined): boolean {
  const value = (scenario ?? "").trim()
  return value.length > 0 && value.toLowerCase() !== "all"
}

/** Why `kind` cannot show its group modes for `scenario`, in Spanish; null when it can. */
export function groupUnsupportedReason(kind: ComparisonKind, scenario: string): string | null {
  if (SPATIAL.has(kind) && !isConcreteScenario(scenario)) {
    return "Selecciona un escenario concreto: esta vista se dibuja sobre la imagen de un estímulo."
  }
  return null
}

/** How the group modes line up participants in time, in Spanish for the chart. */
export interface GroupTimeAxis {
  /** The same second is the same moment of the same stimulus for every participant. */
  aligned: boolean
  /** The time chip goes beside the chart: the axis is not simply the scenario's own time. */
  noted: boolean
  /** The horizontal axis label. */
  label: string
  /** Where each participant's time 0 is, after «desde»: for sentences and the chart's description. */
  origin: string
  /** The time chip's label. */
  chip: string
  /** The time chip's explanation. */
  detail: string
  /** What each participant's figures cover: «todo el escenario» or «toda la grabación». */
  scope: string
}

/**
 * The time axis of the group modes. With a concrete scenario every
 * participant is counted from that scenario's onset in their own recording.
 * With «Todos los escenarios» and `byStimulus` (`stimulusTimeline.ts`), every
 * stimulus starts at the same second for everybody. Without it there is no
 * common onset: each participant keeps the axis of their individual view, so
 * time 0 is the start of their own recording (GSR: their first GSR sample).
 */
export function groupTimeAxis(kind: ComparisonKind, scenario: string, byStimulus = false): GroupTimeAxis {
  if (isConcreteScenario(scenario)) {
    return {
      aligned: true,
      noted: false,
      label: "Tiempo desde el inicio del escenario (s)",
      origin: "el inicio del escenario",
      chip: "Tiempo alineado",
      detail: "Cada participante se cuenta desde el inicio del escenario en su propia grabación.",
      scope: "todo el escenario",
    }
  }
  if (byStimulus) {
    return {
      aligned: true,
      noted: true,
      label: "Tiempo desde el inicio del primer estímulo (s)",
      origin: "el inicio del primer estímulo",
      chip: "Alineado por estímulo",
      detail:
        "Cada estímulo empieza en el mismo segundo para todos los participantes, aunque lo vieran en otro orden. No se dibuja lo grabado antes del primer estímulo ni las pausas entre estímulos.",
      scope: "toda la grabación",
    }
  }
  const gsr = kind === "gsr"
  const origin = gsr ? "la primera muestra de GSR de su grabación" : "el inicio de su grabación"
  return {
    aligned: false,
    noted: true,
    label: gsr ? "Tiempo desde la primera muestra de GSR (s)" : "Tiempo desde el inicio de la grabación (s)",
    origin,
    chip: "Tiempo de grabación",
    detail: `Con «Todos los escenarios» no hay un inicio común: cada participante se cuenta desde ${origin}, como en su vista individual. El mismo segundo puede corresponder a estímulos distintos en cada participante.`,
    scope: "toda la grabación",
  }
}

/** A palette slot count; see `groupSeriesStyle`. */
export const GROUP_PALETTE_SIZE = 8
const DASHES: ReadonlyArray<string | undefined> = [undefined, "6 3", "2 3", "8 3 2 3"]

/**
 * A participant's colour and line style from its position in the project's
 * full participant list, so it keeps them while others are toggled. Eight
 * categorical colours (CSS variables with light and dark steps); past eight,
 * the colours repeat with a dash pattern as a second cue.
 */
export function groupSeriesStyle(index: number): { color: string; dash: string | undefined } {
  const safe = Number.isInteger(index) && index >= 0 ? index : 0
  return {
    color: `var(--group-series-${(safe % GROUP_PALETTE_SIZE) + 1})`,
    dash: DASHES[Math.floor(safe / GROUP_PALETTE_SIZE) % DASHES.length],
  }
}
