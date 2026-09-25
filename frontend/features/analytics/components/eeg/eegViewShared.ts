import type { ChannelStats } from "../../eegPresentation"
import type { EegArtifactSpan } from "../../types"

export const EEG_CHANNELS = ["le", "f4", "c4", "p4", "p3", "c3", "f3"]

export const TOPOGRAPHY_CHANNELS = ["f3", "f4", "c3", "c4", "p3", "p4"]

export const CHANNEL_COLORS: Record<string, string> = {
  le: "#2563EB",
  f4: "#DC2626",
  c4: "#059669",
  p4: "#7C3AED",
  p3: "#EA580C",
  c3: "#65A30D",
  f3: "#BE123C",
}

/** One colour per detector, shared by the chart shading and the span chips, so
 *  a chip can be matched to its band. */
export const ARTIFACT_DETECTORS: { detector: EegArtifactSpan["detector"]; label: string; color: string }[] = [
  { detector: "amplitude", label: "amplitud", color: "#DC2626" },
  { detector: "step", label: "escalón", color: "#D97706" },
  { detector: "peak_to_peak", label: "pico a pico", color: "#7C3AED" },
]

export const ARTIFACT_DETECTOR_COLORS = Object.fromEntries(
  ARTIFACT_DETECTORS.map(({ detector, color }) => [detector, color])
) as Record<EegArtifactSpan["detector"], string>

/** Chips jump between these sections; each target carries tabIndex={-1}. */
export const EEG_TIMESERIES_CHART_ID = "eeg-timeseries-chart"
export const EEG_ARTIFACT_SPANS_ID = "eeg-artifact-spans"
export const EEG_QUALITY_NOTES_ID = "eeg-quality-notes"

/** Scrolls to a section and moves focus with it, so the next Tab continues
 *  from there instead of from a chip that is now off screen. */
export function scrollToSection(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
  target.focus({ preventScroll: true })
}

/** Focus ring for a section that only receives focus from a jump. */
export const JUMP_TARGET_CLASS = "scroll-mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

export type SignalMode = "smooth" | "raw" | "both"

/** "stacked" is the montage a reader of EEG expects: one lane per channel, so a
 *  single loud channel cannot flatten the other six on a shared axis. */
export type ChartLayout = "overlay" | "stacked"

export type EegView = "timeseries" | "psd" | "spectrogram" | "topography"

export interface EegTabProps {
  projectId: string
  participantCode: string | null
  scenario: string
  view: EegView
}

export interface EegChartPoint {
  time: number
  [key: string]: number
}

export interface EegPsdChartPoint {
  frequency: number
  [key: string]: number
}

export interface PsdStats extends ChannelStats {
  peakFrequency: number
  peakPower: number
}

export interface SpectrogramStats {
  channel: string
  frequencyBins: number
  timeBins: number
  peakFrequency: number
  peakTime: number
  peakPower: number
  meanPower: number
  stdPower: number
  medianPower: number
  minPower: number
  maxPower: number
}
