/**
 * Client-side mirror of `ZipValidationService` structure rules.
 *
 * The backend is the authority — it re-runs every one of these checks on the
 * uploaded archive and answers 409 when something is still ambiguous. Running
 * them here as well lets the wizard ask the user *before* packaging and
 * uploading hundreds of megabytes, instead of after a round trip.
 *
 * Both sides must agree on path semantics, so the rules below match the server:
 * a folder counts when a whole **path component** equals `images` / `videos` /
 * `acquisition` (case-insensitive), never on a substring match.
 */

export const IMAGES_FOLDER_NAME = "images"
export const VIDEOS_FOLDER_NAME = "videos"
export const ACQUISITION_FOLDER_NAME = "acquisition"

/** `Sujet_1001014126_Scenario_Scenario 1_Rec1` */
const ACQUISITION_FOLDER_PATTERN =
  /^sujet[_\s]*([^_]+)_scenario[_\s]*(.+?)_rec[_\s]*(\d+)$/i

export type AcquisitionRecording = {
  folderName: string
  subjectCode: string | null
  scenarioName: string | null
  recordingIndex: number | null
  documents: string[]
}

export type FolderStructureQuestion = {
  code: string
  /** Name of the `FolderSelection` key this question answers. */
  field: keyof FolderSelection
  kind: "choice" | "confirm"
  message: string
  options: string[]
}

export type FolderSelection = {
  selectedCsvPath: string | null
  selectedImagesFolder: string | null
  selectedVideosFolder: string | null
  selectedAcquisitionFolder: string | null
  allowMissingImages: boolean
  allowMissingVideos: boolean
}

export type FolderStructure = {
  /** Archive-relative paths, i.e. with the root folder name already stripped. */
  csvPaths: string[]
  imagesFolders: string[]
  videosFolders: string[]
  acquisitionFolders: string[]
  acquisitionRecordings: AcquisitionRecording[]
}

export const emptyFolderSelection = (): FolderSelection => ({
  selectedCsvPath: null,
  selectedImagesFolder: null,
  selectedVideosFolder: null,
  selectedAcquisitionFolder: null,
  allowMissingImages: false,
  allowMissingVideos: false,
})

export const getFileRelativePath = (file: File): string =>
  (file as unknown as { _relativePath?: string })._relativePath ||
  file.webkitRelativePath ||
  file.name

/** Strip the user's root folder name so paths match the ZIP entries we send. */
export const toArchivePath = (fullPath: string, rootFolderName: string): string => {
  const normalized = fullPath.replace(/\\/g, "/").replace(/^\/+/, "")
  const prefix = `${rootFolderName}/`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
}

/** Deepest ancestor directory of `archivePath` whose name is `folderName`. */
const namedAncestor = (archivePath: string, folderName: string): string | null => {
  const parts = archivePath.split("/")
  const parentParts = parts.slice(0, -1)
  for (let index = parentParts.length - 1; index >= 0; index -= 1) {
    if (parentParts[index].toLowerCase() === folderName) {
      return parentParts.slice(0, index + 1).join("/")
    }
  }
  return null
}

const parseAcquisitionFolderName = (folderName: string): AcquisitionRecording => {
  const match = ACQUISITION_FOLDER_PATTERN.exec(folderName.trim())
  if (!match) {
    return {
      folderName,
      subjectCode: null,
      scenarioName: null,
      recordingIndex: null,
      documents: [],
    }
  }

  const recordingIndex = Number.parseInt(match[3], 10)
  return {
    folderName,
    subjectCode: match[1].trim() || null,
    scenarioName: match[2].trim() || null,
    recordingIndex: Number.isFinite(recordingIndex) ? recordingIndex : null,
    documents: [],
  }
}

export const analyzeFolderStructure = (
  files: File[],
  rootFolderName: string
): FolderStructure => {
  const csvPaths: string[] = []
  const imagesFolders = new Map<string, string>()
  const videosFolders = new Map<string, string>()
  const acquisitionFolders = new Map<string, string>()
  const recordings = new Map<string, AcquisitionRecording>()

  for (const file of files) {
    const archivePath = toArchivePath(getFileRelativePath(file), rootFolderName)
    if (!archivePath || archivePath.startsWith("__MACOSX/")) continue

    const acquisitionFolder = namedAncestor(archivePath, ACQUISITION_FOLDER_NAME)

    if (acquisitionFolder) {
      acquisitionFolders.set(acquisitionFolder.toLowerCase(), acquisitionFolder)

      const parentParts = archivePath.split("/").slice(0, -1)
      const relative = parentParts.slice(acquisitionFolder.split("/").length)
      if (relative.length > 0) {
        const recordingFolder = relative[0]
        const key = recordingFolder.toLowerCase()
        const recording = recordings.get(key) ?? parseAcquisitionFolderName(recordingFolder)
        // Only `Sujet_..._Scenario_..._RecN` folders are recordings. Anything
        // else under Acquisition/ is unrelated reference material.
        if (recording.subjectCode !== null) {
          const documentName = archivePath.split("/").pop() ?? ""
          if (documentName && !recording.documents.includes(documentName)) {
            recording.documents.push(documentName)
          }
          recordings.set(key, recording)
        }
      }
      // Everything under Acquisition/ is reference material: it must not compete
      // with the real Images/Videos folders, and its CSVs are not data sources.
      continue
    }

    const imagesFolder = namedAncestor(archivePath, IMAGES_FOLDER_NAME)
    if (imagesFolder) imagesFolders.set(imagesFolder.toLowerCase(), imagesFolder)

    const videosFolder = namedAncestor(archivePath, VIDEOS_FOLDER_NAME)
    if (videosFolder) videosFolders.set(videosFolder.toLowerCase(), videosFolder)

    if (archivePath.toLowerCase().endsWith(".csv")) csvPaths.push(archivePath)
  }

  return {
    csvPaths: csvPaths.sort(),
    imagesFolders: [...imagesFolders.values()].sort(),
    videosFolders: [...videosFolders.values()].sort(),
    acquisitionFolders: [...acquisitionFolders.values()].sort(),
    acquisitionRecordings: [...recordings.values()].sort((a, b) => {
      if (a.recordingIndex !== null && b.recordingIndex !== null) {
        return a.recordingIndex - b.recordingIndex
      }
      return a.folderName.localeCompare(b.folderName)
    }),
  }
}

