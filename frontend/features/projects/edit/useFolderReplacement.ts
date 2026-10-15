"use client"
import { useCallback, useState } from "react"
import { ProjectsApi, asUploadClarification, type ApiProjectDetail } from "@/features/projects/api/projectsApi"
import type { UploadedProjectZip } from "@/features/projects/types"
import {
  createEmptyFixationScreenGeometry,
  resolveFixationGeometry,
  type FixationScreenGeometryInput,
  type ParticipantData,
} from "@/features/projects/create-project/types"
import { getFileRelativePath, type FolderSelection } from "@/features/projects/create-project/folderStructure"
import { useZipUploadAttempt } from "@/features/projects/create-project/useZipUploadAttempt"
import { packageExperimentFolder } from "@/features/projects/create-project/packageExperimentFolder"
import { detectedUploadMetadata } from "@/features/projects/create-project/uploadMetadata"
import {
  createEmptyStimulusPlacementDraft,
  isStimulusPlacementDraftValid,
  serializeStimulusPlacements,
  type StimulusPlacementDraft,
} from "@/features/projects/create-project/stimulusPlacement"
import { useScreenSettings } from "@/features/settings/screenSettings"
import { storageCopy } from "@/features/projects/storageCopy"
import { describeFailure, getCurrentZipFilename, parseScenaries } from "./projectDetail"

export type UploadProgress = {
  message: string | null
  percent: number | null
  bytes: { loaded: number; total: number } | null
  speedMbps: number | null
  etaSeconds: number | null
  driveSeconds: number | null
}

const noProgress: UploadProgress = {
  message: null,
  percent: null,
  bytes: null,
  speedMbps: null,
  etaSeconds: null,
  driveSeconds: null,
}

/** What reading the new folder found, handed to the editor to replace what it shows. */
export type ProcessedFolder = {
  folderName: string
  scenaries: ReturnType<typeof parseScenaries>
  sensors: ReturnType<typeof detectedUploadMetadata>["sensors"]
  participants: ParticipantData[]
}

/** Replacing the experiment folder of a project: choosing it, answering its structure questions,
 *  packaging and uploading it. It lives in the editor, not in its tab, so leaving the tab keeps the upload. */
