"use client"

import { useEffect, useRef, useState } from "react"
import { Pencil, ChevronLeft, ChevronRight, Check, CheckCircle2 } from "lucide-react"
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

const ZIP_PROCESSING_AVG_KEY = "neurodatics_zip_processing_avg_seconds"

const getStoredProcessingAverageSeconds = (): number | null => {
  try {
    const raw = window.localStorage.getItem(ZIP_PROCESSING_AVG_KEY)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

const persistProcessingAverageSeconds = (nextSeconds: number) => {
  try {
    const prev = getStoredProcessingAverageSeconds()
    const blended = prev ? Math.round(prev * 0.7 + nextSeconds * 0.3) : Math.round(nextSeconds)
    window.localStorage.setItem(ZIP_PROCESSING_AVG_KEY, String(Math.max(1, blended)))
  } catch {
    // Ignore persistence errors.
  }
}

const estimateProcessingSeconds = (totalBytes: number): number => {
  const mb = totalBytes / (1024 * 1024)
  const heuristic = Math.max(20, Math.round(mb * 0.9))
  const storedAvg = getStoredProcessingAverageSeconds()
  if (!storedAvg) return heuristic
  return Math.max(10, Math.round(storedAvg * 0.7 + heuristic * 0.3))
}

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

const toFriendlyErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : ""
  if (!raw) return "No se pudo guardar la edición del proyecto."

  // Handle payloads like: API 400: {"detail":"..."}
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
        return parsed.detail
      }
    } catch {
      // Fall through to prefix cleanup below.
    }
  }

  return raw
    .replace(/^API\s*\d+\s*:\s*/i, "")
    .replace(/^Error subiendo archivo:\s*/i, "")
    .trim()
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

