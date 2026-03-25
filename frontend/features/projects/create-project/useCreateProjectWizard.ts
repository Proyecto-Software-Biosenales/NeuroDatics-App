"use client";

import { useRef, useState } from "react";
import type { ProjectFormData, SensorType, ParticipantData } from "./types";
import type { Project } from "@/features/projects/types";
import { ProjectsApi } from "@/features/projects/api/projectsApi";
import { toast } from "sonner";


const initialParticipants: ParticipantData[] = [
  { id: "1000557085", sex: null, age: "" },
  { id: "1000187293", sex: null, age: "" },
  { id: "1023675443", sex: null, age: "" },
];

const initialscenaries = [
  { id: "1", name: "San Jeronimo", aois: [] },
  { id: "2", name: "Yom Yom", aois: [] },
  { id: "3", name: "Crem Helado", aois: [] },
];

const formatDate = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTime = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const hasRealUpdate = (updatedIso?: string, createdIso?: string): boolean => {
  if (!updatedIso) return false;
  if (!createdIso) return true;

  const updatedMs = new Date(updatedIso).getTime();
  const createdMs = new Date(createdIso).getTime();

  if (!Number.isFinite(updatedMs) || !Number.isFinite(createdMs)) {
    return updatedIso !== createdIso;
  }

  return Math.abs(updatedMs - createdMs) > 1000;
};

const isGoogleSessionExpiredError = (message: string): boolean => {
  return /google drive|oauth|invalid_grant|refresh token|token has expired|no se pudo configurar google drive/i.test(message);
};

