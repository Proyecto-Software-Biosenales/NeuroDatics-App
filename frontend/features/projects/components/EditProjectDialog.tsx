"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Check, CheckCircle2, Cloud, Gauge, Clock3, HardDrive } from "lucide-react"
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
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
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

const extractProjectNameAndId = (fullName: string): { name: string; id: string } => {
  const normalized = fullName.trim()
  if (!normalized) {
    return { name: fullName, id: "" }
  }

  // Handles names like: "Proyecto-9ac9ef2b-20260324225557"
  const shortIdWithTimestampMatch = normalized.match(/^(.*)-([a-fA-F0-9]{8}-\d{14})$/)
  if (shortIdWithTimestampMatch) {
    return {
      name: shortIdWithTimestampMatch[1],
      id: shortIdWithTimestampMatch[2],
    }
  }

  // Handles names like: "Proyecto-550e8400-e29b-41d4-a716-446655440000"
  const uuidMatch = normalized.match(
    /^(.*)-([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/
  )
  if (uuidMatch) {
    return {
      name: uuidMatch[1],
      id: uuidMatch[2],
    }
  }

  // Fallback for legacy IDs appended after the last dash.
  const lastDashIndex = normalized.lastIndexOf("-")
  if (lastDashIndex === -1) {
    return { name: fullName, id: "" }
  }

  const name = normalized.substring(0, lastDashIndex)
  const id = normalized.substring(lastDashIndex + 1)
  if (/^[a-fA-F0-9\-]{8,}$/.test(id)) {
    return { name, id }
  }

  return { name: fullName, id: "" }
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

const isGoogleSessionExpiredError = (message: string): boolean => {
  return /google drive|oauth|invalid_grant|refresh token|token has expired|no se pudo configurar google drive/i.test(message)
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
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: EditProjectDialogProps) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = controlledIsOpen ?? internalIsOpen
  const setIsOpen = (value: boolean) => {
    if (controlledOnOpenChange) {
      controlledOnOpenChange(value)
    } else {
      setInternalIsOpen(value)
    }
  }
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaveCompleted, setIsSaveCompleted] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [saveProgressMessage, setSaveProgressMessage] = useState<string | null>(null)
  const [zipUploadPercent, setZipUploadPercent] = useState<number | null>(null)
  const [zipUploadBytes, setZipUploadBytes] = useState<{ loaded: number; total: number } | null>(null)
  const [zipUploadSpeedMbps, setZipUploadSpeedMbps] = useState<number | null>(null)
  const [zipUploadEtaSeconds, setZipUploadEtaSeconds] = useState<number | null>(null)
  const [zipDriveProcessingSeconds, setZipDriveProcessingSeconds] = useState<number | null>(null)
  const [isZipUploadInProgress, setIsZipUploadInProgress] = useState(false)
  const uploadAbortControllerRef = useRef<AbortController | null>(null)
  const activeZipUploadProjectIdRef = useRef<string | null>(null)
  const [shouldUpdateZip, setShouldUpdateZip] = useState(false)
  const originalFormDataRef = useRef<ProjectFormData | null>(null)
  const originalCreatedAtRef = useRef<string>("")
  const projectNameIdSuffixRef = useRef<string>("")

  const formatBytesToMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  const formatEta = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.round(seconds))
    const minutes = Math.floor(safeSeconds / 60)
    const secs = safeSeconds % 60
    return `${minutes}:${String(secs).padStart(2, "0")}`
  }
  const isDriveSyncInProgress = zipUploadPercent !== null && zipUploadPercent < 100
  const isDriveSyncFinalizing = zipUploadPercent !== null && zipUploadPercent >= 99 && zipUploadPercent < 100

  const cancelZipUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort()
    }
    if (activeZipUploadProjectIdRef.current) {
      void ProjectsApi.cancelZipUpload(activeZipUploadProjectIdRef.current).catch((error: unknown) => {
        console.warn("[EditProjectDialog] backend cancel request failed", error)
      })
    }
    setSaveProgressMessage("Cancelando subida a Google Drive...")
  }

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

      // Extract name and ID suffix
      const { name: extractedName, id: idSuffix } = extractProjectNameAndId(detail.name || "")
      projectNameIdSuffixRef.current = idSuffix

      const participants: ParticipantData[] = (detail.participants || []).map((p) => ({
        id: p.participant_code,
        age: p.age != null ? String(p.age) : "",
        sex: toParticipantSex(p.sex),
      }))

      const newFormData = {
        projectName: extractedName,
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
      originalCreatedAtRef.current = detail.created_at
        ? new Date(detail.created_at).toLocaleDateString("es-ES")
        : ""
    } catch (error) {
      console.error("[EditProjectDialog] loadProject failed", { projectId, error })
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

  const metadataChanged = (): boolean => {
    if (!originalFormDataRef.current) return true
    const orig = originalFormDataRef.current
    return (
      orig.projectName.trim() !== formData.projectName.trim() ||
      (orig.description || "").trim() !== (formData.description || "").trim() ||
      orig.status !== formData.status
    )
  }

  const hasAnyChanges = (): boolean => {
    const shouldUpdateMetadata = metadataChanged()
    const shouldUpdateSensors = sensorsChanged()
    const shouldUpdateParticipants = participantsChanged()
    const shouldUploadZip = Boolean(formData.experimentZip)
    return shouldUpdateMetadata || shouldUpdateSensors || shouldUpdateParticipants || shouldUploadZip
  }

  const saveProjectChanges = async () => {
    if (!hasValidParticipants()) {
      setSaveError("Completa sexo y edad de todos los participantes antes de guardar.")
      return
    }

    setIsSaving(true)
    setIsSaveCompleted(false)
    setSaveError(null)
    setSaveNotice(null)

    const updateProgress = (message: string) => {
      setSaveProgressMessage(message)
    }

    try {
      const shouldUpdateMetadata = metadataChanged()
      const shouldUpdateSensors = sensorsChanged()
      const shouldUpdateParticipants = participantsChanged()
      const shouldUploadZip = Boolean(formData.experimentZip)

      if (!hasAnyChanges()) {
        toast.success("No hay cambios por guardar.")
        setIsOpen(false)
        setCurrentStep(1)
        return
      }

      let updatedMetadata: {
        name: string
        description?: string | null
        status?: string
        created_at?: string
        updated_at?: string
      } = {
        name: formData.projectName,
        description: formData.description,
        status: formData.status,
      }

      if (shouldUpdateMetadata) {
        updateProgress("Actualizando datos generales del proyecto...")

        updatedMetadata = await ProjectsApi.update(projectId, {
          name: formData.projectName.trim(),
          description: formData.description.trim() || "",
          status: formData.status,
        })
      }

      const zipToUpload = formData.experimentZip
      if (shouldUploadZip && zipToUpload) {
        // Backend replaces previous Drive content (old ZIP + assets) with the new upload.
        setZipUploadPercent(null)
        setZipUploadBytes(null)
        setZipUploadSpeedMbps(null)
        setZipUploadEtaSeconds(null)
        setZipDriveProcessingSeconds(null)
        updateProgress("Enviando nuevo ZIP al backend...")
        setIsZipUploadInProgress(true)

        const uploadAbortController = new AbortController()
        uploadAbortControllerRef.current = uploadAbortController
        activeZipUploadProjectIdRef.current = projectId

        let driveProgressPollTimer: ReturnType<typeof setInterval> | null = null
        let lastDriveSampleAt: number | null = null
        let lastDriveUploadedBytes: number | null = null

        const clearDriveProgressPolling = () => {
          if (driveProgressPollTimer) {
            clearInterval(driveProgressPollTimer)
            driveProgressPollTimer = null
          }
        }

        const pollDriveProgress = async () => {
          const snapshot = await ProjectsApi.getZipUploadProgress(projectId)
          const totalBytes = Math.max(0, snapshot.total_bytes || 0)
          const uploadedBytes = Math.max(0, snapshot.uploaded_bytes || 0)

          if (totalBytes <= 0 && snapshot.phase !== "completed" && snapshot.phase !== "failed") {
            updateProgress("Preparando sincronización en Google Drive...")
            return
          }

          const percent = Math.max(
            0,
            Math.min(
              100,
              Number.isFinite(snapshot.percent)
                ? snapshot.percent
                : totalBytes > 0
                  ? Math.round((uploadedBytes / totalBytes) * 100)
                  : 0
            )
          )

          const now = Date.now()
          let speedMbps = snapshot.speed_mbps ?? null
          if ((speedMbps === null || !Number.isFinite(speedMbps)) && lastDriveSampleAt !== null && lastDriveUploadedBytes !== null) {
            const deltaSeconds = Math.max(0.001, (now - lastDriveSampleAt) / 1000)
            const deltaBytes = Math.max(0, uploadedBytes - lastDriveUploadedBytes)
            const sampledSpeed = deltaBytes / deltaSeconds / (1024 * 1024)
            speedMbps = Number.isFinite(sampledSpeed) && sampledSpeed > 0 ? sampledSpeed : null
          }

          const speedBytesPerSecond = speedMbps !== null ? speedMbps * 1024 * 1024 : null
          const etaSeconds = snapshot.eta_seconds ?? (
            speedBytesPerSecond && speedBytesPerSecond > 0
              ? Math.max(0, Math.round((totalBytes - uploadedBytes) / speedBytesPerSecond))
              : null
          )

          lastDriveSampleAt = now
          lastDriveUploadedBytes = uploadedBytes

          setZipUploadPercent(percent)
          setZipUploadBytes({ loaded: uploadedBytes, total: totalBytes })
          setZipUploadSpeedMbps(speedMbps !== null && Number.isFinite(speedMbps) ? speedMbps : null)
          setZipUploadEtaSeconds(etaSeconds !== null && Number.isFinite(etaSeconds) ? etaSeconds : null)
          setZipDriveProcessingSeconds(snapshot.elapsed_seconds ?? 0)
          if (snapshot.phase === "canceling") {
            updateProgress("Cancelando subida en backend...")
          } else if (percent >= 99 && snapshot.phase !== "completed") {
            updateProgress("Finalizando sincronización con Google Drive...")
          } else {
            updateProgress(`Sincronizando archivos en Google Drive... ${percent}%`)
          }

          if (snapshot.phase === "completed") {
            clearDriveProgressPolling()
          }
          if (snapshot.phase === "failed") {
            clearDriveProgressPolling()
            if (snapshot.error) {
              throw new Error(snapshot.error)
            }
          }
        }

        // Start polling immediately so we never miss Drive-side progress.
        void pollDriveProgress().catch((error: unknown) => {
          console.warn("[EditProjectDialog] initial Drive progress poll failed", error)
        })
        driveProgressPollTimer = setInterval(() => {
          void pollDriveProgress().catch((error: unknown) => {
            console.warn("[EditProjectDialog] Drive progress poll failed", error)
          })
        }, 1000)

        await ProjectsApi.uploadZipWithProgress(projectId, zipToUpload, (progress) => {
          if (progress.phase === "uploading") {
            updateProgress(`Enviando nuevo ZIP al backend... ${progress.percent}%`)
            return
          }

          if (progress.phase === "processing") {
            return
          }

          if (progress.phase === "completed") {
            clearDriveProgressPolling()
            void pollDriveProgress().catch((error: unknown) => {
              console.warn("[EditProjectDialog] final Drive progress poll failed", error)
            })
          }
        }, uploadAbortController.signal)

        clearDriveProgressPolling()
        await pollDriveProgress().catch((error: unknown) => {
          console.warn("[EditProjectDialog] post-upload Drive progress poll failed", error)
        })

        setZipUploadPercent(100)
        setZipUploadBytes((prev) => {
          const total = prev?.total ?? 0
          return { loaded: total, total }
        })
        setZipUploadSpeedMbps(null)
        setZipUploadEtaSeconds(0)
        updateProgress("ZIP y sincronizacion en Google Drive completados.")
        setIsZipUploadInProgress(false)
        uploadAbortControllerRef.current = null
        activeZipUploadProjectIdRef.current = null
      }

      // Clear upload-specific indicators before moving to non-upload stages.
      setZipUploadPercent(null)
      setZipUploadBytes(null)
      setZipUploadSpeedMbps(null)
      setZipUploadEtaSeconds(null)
      setZipDriveProcessingSeconds(null)

      // Only update sensors and/or participants if they actually changed.
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

      const shouldFinalize = shouldUploadZip
      if (shouldFinalize) {
        // Finalize only when a new ZIP was uploaded.
        updateProgress("Finalizando actualización del proyecto...")
        await ProjectsApi.finalize(projectId)
      }

      onProjectUpdated({
        id: projectId,
        name: updatedMetadata.name,
        description: updatedMetadata.description || formData.description,
        status: toProjectStatus(updatedMetadata.status),
        createdAt: updatedMetadata.created_at
          ? new Date(updatedMetadata.created_at).toLocaleDateString("es-ES")
          : originalCreatedAtRef.current,
        updatedAt: updatedMetadata.updated_at
          ? new Date(updatedMetadata.updated_at).toLocaleString("es-ES", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : new Date().toLocaleString("es-ES", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
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
      const wasCanceled = /cancelad|abort/i.test(friendlyMessage)
      const showSessionHint = isGoogleSessionExpiredError(friendlyMessage)
      const nextMessage = showSessionHint
        ? `${friendlyMessage}. Tu sesión de Google Drive puede haber expirado. Vuelve a conectar Google Drive.`
        : friendlyMessage

      console.error("[EditProjectDialog] saveProjectChanges failed", {
        projectId,
        step: saveProgressMessage,
        error,
        friendlyMessage,
      })
      if (wasCanceled) {
        setSaveError(null)
        setSaveNotice("Subida cancelada por el usuario.")
      } else {
        setSaveNotice(null)
        setSaveError(nextMessage)
      }
      if (wasCanceled) {
        toast("Subida cancelada por el usuario.")
      } else {
        toast.error("No se pudo guardar la edición del proyecto.")
      }
    } finally {
      setIsSaving(false)
      setIsSaveCompleted(false)
      setSaveProgressMessage(null)
      setZipUploadPercent(null)
      setZipUploadBytes(null)
      setZipUploadSpeedMbps(null)
      setZipUploadEtaSeconds(null)
      setZipDriveProcessingSeconds(null)
      setIsZipUploadInProgress(false)
      uploadAbortControllerRef.current = null
      activeZipUploadProjectIdRef.current = null
    }
  }

  const resetDialogState = () => {
    setIsLoading(false)
    setIsSaving(false)
    setCurrentStep(1)
    setSaveError(null)
    setSaveNotice(null)
    setIsSaveCompleted(false)
    setSaveProgressMessage(null)
    setZipUploadPercent(null)
    setZipUploadBytes(null)
    setZipUploadSpeedMbps(null)
    setZipUploadEtaSeconds(null)
    setZipDriveProcessingSeconds(null)
    setIsZipUploadInProgress(false)
    uploadAbortControllerRef.current = null
    activeZipUploadProjectIdRef.current = null
  }

  const handleCancel = () => {
    console.warn("[EditProjectDialog] cancel", {
      projectId,
      currentStep,
      isSaving,
      saveError,
      saveProgressMessage,
    })
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

            {saveNotice && !saveError && (
              <div className="mt-4 p-4 bg-gray-50 border border-gray-300 rounded-lg">
                <p className="text-sm text-gray-700">{saveNotice}</p>
              </div>
            )}

            {isSaving && (
              <div className="mt-4 p-5 bg-gray-50 border border-gray-300 rounded-2xl">
                {zipUploadPercent !== null ? (
                  <>
                    {/* Header with title and percentage */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center">
                          <Cloud className="h-5 w-5 text-gray-700" />
                        </div>
                        <div>
                          <p className="text-2sm font-semibold text-gray-900">
                            {isDriveSyncFinalizing
                              ? "Finalizando sincronización con Google Drive"
                              : isDriveSyncInProgress
                              ? "Sincronizando con Google Drive"
                              : "Sincronización completada"}
                          </p>
                          <p className="text-sm text-gray-600">{zipUploadPercent}% completado</p>
                        </div>
                      </div>
                      <span className="text-xl font-bold text-gray-900">{zipUploadPercent}%</span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-4">
                      <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-150 ${
                            isDriveSyncInProgress ? "bg-gray-800 animate-pulse" : "bg-black"
                          }`}
                          style={{ width: `${zipUploadPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Data info grid */}
                    {zipUploadBytes && zipUploadBytes.total > 0 && (
                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-gray-500" />
                          <p>{formatBytesToMB(zipUploadBytes.total)}</p>
                        </div>
                        <div className="text-right font-medium text-gray-800">
                          {formatBytesToMB(zipUploadBytes.loaded)} transferidos
                        </div>
                      </div>
                    )}

                    {/* Metrics row */}
                    <div className="grid grid-cols-3 gap-4 text-sm bg-white p-3 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-lg border border-gray-300 flex items-center justify-center mt-0.5">
                          <Gauge className="h-3.5 w-3.5 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">VELOCIDAD</p>
                          <p className="font-semibold text-gray-900">
                            {zipUploadSpeedMbps !== null ? `${zipUploadSpeedMbps.toFixed(1)} MB/s` : "calculando..."}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-lg border border-gray-300 flex items-center justify-center mt-0.5">
                          <Clock3 className="h-3.5 w-3.5 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">RESTANTE</p>
                          <p className="font-semibold text-gray-900">
                            {zipUploadEtaSeconds !== null ? formatEta(zipUploadEtaSeconds) : isDriveSyncInProgress ? "--" : "0:00"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-lg border border-gray-300 flex items-center justify-center mt-0.5">
                          <Clock3 className="h-3.5 w-3.5 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs mb-1">TRANSCURRIDO</p>
                          <p className="font-semibold text-gray-900">
                            {zipDriveProcessingSeconds !== null ? formatEta(zipDriveProcessingSeconds) : "0:00"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-gray-600 text-sm">
                      <div className="flex items-center gap-1">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse"
                          style={{ animationDelay: "0ms", animationDuration: "900ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse"
                          style={{ animationDelay: "180ms", animationDuration: "900ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse"
                          style={{ animationDelay: "360ms", animationDuration: "900ms" }}
                        />
                        <span className="ml-2">Procesando en Google Drive...</span>
                      </div>
                      <button
                        type="button"
                        onClick={cancelZipUpload}
                        disabled={!isZipUploadInProgress}
                        className="hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3 text-sm text-gray-800">
                    {isSaveCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-gray-900" />
                    ) : (
                      <div className="h-4 w-4 border-2 border-gray-400 border-t-black rounded-full animate-spin" />
                    )}
                    <span>{saveProgressMessage || "Guardando cambios del proyecto..."}</span>
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
                disabled={isSaving || isLoading || !!saveError || !hasAnyChanges()}
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
