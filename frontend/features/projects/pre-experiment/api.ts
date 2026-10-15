import { apiFetch, ApiError } from "@/lib/api/apiFetch"
import type {
  Answers,
  Phase,
  PreExperimentConfig,
  PreExperimentEnvelope,
  QuestionnaireResponse,
} from "./types"
const path = (id: string) =>
  `/api/projects/${encodeURIComponent(id)}/pre-experiment`
export const PreExperimentApi = {
  get: (id: string, signal?: AbortSignal) =>
    apiFetch<PreExperimentEnvelope>(path(id), { signal }),
  save: (id: string, revision: number, config: PreExperimentConfig) =>
    apiFetch<PreExperimentEnvelope>(path(id), {
      method: "PUT",
      body: JSON.stringify({ revision, config }),
    }),
  respond: (
    id: string,
    revision: number,
    participant_id: string,
    phase: Phase,
    answers: Answers
  ) =>
    apiFetch<QuestionnaireResponse>(`${path(id)}/responses`, {
      method: "POST",
      body: JSON.stringify({ revision, participant_id, phase, answers }),
    }),
  export: (id: string) => apiFetch<unknown>(`${path(id)}/export`),
}
export const planningError = (error: unknown) =>
  error instanceof ApiError && error.status === 409
    ? "La configuración cambió en otra sesión. Conservamos tus cambios; descártalos y recarga la versión guardada antes de continuar."
    : error instanceof Error
      ? `No se pudo completar la operación: ${error.message}`
      : "No se pudo completar la operación. Vuelve a intentarlo."
