import type { LucideIcon } from "lucide-react"
import {
  Activity,
  BarChart3,
  Brain,
  Crosshair,
  Eye,
  Flame,
  Map,
  Route,
  Ruler,
  Sparkles,
  Waves,
} from "lucide-react"

import type { CorrelationSignalId } from "../types"

export type VisualizationId =
  | "pupil"
  | "distance"
  | "gaze"
  | "gsr"
  | "eeg_timeseries"
  | "fixation_histogram"
  | "eeg_psd"
  | "eeg_spectrogram"
  | "heatmap"
  | "scanpath"
  | "aoi"

export type VisualizationGroup = "temporal" | "frequency" | "spatial"
export type ComparisonSensor = "EyeTracker" | "GSR" | "EEG"

export interface VisualizationDefinition {
  id: VisualizationId
  label: string
  shortLabel: string
  description: string
  group: VisualizationGroup
  sensor: ComparisonSensor
  spatial: boolean
  correlationSignals: CorrelationSignalId[]
  Icon: LucideIcon
}

export const VISUALIZATION_GROUPS: Array<{
  id: VisualizationGroup
  label: string
}> = [
  { id: "temporal", label: "Señales temporales" },
  { id: "frequency", label: "Distribución y frecuencia" },
  { id: "spatial", label: "Mapas y espacio" },
]

/**
 * Stable, product-level ordering for the comparison workspace. Keep identifiers
 * independent from labels so API consumers and saved tests are not coupled to
 * Spanish copy changes.
 */
export const VISUALIZATION_REGISTRY: VisualizationDefinition[] = [
  {
    id: "pupil",
    label: "Dilatación pupilar",
    shortLabel: "Pupila",
    description: "Diámetro suavizado de ambas pupilas a lo largo del tiempo.",
    group: "temporal",
    sensor: "EyeTracker",
    spatial: false,
    correlationSignals: ["pupil_avg_mm"],
    Icon: Eye,
  },
  {
    id: "distance",
    label: "Distancia al dispositivo",
    shortLabel: "Distancia",
    description: "Separación estimada entre los ojos y la pantalla.",
    group: "temporal",
    sensor: "EyeTracker",
    spatial: false,
    correlationSignals: ["distance_cm"],
    Icon: Ruler,
  },
  {
    id: "gaze",
    label: "Gaze point",
    shortLabel: "Gaze point",
    description: "Posición horizontal y vertical de la mirada.",
    group: "temporal",
    sensor: "EyeTracker",
    spatial: false,
    correlationSignals: ["gaze_x_pct", "gaze_y_pct"],
    Icon: Crosshair,
  },
  {
    id: "gsr",
    label: "Respuesta galvánica",
    shortLabel: "GSR",
    description: "Conductancia de la piel suavizada en el tiempo.",
    group: "temporal",
    sensor: "GSR",
    spatial: false,
    correlationSignals: ["gsr_smoothed_us"],
    Icon: Activity,
  },
  {
    id: "eeg_timeseries",
    label: "EEG por canal",
    shortLabel: "EEG por canal",
    description: "Actividad eléctrica suavizada de los canales disponibles.",
    group: "temporal",
    sensor: "EEG",
    spatial: false,
    correlationSignals: ["eeg_broadband_power_db"],
    Icon: Brain,
  },
  {
    id: "fixation_histogram",
    label: "Histograma de fijación",
    shortLabel: "Fijaciones",
    description: "Distribución de las duraciones de fijación.",
    group: "frequency",
    sensor: "EyeTracker",
    spatial: false,
    correlationSignals: [],
    Icon: BarChart3,
  },
  {
    id: "eeg_psd",
    label: "Densidad espectral EEG",
    shortLabel: "PSD EEG",
    description: "Potencia de cada canal por frecuencia.",
    group: "frequency",
    sensor: "EEG",
    spatial: false,
    correlationSignals: ["eeg_broadband_power_db"],
    Icon: Waves,
  },
  {
    id: "eeg_spectrogram",
    label: "Espectrograma de frecuencia",
    shortLabel: "Espectrograma",
    description: "Evolución temporal de la potencia espectral.",
    group: "frequency",
    sensor: "EEG",
    spatial: false,
    correlationSignals: ["eeg_broadband_power_db"],
    Icon: Sparkles,
  },
  {
    id: "heatmap",
    label: "Mapa de calor",
    shortLabel: "Mapa de calor",
    description: "Densidad acumulada de atención sobre el estímulo.",
    group: "spatial",
    sensor: "EyeTracker",
    spatial: true,
    correlationSignals: [],
    Icon: Flame,
  },
  {
    id: "scanpath",
    label: "Mapa de recorridos",
    shortLabel: "Recorridos",
    description: "Secuencia y duración de los objetivos visuales.",
    group: "spatial",
    sensor: "EyeTracker",
    spatial: true,
    correlationSignals: [],
    Icon: Route,
  },
  {
    id: "aoi",
    label: "Comparativa AOIs",
    shortLabel: "AOIs",
    description: "Permanencia y fijaciones por área de interés.",
    group: "spatial",
    sensor: "EyeTracker",
    spatial: true,
    correlationSignals: [],
    Icon: Map,
  },
]

export const VISUALIZATION_BY_ID = Object.fromEntries(
  VISUALIZATION_REGISTRY.map((item) => [item.id, item])
) as Record<VisualizationId, VisualizationDefinition>

export function normalizeAvailableSensors(
  sensors: string[]
): Set<ComparisonSensor> {
  const normalized = new Set<ComparisonSensor>()
  for (const sensor of sensors) {
    const compact = sensor.toLowerCase().replace(/[\s_-]/g, "")
    if (compact === "eyetracker" || compact === "eye")
      normalized.add("EyeTracker")
    if (compact === "gsr" || compact.includes("galvan")) normalized.add("GSR")
    if (compact === "eeg" || compact.includes("electroencef"))
      normalized.add("EEG")
  }
  return normalized
}

export function availableVisualizationIds(
  sensors: string[]
): VisualizationId[] {
  const available = normalizeAvailableSensors(sensors)
  return VISUALIZATION_REGISTRY.filter((item) =>
    available.has(item.sensor)
  ).map((item) => item.id)
}

export function defaultVisualizationIds(sensors: string[]): VisualizationId[] {
  const available = normalizeAvailableSensors(sensors)
  if (available.has("EyeTracker")) return ["pupil", "distance", "gaze"]
  if (available.has("GSR")) return ["gsr"]
  if (available.has("EEG")) return ["eeg_timeseries"]
  return []
}
