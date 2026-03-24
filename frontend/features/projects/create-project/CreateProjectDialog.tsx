"use client"

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
import type { ReactNode } from "react"
import type { Project } from "@/features/projects/types"

interface CreateProjectDialogProps {
  trigger: ReactNode
  onProjectCreated?: (project: Project) => void
}

export const CreateProjectDialog = ({
  trigger,
  onProjectCreated,
}: CreateProjectDialogProps) => {
  const {
    currentStep,
    formData,
    isOpen,
    setIsOpen,
    updateProjectName,
    updateDescription,
    updateStatus,
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
    setExperimentZip,
  } = useCreateProjectWizard(onProjectCreated)

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) reset()
  }
  

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            Crear nuevo proyecto
          </DialogTitle>
          <DialogDescription asChild>
            <div>
              <span className="text-sm text-gray-600">
                Paso {currentStep} de 4
              </span>

              <div className="flex gap-2 mt-4">
                {[1, 2, 3, 4].map((step) => (
                  <Progress
                    key={step}
                    value={currentStep >= step ? 100 : 0}
                    className={currentStep >= step ? "" : "bg-gray-200"}
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
              status={formData.status}
              folderPath={formData.folderPath}
              uploadedZip={formData.uploadedZip}
              onProjectNameChange={updateProjectName}
              onDescriptionChange={updateDescription}
              onStatusChange={updateStatus}
              onFolderPathChange={updateFolderPath}
              onZipSelected={setExperimentZip}
              zipRequired
            />
          )}

          {currentStep === 2 && (
            <CreateProjectStep2
              selectedSensors={formData.sensors}
              onToggleSensor={toggleSensor}
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
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">
                <strong>Error:</strong> {saveError}
              </p>
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
                disabled={isSaving}
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
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
              className="p-4"
            >
              Cancelar
            </Button>

            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={nextStep}
                disabled={!canGoNext() || isSaving}
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
                disabled={isSaving}
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
