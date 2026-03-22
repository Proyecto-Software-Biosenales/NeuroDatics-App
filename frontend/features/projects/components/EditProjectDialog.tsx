"use client"

import { useEffect, useState } from "react"
import { Pencil, ChevronLeft, ChevronRight, Check } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { CreateProjectStep1 } from "@/features/projects/create-project/CreateProjectStep1"
import { CreateProjectStep2 } from "@/features/projects/create-project/CreateProjectStep2"
import { CreateProjectStep3 } from "@/features/projects/create-project/CreateProjectStep3"
import { CreateProjectStep4 } from "@/features/projects/create-project/CreateProjectStep4"
import { ProjectsApi, type ApiProjectDetail } from "@/features/projects/api/projectsApi"
import type { Project, ProjectStatus, SensorType } from "@/features/projects/types"
import type { ParticipantData, ProjectFormData, scenaries } from "@/features/projects/create-project/types"

interface EditProjectDialogProps {
  projectId: string
  projectName: string
  onProjectUpdated: (project: Project) => void
}

const defaultParticipants: ParticipantData[] = [
  { id: "1000557085", sex: null, age: "" },
  { id: "1000187293", sex: null, age: "" },
  { id: "1023675443", sex: null, age: "" },
]

const defaultScenaries: scenaries[] = [
  { id: "1", name: "San Jeronimo", aois: [] },
  { id: "2", name: "Yom Yom", aois: [] },
  { id: "3", name: "Crem Helado", aois: [] },
]

const toProjectStatus = (value: unknown): ProjectStatus => {
  if (value === "active" || value === "archived") return value
  return "draft"
}

const toParticipantSex = (value: unknown): "male" | "female" | "other" | null => {
  if (value === "male" || value === "female" || value === "other") return value
  if (value === "MALE") return "male"
  if (value === "FEMALE") return "female"
  if (value === "OTHER") return "other"
  return null
}

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  return fallback
}

const parseScenaries = (project: ApiProjectDetail): scenaries[] => {
  const source = project.scenaries || []
  return source.map((s) => ({
    id: s.id,
    name: s.name,
    aois: (s.aois || []).map((a) => {
      const shape = a.shape || {}
      return {
        id: a.id,
        name: a.name,
        x: toNumber((shape as Record<string, unknown>).x, 0),
        y: toNumber((shape as Record<string, unknown>).y, 0),
        width: toNumber((shape as Record<string, unknown>).width, 20),
        height: toNumber((shape as Record<string, unknown>).height, 20),
      }
    }),
  }))
}