export function useFolderReplacement({
  projectId,
  participants,
  saveMetadata,
  onProcessed,
}: {
  projectId: string
  participants: ParticipantData[]
  /** Saves the name and description first, which the upload relies on. */
  saveMetadata: () => Promise<void>
  onProcessed: (folder: ProcessedFolder) => void
}) {
  const savedScreen = useScreenSettings()?.screen ?? null
  const uploadAttempt = useZipUploadAttempt(projectId)
  const resetAttempt = uploadAttempt.reset
  const [shouldReplace, setShouldReplace] = useState(false)
  const [files, setFiles] = useState<File[] | null>(null)
  const [folderPath, setFolderPath] = useState("")
  const [selection, setSelection] = useState<FolderSelection | null>(null)
  const [geometry, setGeometry] = useState<FixationScreenGeometryInput>(createEmptyFixationScreenGeometry)
  const [placements, setPlacements] = useState<StimulusPlacementDraft[]>([])
  const [uploadedZip, setUploadedZip] = useState<UploadedProjectZip | null>(null)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<UploadProgress>(noProgress)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [processed, setProcessed] = useState(false)

  const geometryIsValid =
    !geometry.enabled ||
    [geometry.widthPx, geometry.heightPx, geometry.widthCm, geometry.heightCm].every(
      (value) => Number.isFinite(Number(value)) && Number(value) > 0
    )
  const canProcess =
    shouldReplace &&
    !!files?.length &&
    !!selection &&
    geometryIsValid &&
    placements.every(isStimulusPlacementDraftValid)

  const selectFiles = (next: File[] | null) => {
    setFiles(next)
    setUploadedZip(null)
    setFolderPath(next?.[0] ? getFileRelativePath(next[0]).split("/")[0] : "")
  }
  const syncPlacementPaths = (paths: string[]) =>
    setPlacements((previous) => {
      const existing = new Map(previous.map((placement) => [placement.sourceEntryPath, placement]))
      return paths.map((path) => existing.get(path) ?? createEmptyStimulusPlacementDraft(path))
    })
  const updatePlacement = (sourceEntryPath: string, update: Partial<StimulusPlacementDraft>) =>
    setPlacements((previous) =>
      previous.map((placement) =>
        placement.sourceEntryPath === sourceEntryPath ? { ...placement, ...update, sourceEntryPath } : placement
      )
    )

  /** Forgets the chosen folder and any message, e.g. when the project is reloaded. */
  const reset = useCallback((current?: ApiProjectDetail) => {
    resetAttempt()
    setShouldReplace(false)
    setFiles(null)
    setSelection(null)
    setGeometry(createEmptyFixationScreenGeometry())
    setPlacements([])
    setUploadedZip(null)
    setProcessing(false)
    setProgress(noProgress)
    setError(null)
    setNotice(null)
    setProcessed(false)
    setFolderPath(current ? getCurrentZipFilename(current) : "")
  }, [resetAttempt])

  const process = async () => {
    if (!canProcess || !files?.length) return
    const attempt = uploadAttempt.begin()
    if (!attempt) return
    setProcessing(true)
    setError(null)
    setNotice(null)
    setProgress({ ...noProgress, message: "Subiendo datos del experimento…" })

    try {
      await saveMetadata()
      attempt.assertActive()
      let result = uploadedZip?.ingestion_status === "READY" ? uploadedZip : null
      if (!result) {
        setProgress((previous) => ({ ...previous, message: "Preparando la carpeta…" }))
        const zipFile = await packageExperimentFolder(files, attempt.signal)
        attempt.assertActive()
        attempt.startPolling(projectId, (snapshot) => {
          const totalBytes = Math.max(0, snapshot.total_bytes || 0)
          const uploadedBytes = Math.max(0, snapshot.uploaded_bytes || 0)
          if (totalBytes <= 0 && snapshot.phase !== "completed" && snapshot.phase !== "failed") {
            setProgress((previous) => ({ ...previous, message: storageCopy.preparingSync }))
            return
          }
          const { percent, speed_mbps: speedMbps = null, eta_seconds: etaSeconds = null } = snapshot
          const message =
            snapshot.phase === "canceling"
              ? "Cancelando la subida…"
              : percent >= 99 && snapshot.phase !== "completed"
                ? storageCopy.finalizingSync
                : storageCopy.syncing(percent)
          setProgress({
            message,
            percent,
            bytes: { loaded: uploadedBytes, total: totalBytes },
            speedMbps,
            etaSeconds,
            driveSeconds: snapshot.elapsed_seconds ?? 0,
          })
        })

        attempt.markRequestStarted(projectId)
        result = await ProjectsApi.uploadZipWithProgress(
          projectId,
          zipFile,
          (step) => {
            if (!attempt.isCurrent() || attempt.signal.aborted) return
            if (step.phase === "uploading") {
              setProgress((previous) => ({ ...previous, message: `Subiendo datos del experimento… ${step.percent}%` }))
            }
          },
          attempt.signal,
          selection,
          resolveFixationGeometry(geometry, savedScreen),
          serializeStimulusPlacements(placements),
          attempt.id
        )
        attempt.markRequestCompleted()
        if (!attempt.isCurrent()) return
        if (result.ingestion_status !== "READY") {
          throw new Error("No se pudieron procesar los datos. Revisa la carpeta.")
        }
        // A successful result survives a failed refresh: retrying reloads instead of uploading again.
        setUploadedZip(result)
      }

      const refreshed = await ProjectsApi.get(projectId)
      if (!attempt.isCurrent()) return
      const detected = detectedUploadMetadata(result, participants)
      const folderName = getCurrentZipFilename(refreshed) || folderPath
      setFolderPath(folderName)
      setProcessed(true)
      setShouldReplace(false)
      setNotice("Carpeta procesada.")
      onProcessed({
        folderName,
        scenaries: parseScenaries(refreshed),
        sensors: detected.sensors,
        participants: detected.participants,
      })
    } catch (failure) {
      if (!attempt.isCurrent()) return
      // The backend re-validates the structure; show its questions and let the person answer them again.
      const clarification = asUploadClarification(failure)
      if (clarification) {
        setNotice(null)
        setError([clarification.message, ...clarification.questions.map((question) => question.message)].join(" "))
        setSelection(null)
        setFiles(null)
        return
      }
      const { cancelled, message } = describeFailure(failure)
      if (cancelled) {
        setError(null)
        setNotice("Subida cancelada.")
      } else {
        setNotice(null)
        setError(message)
      }
    } finally {
      const current = attempt.isCurrent()
      uploadAttempt.finish(attempt)
      if (current) {
        setProcessing(false)
        setProgress(noProgress)
      }
    }
  }

  const cancel = () => {
    uploadAttempt.cancel()
    setProgress((previous) => ({ ...previous, message: storageCopy.cancellingUpload }))
  }

  return {
    shouldReplace,
    setShouldReplace,
    files,
    selectFiles,
    folderPath,
    setFolderPath,
    selection,
    setSelection,
    geometry,
    setGeometry,
    placements,
    syncPlacementPaths,
    updatePlacement,
    uploadedZip,
    processing,
    progress,
    error,
    notice,
    processed,
    canProcess,
    process,
    cancel,
    reset,
  }
}
