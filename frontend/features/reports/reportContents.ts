import type { SensorType } from "@/features/projects/types"
import type { ReportDevice, ReportScopeKind } from "./types"

export interface DeviceReportDescription {
  title: string
  summary: string
  sections: { individual: string[]; group: string[] }
}

/** What each device report contains, mirrored from the backend report builders. */
export const DEVICE_REPORTS: Record<SensorType, DeviceReportDescription> = {
  EyeTracker: {
    title: "Eye Tracking",
    summary: "Mapas de calor, recorridos visuales, áreas de interés, fijaciones, pupila, mirada y distancia.",
    sections: {
      individual: [
        "Mapa de calor y recorrido visual",
        "Áreas de interés: tiempo, TTFF y transiciones",
        "Histograma de fijaciones",
        "Dilatación pupilar, punto de mirada y distancia con sus estadísticas",
      ],
      group: [
        "Mapa de calor del grupo y recorridos individuales",
        "Áreas de interés: cuántos participantes las miraron y tiempo medio",
        "Fijaciones por participante",
        "Pupila, mirada y distancia por participante con media del grupo",
      ],
    },
  },
  GSR: {
    title: "GSR",
    summary: "Conductancia de la piel, picos de activación y variación respecto a la base.",
    sections: {
      individual: [
        "Señal suavizada y cruda con base, mínimo y máximo",
        "Estadísticas de la señal (N, base, media, DE, pico %)",
      ],
      group: [
        "Variación sobre la base de cada participante",
        "Estadísticas por participante con media del grupo",
        "Pico sobre la base por participante",
      ],
    },
  },
  EEG: {
    title: "EEG",
    summary: "Señal por canal, densidad espectral, potencia por bandas, espectrograma y topografía.",
    sections: {
      individual: [
        "Señal y estadísticas por canal",
        "Densidad espectral y potencia absoluta y relativa por banda",
        "Topografía esquemática por banda",
        "Espectrograma por canal",
      ],
      group: [
        "Potencia relativa por banda de cada participante",
        "Espectro medio de cada participante y potencia por canal",
        "Topografía media del grupo",
      ],
    },
  },
}

export function reportDevices(device: ReportDevice | null, availableSensors: SensorType[]): SensorType[] {
  if (device === "all") return availableSensors
  return device && availableSensors.includes(device) ? [device] : []
}

export function deviceSections(device: SensorType, scope: ReportScopeKind): string[] {
  return DEVICE_REPORTS[device].sections[scope === "participant" ? "individual" : "group"]
}

/** Server filename from Content-Disposition, with a local fallback. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  if (!match) return fallback
  try {
    return decodeURIComponent(match[1].trim())
  } catch {
    return match[1].trim()
  }
}
