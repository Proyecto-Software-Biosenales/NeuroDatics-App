import type { ChannelStats } from "../../eegPresentation"

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

export type SignalMode = "smooth" | "raw" | "both"

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