export const useCreateProjectWizard = (onProjectCreated?: (project: Project) => void) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isOpen, setIsOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaveCompleted, setIsSaveCompleted] = useState(false);
  const [saveProgressMessage, setSaveProgressMessage] = useState<string | null>(null);
  const [zipUploadPercent, setZipUploadPercent] = useState<number | null>(null);
  const [zipUploadBytes, setZipUploadBytes] = useState<{ loaded: number; total: number } | null>(null);
  const [zipUploadSpeedMbps, setZipUploadSpeedMbps] = useState<number | null>(null);
  const [zipUploadEtaSeconds, setZipUploadEtaSeconds] = useState<number | null>(null);
  const [zipDriveProcessingSeconds, setZipDriveProcessingSeconds] = useState<number | null>(null);
  const [isZipUploadInProgress, setIsZipUploadInProgress] = useState(false);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const activeZipUploadProjectIdRef = useRef<string | null>(null);

  const cancelZipUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
    }
    if (activeZipUploadProjectIdRef.current) {
      void ProjectsApi.cancelZipUpload(activeZipUploadProjectIdRef.current).catch((error: unknown) => {
        console.warn("[CreateProjectWizard] backend cancel request failed", error);
      });
    }
    setSaveProgressMessage("Cancelando subida a Google Drive...");
  };

  // 👇 agrega aquí experimentZip si ya lo estás capturando desde Step1
  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    description: "",
    status: "active",
    folderPath: "",
    uploadedZip: null,
    sensors: [],
    participants: initialParticipants,
    scenaries: initialscenaries,
    experimentZip: null,
  });

  const updateProjectName = (name: string) => setFormData(prev => ({ ...prev, projectName: name }));
  const updateDescription = (description: string) => setFormData(prev => ({ ...prev, description }));
  const updateFolderPath = (path: string) => setFormData(prev => ({ ...prev, folderPath: path }));
  const setExperimentZip = (file: File | null) => {
    setFormData((prev) => ({
      ...prev,
      experimentZip: file,
      folderPath: file ? file.name : "", // para mostrar nombre en UI
    }))
  }

  const normalizeParticipants = (participants: ParticipantData[]) => {
    return participants.map(p => ({
      participant_code: p.id,
      age: p.age && !isNaN(Number(p.age)) ? Number(p.age) : null,
      sex: ["male", "female", "other"].includes(p.sex || "") ? p.sex : null
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

  const toggleSensor = (sensor: SensorType) => {
    setFormData(prev => ({
      ...prev,
      sensors: prev.sensors.includes(sensor) ? prev.sensors.filter(s => s !== sensor) : [...prev.sensors, sensor],
    }));
  };

  const updateParticipant = (id: string, field: "sex" | "age", value: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.map(p => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return formData.projectName.trim() !== "" && !!formData.experimentZip
      case 2:
        return formData.sensors.length > 0;
      case 3:
        return hasValidParticipants();
      default:
        return true;
    }
  };

  const nextStep = () => currentStep < 4 && canGoNext() && setCurrentStep(prev => prev + 1);
  const prevStep = () => currentStep > 1 && setCurrentStep(prev => prev - 1);

  const reset = () => {
    setCurrentStep(1);
    setSaveError(null);
    setSaveNotice(null);
    setIsSaveCompleted(false);
    setSaveProgressMessage(null);
    setZipUploadPercent(null);
    setZipUploadBytes(null);
    setZipUploadSpeedMbps(null);
    setZipUploadEtaSeconds(null);
    setZipDriveProcessingSeconds(null);
    setFormData({
      projectName: "",
      description: "",
      status: "active",
      folderPath: "",
      uploadedZip: null,
      sensors: [],
      participants: initialParticipants,
      scenaries: initialscenaries,
      experimentZip: null,
    });
  };

  // ✅ AHORA ES ASYNC y llama backend real con rollback
  const saveProject = async () => {
    if (!hasValidParticipants()) {
      setSaveError("Completa sexo y edad de todos los participantes antes de guardar.")
      return
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    setIsSaveCompleted(false);
    let createdProjectId: string | null = null;

    const updateProgress = (message: string) => {
      setSaveProgressMessage(message);
    };

    try {
      // 1) Crear proyecto real
      updateProgress("Creando proyecto...");
      const created = await ProjectsApi.create({
        name: formData.projectName,
        description: formData.description.trim() || undefined,
      });
      createdProjectId = created.id;

      // 2) Subir zip a Drive (si existe)
      if (formData.experimentZip) {
        try {
          setZipUploadPercent(null);
          setZipUploadBytes(null);
          setZipUploadSpeedMbps(null);
          setZipUploadEtaSeconds(null);
          setZipDriveProcessingSeconds(null);
          updateProgress("Enviando ZIP al backend...");
          setIsZipUploadInProgress(true);

          const uploadAbortController = new AbortController();
          uploadAbortControllerRef.current = uploadAbortController;

          const projectIdForUpload = createdProjectId;
          if (!projectIdForUpload) {
            throw new Error("No se pudo iniciar la subida del ZIP: proyecto no disponible.");
          }
          activeZipUploadProjectIdRef.current = projectIdForUpload;

          let driveProgressPollTimer: ReturnType<typeof setInterval> | null = null;
          let lastDriveSampleAt: number | null = null;
          let lastDriveUploadedBytes: number | null = null;

          const clearDriveProgressPolling = () => {
            if (driveProgressPollTimer) {
              clearInterval(driveProgressPollTimer);
              driveProgressPollTimer = null;
            }
          };

          const pollDriveProgress = async () => {
            const snapshot = await ProjectsApi.getZipUploadProgress(projectIdForUpload);
            const totalBytes = Math.max(0, snapshot.total_bytes || 0);
            const uploadedBytes = Math.max(0, snapshot.uploaded_bytes || 0);

            if (totalBytes <= 0 && snapshot.phase !== "completed" && snapshot.phase !== "failed") {
              updateProgress("Preparando sincronización en Google Drive...");
              return;
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
            );

            const now = Date.now();
            let speedMbps = snapshot.speed_mbps ?? null;
            if ((speedMbps === null || !Number.isFinite(speedMbps)) && lastDriveSampleAt !== null && lastDriveUploadedBytes !== null) {
              const deltaSeconds = Math.max(0.001, (now - lastDriveSampleAt) / 1000);
              const deltaBytes = Math.max(0, uploadedBytes - lastDriveUploadedBytes);
              const sampledSpeed = deltaBytes / deltaSeconds / (1024 * 1024);
              speedMbps = Number.isFinite(sampledSpeed) && sampledSpeed > 0 ? sampledSpeed : null;
            }

            const speedBytesPerSecond = speedMbps !== null ? speedMbps * 1024 * 1024 : null;
            const etaSeconds = snapshot.eta_seconds ?? (
              speedBytesPerSecond && speedBytesPerSecond > 0
                ? Math.max(0, Math.round((totalBytes - uploadedBytes) / speedBytesPerSecond))
                : null
            );

            lastDriveSampleAt = now;
            lastDriveUploadedBytes = uploadedBytes;

            setZipUploadPercent(percent);
            setZipUploadBytes({ loaded: uploadedBytes, total: totalBytes });
            setZipUploadSpeedMbps(speedMbps !== null && Number.isFinite(speedMbps) ? speedMbps : null);
            setZipUploadEtaSeconds(etaSeconds !== null && Number.isFinite(etaSeconds) ? etaSeconds : null);
            setZipDriveProcessingSeconds(snapshot.elapsed_seconds ?? 0);
            if (snapshot.phase === "canceling") {
              updateProgress("Cancelando subida en backend...");
            } else if (percent >= 99 && snapshot.phase !== "completed") {
              updateProgress("Finalizando sincronización con Google Drive...");
            } else {
              updateProgress(`Sincronizando archivos en Google Drive... ${percent}%`);
            }

            if (snapshot.phase === "completed") {
              clearDriveProgressPolling();
            }
            if (snapshot.phase === "failed") {
              clearDriveProgressPolling();
              if (snapshot.error) {
                throw new Error(snapshot.error);
              }
            }
          };

          // Start polling immediately so we never miss Drive-side progress.
          void pollDriveProgress().catch((error: unknown) => {
            console.warn("[CreateProjectWizard] initial Drive progress poll failed", error);
          });
          driveProgressPollTimer = setInterval(() => {
            void pollDriveProgress().catch((error: unknown) => {
              console.warn("[CreateProjectWizard] Drive progress poll failed", error);
            });
          }, 1000);

          const uploadedZipResult = await ProjectsApi.uploadZipWithProgress(
            projectIdForUpload,
            formData.experimentZip,
            (progress) => {
              if (progress.phase === "uploading") {
                updateProgress(`Enviando ZIP al backend... ${progress.percent}%`);
                return;
              }

              if (progress.phase === "processing") {
                return;
              }

              if (progress.phase === "completed") {
                clearDriveProgressPolling();
                void pollDriveProgress().catch((error: unknown) => {
                  console.warn("[CreateProjectWizard] final Drive progress poll failed", error);
                });
              }
            },
            uploadAbortController.signal,
          );

          clearDriveProgressPolling();
          await pollDriveProgress().catch((error: unknown) => {
            console.warn("[CreateProjectWizard] post-upload Drive progress poll failed", error);
          });

          setZipUploadPercent(100);
          setZipUploadBytes((prev) => {
            const total = prev?.total ?? 0;
            return { loaded: total, total };
          });
          setZipUploadSpeedMbps(null);
          setZipUploadEtaSeconds(0);
          updateProgress("ZIP y sincronizacion en Google Drive completados.");
          
          // Almacenar resultado del upload en formData
          setFormData(prev => ({
            ...prev,
            uploadedZip: uploadedZipResult
          }));

          if (uploadedZipResult.ingestion_status === "FAILED") {
            throw new Error("La ingesta del ZIP fallo en backend. Verifica estructura y contenido.");
          }

          if (uploadedZipResult.csv_processing.failed > 0) {
            console.warn("Algunos CSV no pudieron procesarse durante la ingesta", uploadedZipResult.csv_processing);
          }

          console.log(
            `ZIP ingested successfully: files=${uploadedZipResult.counts.files_uploaded}, images=${uploadedZipResult.counts.images}, videos=${uploadedZipResult.counts.videos}, csv=${uploadedZipResult.counts.csv}`
          );
        } catch (error) {
          setIsZipUploadInProgress(false);
          uploadAbortControllerRef.current = null;
          activeZipUploadProjectIdRef.current = null;
          // Rollback: eliminar proyecto creado
          try {
            await ProjectsApi.delete(createdProjectId);
          } catch {
            console.error("[CreateProjectWizard] rollback delete failed", { createdProjectId });
          }
          console.error("[CreateProjectWizard] ZIP upload failed", {
            createdProjectId,
            error,
          });
          throw new Error(error instanceof Error ? error.message : "Error desconocido al subir el archivo ZIP.");
        } finally {
          setIsZipUploadInProgress(false);
          uploadAbortControllerRef.current = null;
          activeZipUploadProjectIdRef.current = null;
        }
      }

      // Clear upload-specific indicators before moving to non-upload stages.
      setZipUploadPercent(null);
      setZipUploadBytes(null);
      setZipUploadSpeedMbps(null);
      setZipUploadEtaSeconds(null);
      setZipDriveProcessingSeconds(null);
    
      // 3) Sensores y participantes primero
      updateProgress("Guardando sensores y participantes...");
      const updates: Promise<void>[] = [];

      if (formData.sensors.length > 0) {
        updates.push(ProjectsApi.setSensors(createdProjectId, formData.sensors as string[]));
      }

      if (formData.participants.length > 0) {
        const normalizedParticipants = normalizeParticipants(formData.participants);
        updates.push(ProjectsApi.setParticipants(createdProjectId, normalizedParticipants));
      }

      await Promise.all(updates);

      // 4) Finalizar proyecto al final para evitar carreras con updates en paralelo
      updateProgress("Finalizando configuración del proyecto...");
      await ProjectsApi.finalize(createdProjectId);

      // 7) Actualiza UI (grid)
      const newProject: Project = {
        id: createdProjectId,
        name: created.name,
        description: created.description ?? formData.description,
        status: "active",
        createdAt: formatDate(created.created_at),
        updatedAt: hasRealUpdate(created.updated_at, created.created_at)
          ? formatDateTime(created.updated_at)
          : undefined,
        sensors: formData.sensors,
        participants: formData.participants.length,
      };

      onProjectCreated?.(newProject);
      setIsSaveCompleted(true);
      setSaveProgressMessage("Proceso completado. Cerrando...");
      await new Promise((resolve) => setTimeout(resolve, 900));
      toast.success(`Proyecto "${created.name}" creado correctamente.`);
      setIsOpen(false);
      reset();
    } catch (e: any) {
      
      // For validation/structure errors, show the error message directly
      // For other errors, show context of where it failed
      const rawErrorMessage = e?.message ?? "Error guardando proyecto";
      const errorMessage = rawErrorMessage
        .replace(/^API\s*\d+\s*:\s*/i, "")
        .replace(/^Error subiendo archivo:\s*/i, "");
      const showSessionHint = isGoogleSessionExpiredError(errorMessage);
      const wasCanceled = /cancelad|abort/i.test(errorMessage);
      const isValidationError = errorMessage.includes("CSV") || 
                                errorMessage.includes("Images") || 
                                errorMessage.includes("Videos") ||
                                errorMessage.includes("ZIP");
      console.error("[CreateProjectWizard] saveProject failed", {
        step: saveProgressMessage,
        error: e,
        normalizedError: errorMessage,
      });
      
      if (wasCanceled) {
        setSaveError(null);
        setSaveNotice("Subida cancelada por el usuario.");
      } else {
        setSaveNotice(null);
        setSaveError(
          showSessionHint
            ? `${errorMessage}. Tu sesión de Google Drive puede haber expirado. Vuelve a conectar Google Drive.`
            : isValidationError
              ? errorMessage
              : (saveProgressMessage
                  ? `Error guardando proyecto. Paso fallido: ${saveProgressMessage}`
                  : errorMessage)
        );
      }
      if (wasCanceled) {
        toast("Subida cancelada por el usuario.");
      } else {
        toast.error("No se pudo guardar el proyecto.");
      }
    } finally {
      setIsSaving(false);
      setIsSaveCompleted(false);
      setSaveProgressMessage(null);
      setZipUploadPercent(null);
      setZipUploadBytes(null);
      setZipUploadSpeedMbps(null);
      setZipUploadEtaSeconds(null);
      setZipDriveProcessingSeconds(null);
      setIsZipUploadInProgress(false);
      uploadAbortControllerRef.current = null;
      activeZipUploadProjectIdRef.current = null;
    }
  };

  return {
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
    setExperimentZip,
  };
};