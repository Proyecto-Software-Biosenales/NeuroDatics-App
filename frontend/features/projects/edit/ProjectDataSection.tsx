"use client"
import { Button } from "@/components/ui/button"
import { CreateProjectStep1 } from "@/features/projects/create-project/CreateProjectStep1"
import { ProjectSaveProgress } from "@/features/projects/components/ProjectSaveProgress"
import type { useFolderReplacement } from "./useFolderReplacement"

/** The experiment folder of the project: replacing it reads the new recordings and updates what the other sections show. */
export function ProjectDataSection({
  folder,
  name,
  description,
}: {
  folder: ReturnType<typeof useFolderReplacement>
  name: string
  description: string
}) {
  return (
    <div className="space-y-5">
      <CreateProjectStep1
        showProjectFields={false}
        projectName={name}
        description={description}
        folderPath={folder.folderPath}
        onProjectNameChange={() => {}}
        onDescriptionChange={() => {}}
        fixationGeometry={folder.geometry}
        onFixationGeometryChange={folder.setGeometry}
        stimulusPlacements={folder.placements}
        onStimulusPathsChange={folder.syncPlacementPaths}
        onStimulusPlacementChange={folder.updatePlacement}
        onFolderPathChange={folder.setFolderPath}
        onFolderSelected={folder.selectFiles}
        onSelectionChange={folder.setSelection}
        zipRequired={false}
        isEditMode
        shouldUpdateFolder={folder.shouldReplace}
        onShouldUpdateFolderChange={folder.setShouldReplace}
      />

      {folder.error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {folder.error}
        </p>
      )}
      {folder.notice && !folder.error && (
        <p role="status" className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {folder.notice}
        </p>
      )}
      {folder.processing && (
        <ProjectSaveProgress
          zipUploadPercent={folder.progress.percent}
          zipUploadBytes={folder.progress.bytes}
          zipUploadSpeedMbps={folder.progress.speedMbps}
          zipUploadEtaSeconds={folder.progress.etaSeconds}
          zipDriveProcessingSeconds={folder.progress.driveSeconds}
          isSaveCompleted={false}
          isZipUploadInProgress
          cancelZipUpload={folder.cancel}
          message={folder.progress.message || "Procesando la carpeta…"}
        />
      )}

      {folder.shouldReplace && (
        <div className="flex justify-end">
          <Button type="button" disabled={!folder.canProcess || folder.processing} onClick={() => void folder.process()}>
            {folder.processing ? "Procesando…" : "Procesar carpeta"}
          </Button>
        </div>
      )}
    </div>
  )
}
