export interface StimulusGazeState {
  nearest_time_s: number
  scenario: string | null
  gx: number | null
  gy: number | null
  scenario_file_id: string | null
  scenario_type?: string | null
}

export interface StimulusPreviewState {
  url: string | null
  loading: boolean
  error: string | null
}

export type StimulusPointStatus =
  | "loading-gaze"
  | "no-gaze"
  | "no-coordinates"
  | "no-stimulus"
  | "loading-preview"
  | "preview-error"
  | "ready"

/** Returns true when a scenario represents an instruction/non-stimulus screen. */
export function isNoImageScenario(name: string | null): boolean {
  if (!name) return false
  const lower = name.toLowerCase().trim()
  return (
    lower.startsWith("instruction") ||
    lower.startsWith("instruccion") ||
    lower.startsWith("instrucción") ||
    lower.startsWith("practice") ||
    lower.startsWith("practica") ||
    lower.startsWith("intro") ||
    lower.startsWith("blank") ||
    lower.startsWith("rest") ||
    lower.startsWith("fixation")
  )
}

export function hasGazeCoordinates(gaze: StimulusGazeState | null): boolean {
  return Boolean(gaze && gaze.gx != null && gaze.gy != null)
}

export function supportsStimulusAois(gaze: StimulusGazeState | null): boolean {
  return String(gaze?.scenario_type ?? "").toLowerCase() !== "video"
}

export function getMissingStimulusMessage(scenario: string | null): string {
  return isNoImageScenario(scenario)
    ? "Pantalla de instrucción — no hay estímulo visual asociado a este escenario"
    : `El escenario "${scenario ?? "desconocido"}" no tiene estímulo visual registrado`
}

export function getPreviewFailureMessage(
  gaze: StimulusGazeState,
  previewError: string | null
): string {
  return String(gaze.scenario_type ?? "").toLowerCase() === "video"
    ? "No se pudo cargar el frame del video."
    : previewError || "No se pudo cargar la imagen del escenario."
}

export function resolveStimulusPointStatus({
  gaze,
  gazeLoading,
  preview,
}: {
  gaze: StimulusGazeState | null
  gazeLoading: boolean
  preview: StimulusPreviewState
}): StimulusPointStatus {
  if (gazeLoading) return "loading-gaze"
  if (!gaze) return "no-gaze"
  if (!hasGazeCoordinates(gaze)) return "no-coordinates"
  if (!gaze.scenario_file_id) return "no-stimulus"
  if (preview.loading) return "loading-preview"
  if (!preview.url) return "preview-error"
  return "ready"
}
