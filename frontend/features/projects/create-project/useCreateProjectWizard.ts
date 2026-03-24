"use client";

import { useRef, useState } from "react";
import type { ProjectFormData, SensorType, ParticipantData } from "./types";
import type { Project } from "@/features/projects/types";
import { ProjectsApi } from "@/features/projects/api/projectsApi";
import { toast } from "sonner";

const ZIP_PROCESSING_AVG_KEY = "neurodatics_zip_processing_avg_seconds";

const getStoredProcessingAverageSeconds = (): number | null => {
  try {
    const raw = window.localStorage.getItem(ZIP_PROCESSING_AVG_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

const persistProcessingAverageSeconds = (nextSeconds: number) => {
  try {
    const prev = getStoredProcessingAverageSeconds();
    const blended = prev ? Math.round(prev * 0.7 + nextSeconds * 0.3) : Math.round(nextSeconds);
    window.localStorage.setItem(ZIP_PROCESSING_AVG_KEY, String(Math.max(1, blended)));
  } catch {
    // Ignore persistence errors.
  }
};

const estimateProcessingSeconds = (totalBytes: number): number => {
  const mb = totalBytes / (1024 * 1024);
  const heuristic = Math.max(30, Math.round(mb * 1.2));
  const storedAvg = getStoredProcessingAverageSeconds();
  if (!storedAvg) return heuristic;
  const blended = Math.round(storedAvg * 0.6 + heuristic * 0.4);
  return Math.max(30, blended);
};


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

export const useCreateProjectWizard = (onProjectCreated?: (project: Project) => void) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isOpen, setIsOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaveCompleted, setIsSaveCompleted] = useState(false);
  const [saveProgressMessage, setSaveProgressMessage] = useState<string | null>(null);
  const [zipUploadPercent, setZipUploadPercent] = useState<number | null>(null);
  const [zipUploadBytes, setZipUploadBytes] = useState<{ loaded: number; total: number } | null>(null);
  const [zipUploadSpeedMbps, setZipUploadSpeedMbps] = useState<number | null>(null);
  const [zipUploadEtaSeconds, setZipUploadEtaSeconds] = useState<number | null>(null);
  const [zipDriveProcessingSeconds, setZipDriveProcessingSeconds] = useState<number | null>(null);
  const uploadStartedAtRef = useRef<number | null>(null);
  const processingEstimateSecondsRef = useRef<number>(0);

  // 👇 agrega aquí experimentZip si ya lo estás capturando desde Step1
  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    description: "",
    status: "draft",
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
    setIsSaveCompleted(false);
    setSaveProgressMessage(null);
    setZipUploadPercent(null);
    setZipUploadBytes(null);
    setZipUploadSpeedMbps(null);
    setZipUploadEtaSeconds(null);
    setZipDriveProcessingSeconds(null);
    uploadStartedAtRef.current = null;
    processingEstimateSecondsRef.current = 0;
    setFormData({
      projectName: "",
      description: "",
      status: "draft",
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
          setZipUploadPercent(0);
          setZipUploadBytes({ loaded: 0, total: formData.experimentZip.size });
          setZipUploadSpeedMbps(null);
          setZipUploadEtaSeconds(null);
          setZipDriveProcessingSeconds(null);
          processingEstimateSecondsRef.current = estimateProcessingSeconds(formData.experimentZip.size);
          uploadStartedAtRef.current = Date.now();
          updateProgress("Subiendo ZIP... 0%");
          const uploadedZipResult = await ProjectsApi.uploadZipWithProgress(
            createdProjectId,
            formData.experimentZip,
            (progress) => {
              if (progress.phase === "uploading") {
                const now = Date.now();
                const startedAt = uploadStartedAtRef.current ?? now;
                const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000);
                const bytesPerSecond = progress.loaded / elapsedSeconds;
                const speedMbps = bytesPerSecond / (1024 * 1024);
                const remainingBytes = Math.max(0, progress.total - progress.loaded);
                const etaSeconds = bytesPerSecond > 0 ? remainingBytes / bytesPerSecond : 0;
                const pipelinePercent = Math.min(89, Math.round(progress.percent * 0.89));
                const pipelineEtaSeconds = Math.max(0, Math.round(etaSeconds + processingEstimateSecondsRef.current));

                setZipUploadPercent(pipelinePercent);
                setZipUploadBytes({ loaded: progress.loaded, total: progress.total });
                setZipUploadSpeedMbps(Number.isFinite(speedMbps) ? speedMbps : null);
                setZipUploadEtaSeconds(Number.isFinite(pipelineEtaSeconds) ? pipelineEtaSeconds : null);
                setZipDriveProcessingSeconds(null);
                updateProgress(`Subiendo ZIP... ${pipelinePercent}%`);
                return;
              }

              if (progress.phase === "processing") {
                const elapsed = progress.processingElapsedSeconds ?? 0;
                const processingRemaining = Math.max(0, processingEstimateSecondsRef.current - elapsed);
                const processingProgress = processingEstimateSecondsRef.current > 0
                  ? Math.min(10, Math.round((elapsed / processingEstimateSecondsRef.current) * 10))
                  : 0;
                const pipelinePercent = Math.min(99, 89 + processingProgress);
                const exceededEstimate = elapsed > processingEstimateSecondsRef.current + 5;

                setZipUploadPercent(pipelinePercent);
                setZipUploadSpeedMbps(null);
                setZipUploadEtaSeconds(exceededEstimate ? null : Math.round(processingRemaining));
                setZipDriveProcessingSeconds(elapsed);
                updateProgress(`Sincronizando archivos en Google Drive... ${pipelinePercent}%`);
                return;
              }

              if (progress.phase === "completed") {
                setZipUploadPercent(100);
                setZipUploadSpeedMbps(null);
                setZipUploadEtaSeconds(0);
                setZipDriveProcessingSeconds(progress.processingElapsedSeconds ?? 0);
                if ((progress.processingElapsedSeconds ?? 0) > 0) {
                  persistProcessingAverageSeconds(progress.processingElapsedSeconds ?? 0);
                }
              }
            },
          );
          setZipUploadPercent(100);
          setZipUploadBytes((prev) => {
            const total = prev?.total ?? formData.experimentZip?.size ?? 0;
            return { loaded: total, total };
          });
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
          // Rollback: eliminar proyecto creado
          try {
            await ProjectsApi.delete(createdProjectId);
          } catch (rollbackError) {
            console.error("Error during rollback:", rollbackError);
          }
          throw new Error(`Error subiendo archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
      }

      // Clear upload-specific indicators before moving to non-upload stages.
      setZipUploadPercent(null);
      setZipUploadBytes(null);
      setZipUploadSpeedMbps(null);
      setZipUploadEtaSeconds(null);
      setZipDriveProcessingSeconds(null);
    
      // 3) Sensores, Participantes, y Finalizacion en paralelo
      updateProgress("Finalizando configuración del proyecto...");
      const updates: Promise<void>[] = [];

      if (formData.sensors.length > 0) {
        updates.push(ProjectsApi.setSensors(createdProjectId, formData.sensors as string[]));
      }

      if (formData.participants.length > 0) {
        const normalizedParticipants = normalizeParticipants(formData.participants);
        updates.push(ProjectsApi.setParticipants(createdProjectId, normalizedParticipants));
      }

      updates.push(ProjectsApi.finalize(createdProjectId));

      await Promise.all(updates);

      // 7) Actualiza UI (grid)
      const newProject: Project = {
        id: createdProjectId,
        name: created.name,
        description: created.description ?? formData.description,
        status: (created.status?.toLowerCase() as Project["status"]) || formData.status,
        createdAt: formatDate(created.created_at),
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
      console.error("Error saving project:", e);
      setSaveError(
        saveProgressMessage
          ? `Error guardando proyecto. Paso fallido: ${saveProgressMessage}`
          : (e?.message ?? "Error guardando proyecto")
      );
      toast.error("No se pudo guardar el proyecto.");
    } finally {
      setIsSaving(false);
      setIsSaveCompleted(false);
      setSaveProgressMessage(null);
      setZipUploadPercent(null);
      setZipUploadBytes(null);
      setZipUploadSpeedMbps(null);
      setZipUploadEtaSeconds(null);
      setZipDriveProcessingSeconds(null);
      uploadStartedAtRef.current = null;
      processingEstimateSecondsRef.current = 0;
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
    isSaveCompleted,
    saveProgressMessage,
    zipUploadPercent,
    zipUploadBytes,
    zipUploadSpeedMbps,
    zipUploadEtaSeconds,
    zipDriveProcessingSeconds,
    setExperimentZip,
  };
};