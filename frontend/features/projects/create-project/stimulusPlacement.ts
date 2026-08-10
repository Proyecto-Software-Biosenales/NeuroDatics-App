import type {
  ApiStimulusDisplayMode,
  ApiStimulusPlacementEnvelope,
} from "../api/projectsApi"
import type { FolderSelection } from "./folderStructure"

export interface StimulusPlacementDraft {
  sourceEntryPath: string
  enabled: boolean
  geometryStability: "static"
  screenWidthPx: string
  screenHeightPx: string
  stimulusLeftPx: string
  stimulusTopPx: string
  stimulusWidthPx: string
  stimulusHeightPx: string
  displayMode: ApiStimulusDisplayMode
  viewportEnabled: boolean
  viewportLeftPx: string
  viewportTopPx: string
  viewportWidthPx: string
  viewportHeightPx: string
  scrollXPx: string
  scrollYPx: string
}

export const createEmptyStimulusPlacementDraft = (
  sourceEntryPath: string,
): StimulusPlacementDraft => ({
  sourceEntryPath,
  enabled: false,
  geometryStability: "static",
  screenWidthPx: "",
  screenHeightPx: "",
  stimulusLeftPx: "",
  stimulusTopPx: "",
  stimulusWidthPx: "",
  stimulusHeightPx: "",
  displayMode: "contain",
  viewportEnabled: false,
  viewportLeftPx: "0",
  viewportTopPx: "0",
  viewportWidthPx: "",
  viewportHeightPx: "",
  scrollXPx: "0",
  scrollYPx: "0",
})

const finite = (value: string): number | null => {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const isStimulusPlacementDraftValid = (draft: StimulusPlacementDraft): boolean => {
  if (!draft.enabled) return true
  const screenWidth = finite(draft.screenWidthPx)
  const screenHeight = finite(draft.screenHeightPx)
  const left = finite(draft.stimulusLeftPx)
  const top = finite(draft.stimulusTopPx)
  const width = finite(draft.stimulusWidthPx)
  const height = finite(draft.stimulusHeightPx)
  if (
    screenWidth === null || !Number.isInteger(screenWidth) || screenWidth <= 0 ||
    screenHeight === null || !Number.isInteger(screenHeight) || screenHeight <= 0 ||
    left === null || top === null ||
    width === null || width <= 0 ||
    height === null || height <= 0
  ) {
    return false
  }

  if (draft.displayMode === "fullscreen") {
    return !draft.viewportEnabled && left === 0 && top === 0 &&
      width === screenWidth && height === screenHeight
  }
  if ((draft.displayMode === "cover" || draft.displayMode === "crop") && !draft.viewportEnabled) {
    return false
  }

  const viewportLeft = draft.viewportEnabled ? finite(draft.viewportLeftPx) : 0
  const viewportTop = draft.viewportEnabled ? finite(draft.viewportTopPx) : 0
  const viewportWidth = draft.viewportEnabled ? finite(draft.viewportWidthPx) : screenWidth
  const viewportHeight = draft.viewportEnabled ? finite(draft.viewportHeightPx) : screenHeight
  const scrollX = draft.viewportEnabled ? finite(draft.scrollXPx) : 0
  const scrollY = draft.viewportEnabled ? finite(draft.scrollYPx) : 0
  if (
    viewportLeft === null || viewportTop === null ||
    viewportWidth === null || viewportWidth <= 0 ||
    viewportHeight === null || viewportHeight <= 0 ||
    scrollX === null || scrollX < 0 || scrollY === null || scrollY < 0 ||
    viewportLeft < 0 || viewportTop < 0 ||
    viewportLeft + viewportWidth > screenWidth ||
    viewportTop + viewportHeight > screenHeight
  ) {
    return false
  }

  const right = left + width
  const bottom = top + height
  const viewportRight = viewportLeft + viewportWidth
  const viewportBottom = viewportTop + viewportHeight
  const intersectsViewport =
    Math.min(right, viewportRight) > Math.max(left, viewportLeft) &&
    Math.min(bottom, viewportBottom) > Math.max(top, viewportTop)
  if (!intersectsViewport) return false
  if (draft.displayMode === "contain") {
    return left >= viewportLeft && top >= viewportTop &&
      right <= viewportRight && bottom <= viewportBottom
  }
  if (draft.displayMode === "cover") {
    return left <= viewportLeft && top <= viewportTop &&
      right >= viewportRight && bottom >= viewportBottom
  }
  return true
}

export const serializeStimulusPlacements = (
  drafts: StimulusPlacementDraft[],
): ApiStimulusPlacementEnvelope[] => drafts
  .filter((draft) => draft.enabled)
  .map((draft) => {
    if (!isStimulusPlacementDraftValid(draft)) {
      throw new Error(`Completa la ubicación del estímulo ${draft.sourceEntryPath}.`)
    }

    const placement: ApiStimulusPlacementEnvelope["placement"] = {
      geometry_stability: "static",
      contract_version: "screen-stimulus-v1",
      screen_width_px: Number(draft.screenWidthPx),
      screen_height_px: Number(draft.screenHeightPx),
      stimulus_left_px: Number(draft.stimulusLeftPx),
      stimulus_top_px: Number(draft.stimulusTopPx),
      stimulus_width_px: Number(draft.stimulusWidthPx),
      stimulus_height_px: Number(draft.stimulusHeightPx),
      display_mode: draft.displayMode,
    }
    if (draft.viewportEnabled) {
      placement.viewport = {
        left_px: Number(draft.viewportLeftPx),
        top_px: Number(draft.viewportTopPx),
        width_px: Number(draft.viewportWidthPx),
        height_px: Number(draft.viewportHeightPx),
        scroll_x_px: Number(draft.scrollXPx),
        scroll_y_px: Number(draft.scrollYPx),
      }
    }
    return { source_entry_path: draft.sourceEntryPath, placement }
  })

const isWithinFolder = (archivePath: string, folder: string | null): boolean => {
  if (!folder) return false
  const normalizedFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  return archivePath === normalizedFolder || archivePath.startsWith(`${normalizedFolder}/`)
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff", "svg"])
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov", "mkv", "webm", "m4v"])

const extensionOf = (archivePath: string): string => {
  const name = archivePath.split("/").pop() ?? ""
  const dot = name.lastIndexOf(".")
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ""
}

const fileRelativePath = (file: File): string =>
  (file as unknown as { _relativePath?: string })._relativePath ||
  file.webkitRelativePath ||
  file.name

const archivePathFor = (file: File, rootFolderName: string): string => {
  const normalized = fileRelativePath(file).replace(/\\/g, "/").replace(/^\/+/, "")
  const prefix = `${rootFolderName}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
}

export const selectedStimulusPaths = (
  files: File[],
  rootFolderName: string,
  selection: FolderSelection,
): string[] => {
  const paths = files
    .map((file) => archivePathFor(file, rootFolderName))
    .filter((archivePath) => {
      const extension = extensionOf(archivePath)
      return (
        (isWithinFolder(archivePath, selection.selectedImagesFolder) && IMAGE_EXTENSIONS.has(extension)) ||
        (isWithinFolder(archivePath, selection.selectedVideosFolder) && VIDEO_EXTENSIONS.has(extension))
      )
    })
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b))
}
