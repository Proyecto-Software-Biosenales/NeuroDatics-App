import type { ApiProjectDetail } from "@/features/projects/api/projectsApi"
import type { scenaries } from "@/features/projects/create-project/types"
import { apiAoiToFormAoi } from "@/features/projects/create-project/aoiUtils"
import { resolveScenarioImageUrl } from "@/features/projects/driveFallbackUrl"

export const toParticipantSex = (value: unknown): "male" | "female" | "other" | null => {
  if (value === "male" || value === "female" || value === "other") return value
  if (value === "MALE") return "male"
  if (value === "FEMALE") return "female"
  if (value === "OTHER") return "other"
  return null
}

/** Older projects carried their id after the name ("Estudio-9ac9ef2b-20260324225557"); editing shows only the name. */
export const extractProjectNameAndId = (fullName: string): { name: string; id: string } => {
  const normalized = fullName.trim()
  if (!normalized) return { name: fullName, id: "" }

  const shortIdWithTimestampMatch = normalized.match(/^(.*)-([a-fA-F0-9]{8}-\d{14})$/)
  if (shortIdWithTimestampMatch) {
    return { name: shortIdWithTimestampMatch[1], id: shortIdWithTimestampMatch[2] }
  }

  const uuidMatch = normalized.match(
    /^(.*)-([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/
  )
  if (uuidMatch) return { name: uuidMatch[1], id: uuidMatch[2] }

  const lastDashIndex = normalized.lastIndexOf("-")
  if (lastDashIndex === -1) return { name: fullName, id: "" }

  const name = normalized.substring(0, lastDashIndex)
  const id = normalized.substring(lastDashIndex + 1)
  if (/^[a-fA-F0-9-]{8,}$/.test(id)) return { name, id }

  return { name: fullName, id: "" }
}

export const toFriendlyErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : ""
  if (!raw) return "No se pudieron guardar los cambios del proyecto."

  // Payloads like: API 400: {"detail":"..."}
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (typeof parsed?.detail === "string" && parsed.detail.trim()) return parsed.detail
    } catch {
      // Fall through to the prefix cleanup below.
    }
  }

  return raw
    .replace(/^API\s*\d+\s*:\s*/i, "")
    .replace(/^Error subiendo archivo:\s*/i, "")
    .trim()
}

export const isGoogleSessionExpiredError = (message: string): boolean =>
  /google drive|oauth|invalid_grant|refresh token|token has expired|no se pudo configurar google drive/i.test(message)

/** The message to show for a failed save or upload; cancelling is not an error. */
export function describeFailure(error: unknown) {
  const friendly = toFriendlyErrorMessage(error)
  const cancelled = /cancelad|abort/i.test(friendly)
  const message = isGoogleSessionExpiredError(friendly)
    ? `${friendly}. Tu sesión de Google Drive puede haber expirado. Vuelve a conectar Google Drive.`
    : friendly
  return { cancelled, message }
}

export const parseScenaries = (project: ApiProjectDetail): scenaries[] => {
  const filesById = new Map<string, NonNullable<ApiProjectDetail["files"]>[number]>()
  for (const file of project.files || []) filesById.set(file.id, file)

  return (project.scenaries || []).map((s) => ({
    id: s.id,
    projectId: project.id,
    name: s.name,
    type: String(s.type || "").toLowerCase() === "video" ? "video" : "image",
    fileId: s.file_id ?? null,
    imageUrl: s.file_id ? resolveScenarioImageUrl(filesById.get(s.file_id)) : null,
    aois: (s.aois || []).map((a, index) => apiAoiToFormAoi(a, index)),
  }))
}

export const getCurrentZipFilename = (project: ApiProjectDetail): string => {
  if (project.source_folder_name) return project.source_folder_name
  // Projects ingested before the folder name was recorded kept the uploaded ZIP.
  const zipFiles = (project.files || []).filter((file) => file.kind === "experiment_zip")
  if (zipFiles.length === 0) return ""

  const latestZip = [...zipFiles].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA
  })[0]

  return latestZip?.filename || ""
}