export const EditProjectDialog = ({
  projectId,
  projectName,
  onProjectUpdated,
}: EditProjectDialogProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [shouldUpdateZip, setShouldUpdateZip] = useState(false)

  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    description: "",
    status: "draft",
    experimentZip: null,
    folderPath: "",
    sensors: [],
    participants: defaultParticipants,
    scenaries: defaultScenaries,
  })

  const loadProject = async () => {
    setIsLoading(true)
    setSaveError(null)
    try {
      const detail = await ProjectsApi.get(projectId)

      const participants: ParticipantData[] = (detail.participants || []).map((p) => ({
        id: p.participant_code,
        age: p.age != null ? String(p.age) : "",
        sex: toParticipantSex(p.sex),
      }))

      setFormData({
        projectName: detail.name || "",
        description: detail.description || "",
        status: toProjectStatus(detail.status),
        experimentZip: null,
        folderPath: "",
        sensors: ((detail.sensors || []).map((s) => s.sensor_type) as SensorType[]) || [],
        participants: participants.length > 0 ? participants : defaultParticipants,
        scenaries: parseScenaries(detail),
      })
    } catch (error) {
      console.error(error)
      setSaveError("No se pudo cargar la información del proyecto para editar.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    void loadProject()
    setShouldUpdateZip(false)
  }, [isOpen])

  const updateProjectName = (name: string) => setFormData((prev) => ({ ...prev, projectName: name }))
  const updateDescription = (description: string) => setFormData((prev) => ({ ...prev, description }))
  const updateStatus = (status: ProjectStatus) => setFormData((prev) => ({ ...prev, status }))
  const updateFolderPath = (path: string) => setFormData((prev) => ({ ...prev, folderPath: path }))
  const setExperimentZip = (file: File | null) => {
    setFormData((prev) => ({
      ...prev,
      experimentZip: file,
      folderPath: file ? file.name : "",
    }))
  }

  const toggleSensor = (sensor: SensorType) => {
    setFormData((prev) => ({
      ...prev,
      sensors: prev.sensors.includes(sensor)
        ? prev.sensors.filter((s) => s !== sensor)
        : [...prev.sensors, sensor],
    }))
  }

  const updateParticipant = (id: string, field: "sex" | "age", value: string) => {
    setFormData((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === id ? { ...p, [field]: value } : p
      ),
    }))
  }

  const hasValidParticipants = () => {
    if (formData.participants.length === 0) return false
    return formData.participants.every((p) => {
      const hasId = p.id.trim() !== ""
      const hasValidSex = p.sex === "male" || p.sex === "female" || p.sex === "other"
      const ageNum = Number(p.age)
      const hasValidAge = p.age.trim() !== "" && Number.isFinite(ageNum) && ageNum > 0
      return hasId && hasValidSex && hasValidAge
    })
  }

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return formData.projectName.trim() !== ""
      case 2:
        return formData.sensors.length > 0
      case 3:
        return hasValidParticipants()
      default:
        return true
    }
  }

  const normalizeParticipants = () =>
    formData.participants.map((p) => ({
      participant_code: p.id,
      age: p.age && !isNaN(Number(p.age)) ? Number(p.age) : null,
      sex: p.sex,
    }))

  const saveProjectChanges = async () => {
    if (!hasValidParticipants()) {
      setSaveError("Completa sexo y edad de todos los participantes antes de guardar.")
      return
    }

    setIsSaving(true)
    setSaveError(null)
    const loadingToastId = toast.loading("Guardando cambios del proyecto...")

    try {
      const updatedMetadata = await ProjectsApi.update(projectId, {
        name: formData.projectName,
        description: formData.description.trim() || "",
        status: formData.status,
      })

      if (formData.experimentZip) {
        // Delete old ZIP file if it exists, then upload new one
        try {
          await ProjectsApi.deleteZip(projectId)
        } catch (error) {
          // Ignore if file doesn't exist
        }
        await ProjectsApi.uploadZip(projectId, formData.experimentZip)
      }

      await ProjectsApi.setSensors(projectId, formData.sensors as string[])
      await ProjectsApi.setParticipants(projectId, normalizeParticipants())

      if (formData.scenaries.length > 0) {
        await ProjectsApi.setScenaries(
          projectId,
          formData.scenaries.map((s) => ({
            name: s.name,
            type: "image",
            file_id: null,
            width: null,
            height: null,
          }))
        )

        const aoisPayload = formData.scenaries.flatMap((s) =>
          (s.aois || []).map((a) => ({
            scenaries_name: s.name,
            name: a.name,
            color: "#3b82f6",
            shape_type: "rect",
            shape: {
              x: a.x,
              y: a.y,
              width: a.width,
              height: a.height,
            },
          }))
        )

        if (aoisPayload.length > 0) {
          await ProjectsApi.setAois(projectId, aoisPayload)
        }
      }

      onProjectUpdated({
        id: projectId,
        name: updatedMetadata.name,
        description: updatedMetadata.description || formData.description,
        status: toProjectStatus(updatedMetadata.status),
        createdAt: updatedMetadata.created_at
          ? new Date(updatedMetadata.created_at).toLocaleDateString("es-ES")
          : "",
        sensors: formData.sensors,
        participants: formData.participants.length,
      })

      toast.success(`Proyecto "${formData.projectName}" editado correctamente.`, {
        id: loadingToastId,
      })
      setIsOpen(false)
      setCurrentStep(1)
    } catch (error) {
      console.error(error)
      setSaveError("No se pudo guardar la edición del proyecto.")
      toast.error("No se pudo guardar la edición del proyecto.", {
        id: loadingToastId,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          setCurrentStep(1)
          setSaveError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => e.stopPropagation()}
          className="absolute top-4 right-14 h-8 w-8 opacity-0 transition-all duration-200 group-hover:opacity-100 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          aria-label={`Editar proyecto ${projectName}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-3xl max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Editar proyecto</DialogTitle>
          <DialogDescription asChild>
            <div>
              <span className="text-sm text-gray-600">Paso {currentStep} de 4</span>
              <div className="flex gap-2 mt-4">
                {[1, 2, 3, 4].map((step) => (
                  <Progress key={step} value={currentStep >= step ? 100 : 0} className={currentStep >= step ? "" : "bg-gray-200"} />
                ))}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 text-center text-gray-600">Cargando datos del proyecto...</div>
        ) : (
          <div className="py-6">
            {currentStep === 1 && (
              <CreateProjectStep1
                projectName={formData.projectName}
                description={formData.description}
                status={formData.status}
                folderPath={formData.folderPath}
                onProjectNameChange={updateProjectName}
                onDescriptionChange={updateDescription}
                onStatusChange={updateStatus}
                onFolderPathChange={updateFolderPath}
                onZipSelected={setExperimentZip}
                zipRequired={false}
                isEditMode={true}
                shouldUpdateZip={shouldUpdateZip}
                onShouldUpdateZipChange={setShouldUpdateZip}
              />
            )}

            {currentStep === 2 && (
              <CreateProjectStep2 selectedSensors={formData.sensors} onToggleSensor={toggleSensor} />
            )}

            {currentStep === 3 && (
              <CreateProjectStep3 participants={formData.participants} onUpdateParticipant={updateParticipant} />
            )}

            {currentStep === 4 && <CreateProjectStep4 scenaries={formData.scenaries} />}

            {saveError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">
                  <strong>Error:</strong> {saveError}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div className="flex-1">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep((prev) => prev - 1)}
                disabled={isSaving || isLoading}
                className="gap-2 p-4"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSaving} className="p-4">
              Cancelar
            </Button>

            {currentStep < 4 ? (
              <Button
                type="button"
                onClick={() => setCurrentStep((prev) => prev + 1)}
                disabled={!canGoNext() || isSaving || isLoading}
                className="gap-2 p-4"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button type="button" onClick={saveProjectChanges} className="gap-2 p-4" disabled={isSaving || isLoading}>
                <Check className="w-4 h-4" />
                {isSaving ? "Guardando..." : "Guardar cambios"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
