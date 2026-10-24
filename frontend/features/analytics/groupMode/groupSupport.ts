/**
 * Which views admit «Superposición» and «Promedio», and why not when they do
 * not. Pure data (type-only imports) so `node --test` runs it directly.
 */

import type { ComparisonKind } from "../participantComparison/spec"

export type GroupMode = "overlay" | "average"

export const GROUP_MODE_LABELS: Record<GroupMode, string> = {
  overlay: "Superposición",
  average: "Promedio",
}

export interface GroupSupport {
  overlay: boolean
  average: boolean
  /**
   * The mode needs one concrete scenario: a stimulus image, or one common
   * instant (topography). Time views also take «Todos los escenarios», on
   * each recording's own time (`groupTimeAxis`).
   */
  requiresConcreteScenario: boolean
}

const TEMPORAL: GroupSupport = { overlay: true, average: true, requiresConcreteScenario: false }

export const GROUP_SUPPORT: Record<ComparisonKind, GroupSupport> = {
  pupil: TEMPORAL,
  gaze: TEMPORAL,
  distance: TEMPORAL,
  gsr: TEMPORAL,
  eeg_timeseries: TEMPORAL,
  eeg_psd: { overlay: true, average: true, requiresConcreteScenario: false },
  eeg_spectrogram: { overlay: false, average: true, requiresConcreteScenario: false },
  eeg_topography: { overlay: false, average: true, requiresConcreteScenario: true },
  heatmap: { overlay: true, average: true, requiresConcreteScenario: true },
  scanpath: { overlay: true, average: false, requiresConcreteScenario: true },
  aoi: { overlay: true, average: true, requiresConcreteScenario: true },
  fixation_histogram: { overlay: false, average: false, requiresConcreteScenario: false },
}

const SPATIAL = new Set<ComparisonKind>(["heatmap", "scanpath", "aoi"])

function isConcreteScenario(scenario: string | null | undefined): boolean {
  const value = (scenario ?? "").trim()
  return value.length > 0 && value.toLowerCase() !== "all"
}

const NOT_AVAILABLE: Partial<Record<ComparisonKind, Partial<Record<GroupMode, string>>>> = {
  fixation_histogram: {
    overlay: "El histograma de fijaciones se ve de un participante a la vez.",
    average: "El histograma de fijaciones se ve de un participante a la vez.",
  },
  eeg_spectrogram: {
    overlay: "Los espectrogramas no se pueden dibujar uno encima de otro. Elige «Promedio» para ver el espectrograma medio.",
  },
  eeg_topography: {
    overlay: "Las topografías no se pueden dibujar una encima de otra. Elige «Promedio» para ver la topografía media.",
  },
  scanpath: {
    average: "Los recorridos no se pueden promediar. Elige «Superposición» para ver el recorrido de cada participante.",
  },
}

/** Why `kind` cannot be shown in `mode` for `scenario`, in Spanish; null when it can. */
export function groupUnsupportedReason(kind: ComparisonKind, mode: GroupMode, scenario: string): string | null {
  const support = GROUP_SUPPORT[kind]
  if (!support[mode]) {
    return NOT_AVAILABLE[kind]?.[mode] ?? `Esta vista no admite «${GROUP_MODE_LABELS[mode]}».`
  }
  if (support.requiresConcreteScenario && !isConcreteScenario(scenario)) {
    return SPATIAL.has(kind)
      ? "Selecciona un escenario concreto: esta vista se dibuja sobre la imagen de un estímulo."
      : "Selecciona un escenario concreto: la topografía compara el mismo instante del estímulo en cada participante."
  }
  return null
}

/** How the group modes line up participants in time, in Spanish for the chart. */
export interface GroupTimeAxis {
  /** True with a concrete scenario: every participant counts from that scenario's onset. */
  aligned: boolean
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
 * With «Todos los escenarios» there is no common onset: each participant
 * keeps the axis of their individual view, so time 0 is the start of their
 * own recording (GSR: their first GSR sample).
 */
export function groupTimeAxis(kind: ComparisonKind, scenario: string): GroupTimeAxis {
  if (isConcreteScenario(scenario)) {
    return {
      aligned: true,
      label: "Tiempo desde el inicio del escenario (s)",
      origin: "el inicio del escenario",
      chip: "Tiempo alineado",
      detail: "Cada participante se cuenta desde el inicio del escenario en su propia grabación.",
      scope: "todo el escenario",
    }
  }
  const gsr = kind === "gsr"
  const origin = gsr ? "la primera muestra de GSR de su grabación" : "el inicio de su grabación"
  return {
    aligned: false,
    label: gsr ? "Tiempo desde la primera muestra de GSR (s)" : "Tiempo desde el inicio de la grabación (s)",
    origin,
    chip: "Tiempo de grabación",
    detail: `Con «Todos los escenarios» no hay un inicio común: cada participante se cuenta desde ${origin}, como en su vista individual. El mismo segundo puede corresponder a estímulos distintos en cada participante.`,
    scope: "toda la grabación",
  }
}

/** Views that are not one chart kind, such as the multi-sensor «Comparativas». */
export const COMPARATIVAS_UNSUPPORTED =
  "«Comparativas» reúne varios sensores de un participante y no admite superposición ni promedio."

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
