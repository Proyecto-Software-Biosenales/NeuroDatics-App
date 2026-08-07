import type { VisualizationId } from "./registry"

export const COMPARISON_PREFERENCES_VERSION = 1 as const
export const COMPARISON_PREFERENCES_KEY_PREFIX =
  "neurodatics-comparison-views-v1"

export interface ComparisonPreferencesStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface ComparisonPreferencesV1 {
  version: typeof COMPARISON_PREFERENCES_VERSION
  selectedIds: VisualizationId[]
}

// Keep this schema order aligned with VISUALIZATION_REGISTRY. It is repeated
// here deliberately so this storage helper remains directly testable in Node
// without loading the registry's React icon dependencies.
const VISUALIZATION_ID_ORDER = [
  "pupil",
  "distance",
  "gaze",
  "gsr",
  "eeg_timeseries",
  "fixation_histogram",
  "eeg_psd",
  "eeg_spectrogram",
  "heatmap",
  "scanpath",
  "aoi",
] as const satisfies readonly VisualizationId[]

const KNOWN_VISUALIZATION_IDS = new Set<string>(VISUALIZATION_ID_ORDER)

export function comparisonPreferencesKey(
  userId: string,
  projectId: string
): string {
  return `${COMPARISON_PREFERENCES_KEY_PREFIX}:${userId}:${projectId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isVisualizationId(value: unknown): value is VisualizationId {
  return typeof value === "string" && KNOWN_VISUALIZATION_IDS.has(value)
}

function canonicalizeSelectedIds(
  selectedIds: readonly unknown[],
  availableIds?: readonly VisualizationId[]
): VisualizationId[] {
  const selected = new Set(selectedIds.filter(isVisualizationId))
  const available = availableIds ? new Set(availableIds) : null

  return VISUALIZATION_ID_ORDER.filter(
    (id) => selected.has(id) && (!available || available.has(id))
  )
}

/**
 * Reads a saved applied selection without leaking storage or JSON failures to
 * the comparison workspace. `null` means the caller should use its defaults;
 * an empty array represents an explicit user choice to show no views.
 */
export function loadComparisonPreferences(
  storage: ComparisonPreferencesStorage,
  userId: string,
  projectId: string,
  availableIds: readonly VisualizationId[]
): VisualizationId[] | null {
  try {
    const raw = storage.getItem(comparisonPreferencesKey(userId, projectId))
    if (raw === null) return null

    const parsed: unknown = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      parsed.version !== COMPARISON_PREFERENCES_VERSION ||
      !Array.isArray(parsed.selectedIds)
    ) {
      return null
    }

    if (parsed.selectedIds.length === 0) return []
    if (!parsed.selectedIds.every((id) => typeof id === "string")) return null

    const normalized = canonicalizeSelectedIds(
      parsed.selectedIds,
      availableIds
    )

    // A previously non-empty choice that no longer has any compatible view is
    // stale, not an explicit request for an empty workspace.
    return normalized.length > 0 ? normalized : null
  } catch {
    return null
  }
}

/** Saves only the applied selection and reports whether storage accepted it. */
export function saveComparisonPreferences(
  storage: ComparisonPreferencesStorage,
  userId: string,
  projectId: string,
  selectedIds: readonly VisualizationId[]
): boolean {
  const preferences: ComparisonPreferencesV1 = {
    version: COMPARISON_PREFERENCES_VERSION,
    selectedIds: canonicalizeSelectedIds(selectedIds),
  }

  try {
    storage.setItem(
      comparisonPreferencesKey(userId, projectId),
      JSON.stringify(preferences)
    )
    return true
  } catch {
    return false
  }
}
