// How the projects API answer becomes the Project that cards and lists show. Every screen that
// builds a Project goes through toProject, so a date reads the same wherever it is shown. Only
// type imports here: the unit tests load this file directly.
import type { ApiProject } from "./api/projectsApi"
import type { Project, ProjectStatus, SensorType } from "./types"

export const SENSOR_TYPES = ["EEG", "GSR", "EyeTracker"] as const satisfies readonly SensorType[]

export const isSensorType = (value: unknown): value is SensorType =>
  typeof value === "string" && (SENSOR_TYPES as readonly string[]).includes(value)

const INGESTION_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }

export function formatProjectDate(iso?: string | null): string {
  if (!iso) return "Sin fecha"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("es-ES", DATE_FORMAT)
}

export function formatProjectDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("es-ES", { ...DATE_FORMAT, hour: "2-digit", minute: "2-digit" })
}

/** A project that was only created has an update time within a second of its creation. */
export function hasRealUpdate(updatedIso?: string | null, createdIso?: string | null): boolean {
  if (!updatedIso) return false
  if (!createdIso) return true
  const updatedMs = new Date(updatedIso).getTime()
  const createdMs = new Date(createdIso).getTime()
  if (!Number.isFinite(updatedMs) || !Number.isFinite(createdMs)) return updatedIso !== createdIso
  return Math.abs(updatedMs - createdMs) > 1000
}

function toStatus(status: unknown): ProjectStatus {
  const normalized = typeof status === "string" ? status.toLowerCase() : ""
  return normalized === "draft" || normalized === "archived" ? normalized : "active"
}

export function toProject(api: ApiProject): Project {
  const ingestion = api.ingestion_status?.toUpperCase()
  const sensors = (api.sensors ?? []).map((sensor) => sensor.sensor_type)
  return {
    id: api.id,
    name: api.name,
    description: api.description ?? undefined,
    status: toStatus(api.status),
    ingestionStatus: INGESTION_STATUSES.find((value) => value === ingestion),
    createdAt: formatProjectDate(api.created_at),
    updatedAt: api.updated_at && hasRealUpdate(api.updated_at, api.created_at)
      ? formatProjectDateTime(api.updated_at)
      : undefined,
    sensors: [...new Set(sensors.filter(isSensorType))],
    participants: api.participants_count || 0,
    isPreExperiment: api.is_pre_experiment ?? false,
    planningParticipantsCount: api.planning_participants_count ?? 0,
    needsUpdate: api.needs_update ?? false,
  }
}