/**
 * Hard failures the user cannot resolve by answering a question.
 * Returns `null` when the folder is usable (possibly after clarification).
 */
export const getBlockingStructureError = (structure: FolderStructure): string | null => {
  if (structure.csvPaths.length === 0) {
    return "La carpeta debe contener al menos un archivo .csv con los datos del experimento"
  }
  return null
}

export const buildStructureQuestions = (
  structure: FolderStructure,
  selection: FolderSelection
): FolderStructureQuestion[] => {
  const questions: FolderStructureQuestion[] = []

  if (structure.csvPaths.length > 1 && !selection.selectedCsvPath) {
    questions.push({
      code: "multiple_csv",
      field: "selectedCsvPath",
      kind: "choice",
      message: `La carpeta contiene ${structure.csvPaths.length} archivos .csv. Selecciona cuál debe procesar la aplicación.`,
      options: structure.csvPaths,
    })
  }

  if (structure.imagesFolders.length === 0) {
    if (!selection.allowMissingImages) {
      questions.push({
        code: "no_images_folder",
        field: "allowMissingImages",
        kind: "confirm",
        message: "La carpeta no contiene ninguna subcarpeta 'Images'. ¿Quieres continuar sin imágenes?",
        options: [],
      })
    }
  } else if (structure.imagesFolders.length > 1 && !selection.selectedImagesFolder) {
    questions.push({
      code: "multiple_images_folders",
      field: "selectedImagesFolder",
      kind: "choice",
      message: `La carpeta contiene ${structure.imagesFolders.length} subcarpetas 'Images'. Selecciona cuál debe procesar la aplicación.`,
      options: structure.imagesFolders,
    })
  }

  if (structure.videosFolders.length === 0) {
    if (!selection.allowMissingVideos) {
      questions.push({
        code: "no_videos_folder",
        field: "allowMissingVideos",
        kind: "confirm",
        message: "La carpeta no contiene ninguna subcarpeta 'Videos'. ¿Quieres continuar sin vídeos?",
        options: [],
      })
    }
  } else if (structure.videosFolders.length > 1 && !selection.selectedVideosFolder) {
    questions.push({
      code: "multiple_videos_folders",
      field: "selectedVideosFolder",
      kind: "choice",
      message: `La carpeta contiene ${structure.videosFolders.length} subcarpetas 'Videos'. Selecciona cuál debe procesar la aplicación.`,
      options: structure.videosFolders,
    })
  }

  if (structure.acquisitionFolders.length > 1 && !selection.selectedAcquisitionFolder) {
    questions.push({
      code: "multiple_acquisition_folders",
      field: "selectedAcquisitionFolder",
      kind: "choice",
      message: `La carpeta contiene ${structure.acquisitionFolders.length} subcarpetas 'Acquisition'. Selecciona cuál debe usarse como referencia.`,
      options: structure.acquisitionFolders,
    })
  }

  return questions
}

/**
 * Keep only what the backend ingests or reads: the CSVs, the scenario media and
 * the Acquisition tree (parsed for default values, never stored).
 */
export const filterRelevantFiles = (files: File[], rootFolderName: string): File[] =>
  files.filter((file) => {
    const archivePath = toArchivePath(getFileRelativePath(file), rootFolderName)
    if (!archivePath || archivePath.startsWith("__MACOSX/")) return false
    if (namedAncestor(archivePath, ACQUISITION_FOLDER_NAME)) return true
    if (archivePath.toLowerCase().endsWith(".csv")) return true
    return Boolean(
      namedAncestor(archivePath, IMAGES_FOLDER_NAME) ||
        namedAncestor(archivePath, VIDEOS_FOLDER_NAME)
    )
  })

/** Resolve the selection the way the server will, once all questions are answered. */
export const resolveSelection = (
  structure: FolderStructure,
  selection: FolderSelection
): FolderSelection => ({
  selectedCsvPath:
    structure.csvPaths.length === 1 ? structure.csvPaths[0] : selection.selectedCsvPath,
  selectedImagesFolder:
    structure.imagesFolders.length === 1
      ? structure.imagesFolders[0]
      : selection.selectedImagesFolder,
  selectedVideosFolder:
    structure.videosFolders.length === 1
      ? structure.videosFolders[0]
      : selection.selectedVideosFolder,
  selectedAcquisitionFolder:
    structure.acquisitionFolders.length === 1
      ? structure.acquisitionFolders[0]
      : selection.selectedAcquisitionFolder,
  allowMissingImages: structure.imagesFolders.length === 0 && selection.allowMissingImages,
  allowMissingVideos: structure.videosFolders.length === 0 && selection.allowMissingVideos,
})
