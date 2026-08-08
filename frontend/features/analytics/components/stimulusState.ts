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

export type MissingStimulusCategory =
  | "instructions"
  | "practice"
  | "introduction"
  | "blank"
  | "rest"
  | "fixation"
  | "custom"
  | "missing"

export interface MissingStimulusDescriptor {
  category: MissingStimulusCategory
  displayLabel: string
}

const COMMON_STIMULUS_EXTENSION =
  /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp|avi|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm)$/i

const MISSING_STIMULUS_CATEGORIES: ReadonlyArray<{
  category: Exclude<MissingStimulusCategory, "custom" | "missing">
  prefixes: readonly string[]
  displayLabel: string
}> = [
  {
    category: "instructions",
    prefixes: ["instructions", "instruction", "instrucciones", "instruccion"],
    displayLabel: "INSTRUCCIONES",
  },
  {
    category: "practice",
    prefixes: ["practices", "practice", "practicas", "practica"],
    displayLabel: "PRÁCTICA",
  },
  {
    category: "introduction",
    prefixes: [
      "introductions",
      "introduction",
      "introducciones",
      "introduccion",
      "intro",
    ],
    displayLabel: "INTRODUCCIÓN",
  },
  {
    category: "blank",
    prefixes: ["blank", "pantalla en blanco"],
    displayLabel: "PANTALLA EN BLANCO",
  },
  {
    category: "rest",
    prefixes: ["rest", "descanso"],
    displayLabel: "DESCANSO",
  },
  {
    category: "fixation",
    prefixes: ["fixations", "fixation", "fijaciones", "fijacion"],
    displayLabel: "FIJACIÓN",
  },
]

function scenarioBasename(scenario: string | null): string {
  if (!scenario?.trim()) return ""

  const basename = scenario.trim().split(/[\\/]/).at(-1)?.trim() ?? ""
  return basename.replace(COMMON_STIMULUS_EXTENSION, "").trim()
}

function normalizeScenarioName(scenario: string): string {
  return scenario
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function matchesCategoryPrefix(name: string, prefix: string): boolean {
  if (!name.startsWith(prefix)) return false
  const suffix = name.slice(prefix.length)
  return suffix === "" || /^[\s\d]/.test(suffix)
}

/** Describes the generic image used when a scenario has no stimulus file. */
export function getMissingStimulusDescriptor(
  scenario: string | null
): MissingStimulusDescriptor {
  const basename = scenarioBasename(scenario)
  if (!basename) {
    return { category: "missing", displayLabel: "SIN ESTÍMULO VISUAL" }
  }

  const normalizedName = normalizeScenarioName(basename)
  const descriptor = MISSING_STIMULUS_CATEGORIES.find(({ prefixes }) =>
    prefixes.some((prefix) => matchesCategoryPrefix(normalizedName, prefix))
  )

  if (descriptor) {
    return {
      category: descriptor.category,
      displayLabel: descriptor.displayLabel,
    }
  }

  return { category: "custom", displayLabel: basename }
}

export function hasGazeCoordinates(gaze: StimulusGazeState | null): boolean {
  return Boolean(gaze && gaze.gx != null && gaze.gy != null)
}

export function supportsStimulusAois(gaze: StimulusGazeState | null): boolean {
  return String(gaze?.scenario_type ?? "").toLowerCase() !== "video"
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