const getCurrentZipFilename = (project: ApiProjectDetail): string => {
  const files = project.files || []
  const zipFiles = files.filter((file) => file.kind === "experiment_zip")
  if (zipFiles.length === 0) return ""

  const latestZip = zipFiles.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA
  })[0]

  return latestZip?.filename || ""
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
  const [isSaveCompleted, setIsSaveCompleted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveProgressMessage, setSaveProgressMessage] = useState<string | null>(null)
  const [zipUploadPercent, setZipUploadPercent] = useState<number | null>(null)
  const [zipUploadBytes, setZipUploadBytes] = useState<{ loaded: number; total: number } | null>(null)
  const [zipUploadSpeedMbps, setZipUploadSpeedMbps] = useState<number | null>(null)
  const [zipUploadEtaSeconds, setZipUploadEtaSeconds] = useState<number | null>(null)
  const [zipDriveProcessingSeconds, setZipDriveProcessingSeconds] = useState<number | null>(null)
  const uploadStartedAtRef = useRef<number | null>(null)
  const processingEstimateSecondsRef = useRef<number>(0)
  const [shouldUpdateZip, setShouldUpdateZip] = useState(false)
  const originalFormDataRef = useRef<ProjectFormData | null>(null)

  const formatBytesToMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  const formatEta = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.round(seconds))
    const minutes = Math.floor(safeSeconds / 60)
    const secs = safeSeconds % 60
    return `${minutes}:${String(secs).padStart(2, "0")}`
  }
  const isDriveProcessing = zipDriveProcessingSeconds !== null

  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    description: "",
    status: "draft",
    experimentZip: null,
    folderPath: "",
    uploadedZip: null,
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

      const newFormData = {
        projectName: detail.name || "",
        description: detail.description || "",
        status: toProjectStatus(detail.status),
        experimentZip: null,
        folderPath: getCurrentZipFilename(detail),
        uploadedZip: null,
        sensors: ((detail.sensors || []).map((s) => s.sensor_type) as SensorType[]) || [],
        participants: participants.length > 0 ? participants : defaultParticipants,
        scenaries: parseScenaries(detail),
      }

      setFormData(newFormData)
      originalFormDataRef.current = JSON.parse(JSON.stringify(newFormData))
    } catch (error) {
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

  const sensorsChanged = (): boolean => {
    if (!originalFormDataRef.current) return true
    const orig = originalFormDataRef.current.sensors
    const current = formData.sensors
    if (orig.length !== current.length) return true
    return !orig.every((s) => current.includes(s))
  }

  const participantsChanged = (): boolean => {
    if (!originalFormDataRef.current) return true
    const orig = originalFormDataRef.current.participants
    const current = formData.participants
    if (orig.length !== current.length) return true
    return !orig.every((op, i) => {
      const cp = current[i]
      return op.id === cp.id && op.age === cp.age && op.sex === cp.sex
    })
  }

  const saveProjectChanges = async () => {
    if (!hasValidParticipants()) {
      setSaveError("Completa sexo y edad de todos los participantes antes de guardar.")
      return
    }

    setIsSaving(true)
    setIsSaveCompleted(false)
    setSaveError(null)

    const updateProgress = (message: string) => {
      setSaveProgressMessage(message)
    }

    try {
      updateProgress("Actualizando datos generales del proyecto...")
      const updatedMetadata = await ProjectsApi.update(projectId, {
        name: formData.projectName,
        description: formData.description.trim() || "",
        status: formData.status,
      })

      if (formData.experimentZip) {
        // Backend replaces previous Drive content (old ZIP + assets) with the new upload.
        setZipUploadPercent(0)
        setZipUploadBytes({ loaded: 0, total: formData.experimentZip.size })
        setZipUploadSpeedMbps(null)
        setZipUploadEtaSeconds(null)
        setZipDriveProcessingSeconds(null)
        processingEstimateSecondsRef.current = estimateProcessingSeconds(formData.experimentZip.size)
        uploadStartedAtRef.current = Date.now()
        updateProgress("Subiendo nuevo ZIP... 0%")
        await ProjectsApi.uploadZipWithProgress(projectId, formData.experimentZip, (progress) => {
          if (progress.phase === "uploading") {
            const now = Date.now()
            const startedAt = uploadStartedAtRef.current ?? now
            const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000)
            const bytesPerSecond = progress.loaded / elapsedSeconds
            const speedMbps = bytesPerSecond / (1024 * 1024)
            const remainingBytes = Math.max(0, progress.total - progress.loaded)
            const etaSeconds = bytesPerSecond > 0 ? remainingBytes / bytesPerSecond : 0
            const pipelinePercent = Math.min(89, Math.round(progress.percent * 0.89))
            const pipelineEtaSeconds = Math.max(0, Math.round(etaSeconds + processingEstimateSecondsRef.current))

            setZipUploadPercent(pipelinePercent)
            setZipUploadBytes({ loaded: progress.loaded, total: progress.total })
            setZipUploadSpeedMbps(Number.isFinite(speedMbps) ? speedMbps : null)
            setZipUploadEtaSeconds(Number.isFinite(pipelineEtaSeconds) ? pipelineEtaSeconds : null)
            setZipDriveProcessingSeconds(null)
            updateProgress(`Subiendo nuevo ZIP... ${pipelinePercent}%`)
            return
          }

          if (progress.phase === "processing") {
            const elapsed = progress.processingElapsedSeconds ?? 0
            const processingRemaining = Math.max(0, processingEstimateSecondsRef.current - elapsed)
            const processingProgress = processingEstimateSecondsRef.current > 0
              ? Math.min(10, Math.round((elapsed / processingEstimateSecondsRef.current) * 10))
              : 0
            const pipelinePercent = Math.min(99, 89 + processingProgress)
            const exceededEstimate = elapsed > processingEstimateSecondsRef.current + 5;

            setZipUploadPercent(pipelinePercent);
            setZipUploadSpeedMbps(null);
            setZipUploadEtaSeconds(exceededEstimate ? null : Math.round(processingRemaining));
            setZipDriveProcessingSeconds(elapsed)
            updateProgress(`Sincronizando archivos en Google Drive... ${pipelinePercent}%`)
            return
          }

          if (progress.phase === "completed") {
            setZipUploadPercent(100)
            setZipUploadSpeedMbps(null)
            setZipUploadEtaSeconds(0)
            setZipDriveProcessingSeconds(progress.processingElapsedSeconds ?? 0)
            if ((progress.processingElapsedSeconds ?? 0) > 0) {
              persistProcessingAverageSeconds(progress.processingElapsedSeconds ?? 0)
            }
          }
        })
        setZipUploadPercent(100)
        setZipUploadBytes((prev) => {
          const total = prev?.total ?? formData.experimentZip?.size ?? 0
          return { loaded: total, total }
        })
        setZipUploadEtaSeconds(0)
        updateProgress("ZIP y sincronizacion en Google Drive completados.")
      }

      // Clear upload-specific indicators before moving to non-upload stages.
      setZipUploadPercent(null)
      setZipUploadBytes(null)
      setZipUploadSpeedMbps(null)
      setZipUploadEtaSeconds(null)
      setZipDriveProcessingSeconds(null)

      // Only update sensors and/or participants if they actually changed.
      const shouldUpdateSensors = sensorsChanged()
      const shouldUpdateParticipants = participantsChanged()

      if (shouldUpdateSensors || shouldUpdateParticipants) {
        updateProgress("Actualizando datos adicionales del proyecto...")
        const updates: Promise<void>[] = []

        if (shouldUpdateSensors) {
          updates.push(ProjectsApi.setSensors(projectId, formData.sensors as string[]))
        }
        if (shouldUpdateParticipants) {
          updates.push(ProjectsApi.setParticipants(projectId, normalizeParticipants()))
        }

        await Promise.all(updates)
      }

      updateProgress("Finalizando actualización del proyecto...")

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

      setIsSaveCompleted(true)
      setSaveProgressMessage("Proceso completado. Cerrando...")
      toast.success(`Proyecto "${formData.projectName}" editado correctamente.`)
      await new Promise((resolve) => setTimeout(resolve, 900))
      setIsOpen(false)
      setCurrentStep(1)
    } catch (error) {
      const friendlyMessage = toFriendlyErrorMessage(error)
      setSaveError(friendlyMessage)
      toast.error("No se pudo guardar la edición del proyecto.")
    } finally {
      setIsSaving(false)
      setIsSaveCompleted(false)
      setSaveProgressMessage(null)
      setZipUploadPercent(null)
      setZipUploadBytes(null)
      setZipUploadSpeedMbps(null)
      setZipUploadEtaSeconds(null)
      setZipDriveProcessingSeconds(null)
      uploadStartedAtRef.current = null
      processingEstimateSecondsRef.current = 0
    }
  }

  const resetDialogState = () => {
    setCurrentStep(1)
    setSaveError(null)
    setIsSaveCompleted(false)
    setSaveProgressMessage(null)
    setZipUploadPercent(null)
    setZipUploadBytes(null)
    setZipUploadSpeedMbps(null)
    setZipUploadEtaSeconds(null)
    setZipDriveProcessingSeconds(null)
    uploadStartedAtRef.current = null
    processingEstimateSecondsRef.current = 0
  }

  const handleCancel = () => {
    resetDialogState()
    setIsOpen(false)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          resetDialogState()
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
                folderPath={formData.folderPath}
                onProjectNameChange={updateProjectName}
                onDescriptionChange={updateDescription}
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

            {isSaving && (
              <div
                className={`mt-4 p-4 border rounded-lg ${
                  isDriveProcessing ? "bg-gray-100 border-gray-300" : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3 text-sm text-gray-800">
                  {isSaveCompleted ? (
                    <CheckCircle2 className="h-4 w-4 text-gray-700" />
                  ) : (
                    <div className="h-4 w-4 border-2 border-gray-400 border-t-black rounded-full animate-spin" />
                  )}
                  <span>{saveProgressMessage || "Guardando cambios del proyecto..."}</span>
                </div>
                {zipUploadPercent !== null && (
                  <div className="mt-3">
                    <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-150 ${
                          isDriveProcessing ? "bg-gray-700 animate-pulse" : "bg-black"
                        }`}
                        style={{ width: `${zipUploadPercent}%` }}
                      />
                    </div>
                      <p className="mt-1 text-xs text-gray-700">
                        Progreso total del proceso: {zipUploadPercent}%
                        {zipUploadBytes && zipUploadBytes.total > 0 && (
                          <span>
                            {" "}
                            ({formatBytesToMB(zipUploadBytes.loaded)} / {formatBytesToMB(zipUploadBytes.total)})
                          </span>
                        )}
                      </p>
                    <p className="mt-1 text-xs text-gray-700">
                        Velocidad: {zipUploadSpeedMbps !== null ? `${zipUploadSpeedMbps.toFixed(2)} MB/s` : "calculando..."}
                        {zipUploadEtaSeconds !== null ? (
                        <span>{" "}| Restante estimado: {formatEta(zipUploadEtaSeconds)}</span>
                        ) : isDriveProcessing ? (
                        <span>{" "}| Tiempo variable, procesando...</span>
                        ) : null}
                      </p>
                      {zipDriveProcessingSeconds !== null && (
                      <p className="mt-1 text-xs text-gray-700">
                          Procesando en Google Drive: {formatEta(zipDriveProcessingSeconds)} transcurridos
                        </p>
                      )}
                  </div>
                )}
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
                disabled={isSaving || isLoading || !!saveError}
                className="gap-2 p-4"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving} className="p-4">
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
              <Button
                type="button"
                onClick={saveProjectChanges}
                className="gap-2 p-4"
                disabled={isSaving || isLoading || !!saveError}
              >
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
