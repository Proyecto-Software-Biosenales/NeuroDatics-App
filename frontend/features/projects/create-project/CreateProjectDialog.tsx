"use client"

import { ChevronLeft, ChevronRight, Check, CheckCircle2, Cloud, Gauge, Clock3, HardDrive } from "lucide-react"
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
    updateFolderPath,
    toggleSensor,
    updateParticipant,
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

  const formatBytesToMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  const formatEta = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.round(seconds))
    const minutes = Math.floor(safeSeconds / 60)
    const secs = safeSeconds % 60
    return `${minutes}:${String(secs).padStart(2, "0")}`
  }
  const isDriveSyncInProgress = zipUploadPercent !== null && zipUploadPercent < 100
  const isDriveSyncFinalizing = zipUploadPercent !== null && zipUploadPercent >= 99 && zipUploadPercent < 100

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
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-8"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
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

        <div className="py-6">
          {currentStep === 1 && (
            <CreateProjectStep1
              projectName={formData.projectName}
              description={formData.description}
              folderPath={formData.folderPath}
              uploadedZip={formData.uploadedZip}
              onProjectNameChange={updateProjectName}
              onDescriptionChange={updateDescription}
              onFolderPathChange={updateFolderPath}
              onFolderSelected={setExperimentFolder}
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
            <CreateProjectStep4 scenaries={formData.scenaries} />
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
            <div className="mt-4 p-5 bg-muted border border-border rounded-2xl">
              {zipUploadPercent !== null ? (
                <>
                  {/* Header with title and percentage */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl border border-border bg-card flex items-center justify-center">
                        <Cloud className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-2sm font-semibold text-foreground">
                          {isDriveSyncFinalizing
                            ? "Finalizando sincronización con Google Drive"
                            : isDriveSyncInProgress
                            ? "Sincronizando con Google Drive"
                            : "Sincronización completada"}
                        </p>
                        <p className="text-sm text-muted-foreground">{zipUploadPercent}% completado</p>
                      </div>
                    </div>
                    <span className="text-xl font-bold text-foreground">{zipUploadPercent}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full transition-all duration-150 ${
                          isDriveSyncInProgress ? "bg-foreground/70 animate-pulse" : "bg-foreground"
                        }`}
                        style={{ width: `${zipUploadPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Data info grid */}
                  {zipUploadBytes && zipUploadBytes.total > 0 && (
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm text-foreground">
                      <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-muted-foreground" />
                          <p>{formatBytesToMB(zipUploadBytes.total)}</p>
                      </div>
                      <div className="text-right font-medium text-foreground">
                        {formatBytesToMB(zipUploadBytes.loaded)} transferidos
                      </div>
                    </div>
                  )}

                  {/* Metrics row */}
                  <div className="grid grid-cols-3 gap-4 text-sm bg-card p-3 rounded-lg border border-border">
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border flex items-center justify-center mt-0.5">
                        <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">VELOCIDAD</p>
                        <p className="font-semibold text-foreground">
                          {zipUploadSpeedMbps !== null ? `${zipUploadSpeedMbps.toFixed(1)} MB/s` : "calculando..."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border flex items-center justify-center mt-0.5">
                        <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">RESTANTE</p>
                        <p className="font-semibold text-foreground">
                          {zipUploadEtaSeconds !== null ? formatEta(zipUploadEtaSeconds) : isDriveSyncInProgress ? "--" : "0:00"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="h-6 w-6 rounded-lg border border-border flex items-center justify-center mt-0.5">
                        <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs mb-1">TRANSCURRIDO</p>
                        <p className="font-semibold text-foreground">
                          {zipDriveProcessingSeconds !== null ? formatEta(zipDriveProcessingSeconds) : "0:00"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-muted-foreground text-sm">
                    <div className="flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
                        style={{ animationDelay: "0ms", animationDuration: "900ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
                        style={{ animationDelay: "180ms", animationDuration: "900ms" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse"
                        style={{ animationDelay: "360ms", animationDuration: "900ms" }}
                      />
                      <span className="ml-2">Procesando en Google Drive...</span>
                    </div>
                    <button
                      type="button"
                      onClick={cancelZipUpload}
                      disabled={!isZipUploadInProgress}
                      className="hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 text-sm text-foreground">
                  {isSaveCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-foreground" />
                  ) : (
                    <div className="h-4 w-4 border-2 border-muted-foreground border-t-foreground rounded-full animate-spin" />
                  )}
                  <span>{saveProgressMessage || "Guardando proyecto..."}</span>
                </div>
              )}
            </div>
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
