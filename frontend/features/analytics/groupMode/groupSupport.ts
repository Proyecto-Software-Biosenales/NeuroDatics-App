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
  /** The mode needs one concrete scenario (a common onset or a stimulus image). */
  requiresConcreteScenario: boolean
}

const TEMPORAL: GroupSupport = { overlay: true, average: true, requiresConcreteScenario: true }

export const GROUP_SUPPORT: Record<ComparisonKind, GroupSupport> = {
  pupil: TEMPORAL,
  gaze: TEMPORAL,
  distance: TEMPORAL,
  gsr: TEMPORAL,
  eeg_timeseries: TEMPORAL,
  eeg_psd: { overlay: true, average: true, requiresConcreteScenario: false },
  eeg_spectrogram: { overlay: false, average: true, requiresConcreteScenario: true },
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
      : "Selecciona un escenario concreto: cada participante se alinea desde el inicio de ese escenario."
  }
  return null
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
