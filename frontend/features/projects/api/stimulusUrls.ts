export function getStimulusImageUrl(projectId: string, fileId: string): string {
  return `/api/projects/${projectId}/files/${fileId}/image`
}

export interface StimulusPreviewOptions {
  timeS?: number | null
  participantCode?: string | null
  scenario?: string | null
}

export function getStimulusPreviewUrl(
  projectId: string,
  fileId: string,
  { timeS, participantCode, scenario }: StimulusPreviewOptions = {}
): string {
  const params = new URLSearchParams()
  if (timeS != null) params.set("time_s", String(timeS))
  if (participantCode) params.set("participant_code", participantCode)
  if (scenario) params.set("scenario", scenario)
  const query = params.toString()
  return `/api/projects/${projectId}/files/${fileId}/preview${query ? `?${query}` : ""}`
}
