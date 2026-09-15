"use client"

import { ProjectSaveProgress } from "@/features/projects/components/ProjectSaveProgress"
import { ChevronLeft, ChevronRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { useCreateProjectWizard } from "./useCreateProjectWizard"
import { CreateProjectStep1 } from "./CreateProjectStep1"
import { CreateProjectStep2 } from "./CreateProjectStep2"
import { CreateProjectStep3 } from "./CreateProjectStep3"
import { CreateProjectStep4 } from "./CreateProjectStep4"
import { useEffect, type ReactNode } from "react"
import type { Project, SensorType } from "@/features/projects/types"

interface CreateProjectDialogProps {
  trigger: ReactNode
  onProjectCreated?: (project: Project) => void
  onStep1Complete?: () => void
  resumeProject?: Project | null
  onResumeHandled?: () => void
}

export const CreateProjectDialog = ({
  trigger,
  onProjectCreated,
  onStep1Complete,
  resumeProject,
  onResumeHandled,
}: CreateProjectDialogProps) => {
  const {
    currentStep,
    formData,
    isOpen,
    setIsOpen,
    updateProjectName,
    updateDescription,
    updateFixationGeometry,
    syncStimulusPlacementPaths,
    updateStimulusPlacement,
    updateFolderPath,
    toggleSensor,
    updateParticipant,
    updateScenaryAois,
    canGoNext,
    nextStep,
    prevStep,
    reset,
    saveProject,
    isSaving,
    saveError,
    saveNotice,
    isSaveCompleted,
    saveProgressMessage,
    zipUploadPercent,
    zipUploadBytes,
    zipUploadSpeedMbps,
    zipUploadEtaSeconds,
    zipDriveProcessingSeconds,
    isZipUploadInProgress,
    cancelZipUpload,
    setExperimentFolder,
    setFolderStructureSelection,
    discardDraftProject,
    openForResume,
    isResumedDraft,
  } = useCreateProjectWizard(onProjectCreated, onStep1Complete)

  useEffect(() => {
    if (!resumeProject) return
    void openForResume(resumeProject)
    onResumeHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeProject])


  const step1Done =
    isResumedDraft ||
    formData.uploadedZip?.ingestion_status === "READY" ||
    formData.uploadedZip?.ingestion_status === "PROCESSING"

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (isZipUploadInProgress || step1Done) {
        // Upload running or step 1 already completed — keep the project alive
        // and refresh the cards list so the draft card shows the current state
        onStep1Complete?.()
        setIsOpen(false)
        reset()
        return
      }
      // Step 1 never completed — safe to delete draft and reset
      void discardDraftProject()
      reset()
    }
    setIsOpen(open)
  }

  const handleCancel = async () => {
    if (isZipUploadInProgress || step1Done) {
      onStep1Complete?.()
      setIsOpen(false)
      reset()
      return
    }
    await discardDraftProject()
    reset()
    setIsOpen(false)
  }
  

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        className="max-h-[calc(100vh-2rem)] overflow-y-auto p-5 sm:max-w-3xl xl:max-h-[90vh] xl:p-8"
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold xl:text-2xl">
            Crear nuevo proyecto
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              <span className="text-sm text-muted-foreground">
                Paso {currentStep} de 4
              </span>

              <div className="flex gap-2 mt-4">
                {[1, 2, 3, 4].map((step) => (
                  <Progress
                    key={step}
                    value={currentStep >= step ? 100 : 0}
                    className={currentStep >= step ? "" : "opacity-30"}
                  />
                ))}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 xl:py-6">
          {currentStep === 1 && (
            <CreateProjectStep1
              projectName={formData.projectName}
              description={formData.description}
              folderPath={formData.folderPath}
              uploadedZip={formData.uploadedZip}
              onProjectNameChange={updateProjectName}
              onDescriptionChange={updateDescription}
              fixationGeometry={formData.fixationGeometry}
              onFixationGeometryChange={updateFixationGeometry}
              stimulusPlacements={formData.stimulusPlacements}
              onStimulusPathsChange={syncStimulusPlacementPaths}
              onStimulusPlacementChange={updateStimulusPlacement}
              onFolderPathChange={updateFolderPath}
              onFolderSelected={setExperimentFolder}
              onSelectionChange={setFolderStructureSelection}
              zipRequired
            />
          )}

          {currentStep === 2 && (
            <CreateProjectStep2
              selectedSensors={formData.sensors}
              onToggleSensor={toggleSensor}
              autoDetectedSensors={(formData.uploadedZip?.detected_sensors ?? []).filter(
                (s): s is SensorType => ["EEG", "GSR", "EyeTracker"].includes(s)
              )}
            />
          )}

          {currentStep === 3 && (
            <CreateProjectStep3
              participants={formData.participants}
              onUpdateParticipant={updateParticipant}
            />
          )}

          {currentStep === 4 && (
            <CreateProjectStep4
              scenaries={formData.scenaries}
              onScenaryAoisChange={updateScenaryAois}
            />
          )}

          {/* Mostrar error de guardado */}
          {saveError && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-500">
                <strong>Error:</strong> {saveError}
              </p>
            </div>
          )}

          {saveNotice && !saveError && (
            <div className="mt-4 p-4 bg-muted border border-border rounded-lg">
              <p className="text-sm text-foreground">
                {saveNotice}
              </p>
            </div>
          )}

          {isSaving && !saveError && (
            <ProjectSaveProgress
              zipUploadPercent={zipUploadPercent} zipUploadBytes={zipUploadBytes}
              zipUploadSpeedMbps={zipUploadSpeedMbps} zipUploadEtaSeconds={zipUploadEtaSeconds}
              zipDriveProcessingSeconds={zipDriveProcessingSeconds} isSaveCompleted={isSaveCompleted}
              isZipUploadInProgress={isZipUploadInProgress} cancelZipUpload={cancelZipUpload}
              message={saveProgressMessage || "Guardando proyecto..."}
            />
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex-1">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={isSaving || !!saveError || (isResumedDraft && currentStep === 2)}
                className="gap-2 p-4"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
                onClick={() => void handleCancel()}
              disabled={isSaving && !saveError}
              className="p-4"
            >
              Cancelar
            </Button>

            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={() => void nextStep()}
                disabled={!canGoNext() || isSaving || !!saveError}
                className="gap-2 p-4"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={saveProject}
                className="gap-2 p-4"
                disabled={isSaving || !!saveError}
              >
                <Check className="w-4 h-4" />
                {isSaving ? "Guardando..." : "Guardar proyecto"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
