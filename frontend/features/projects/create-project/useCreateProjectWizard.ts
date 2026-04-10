"use client";

import { useRef, useState } from "react";
import type { ProjectFormData, SensorType, ParticipantData } from "./types";
import type { Project, DetectedParticipant } from "@/features/projects/types";
import { ProjectsApi, type ApiProjectDetail } from "@/features/projects/api/projectsApi";
import { toast } from "sonner";

const STEP1_LOADING_TOAST_ID = "create-project-step1-drive-sync";

const initialParticipants: ParticipantData[] = [];

const initialscenaries: ProjectFormData["scenaries"] = [];

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

const extractDriveFileId = (url?: string | null): string | null => {
  if (!url) return null;
  const filePathMatch = url.match(/\/d\/([^/]+)/i);
  if (filePathMatch?.[1]) return filePathMatch[1];
  const queryMatch = url.match(/[?&]id=([^&]+)/i);
  if (queryMatch?.[1]) return queryMatch[1];
  return null;
};

const resolveScenarioImageUrl = (file?: {
  drive_download_link?: string | null;
  external_id?: string | null;
  drive_web_view_link?: string | null;
}): string | null => {
  if (!file) return null;
  if (file.drive_download_link) return file.drive_download_link;
  const driveFileId = file.external_id || extractDriveFileId(file.drive_web_view_link);
  if (driveFileId) {
    return `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w2000`;
  }
  return file.drive_web_view_link ?? null;
};

const buildStep4ImageScenaries = (detail: ApiProjectDetail): ProjectFormData["scenaries"] => {
  const filesById = new Map<string, {
    drive_web_view_link?: string | null;
    drive_download_link?: string | null;
    external_id?: string | null;
  }>();
  for (const file of detail.files || []) {
    filesById.set(file.id, file);
  }

  return (detail.scenaries || [])
    .filter((scenary) => String(scenary.type || "").toLowerCase() === "image")
    .map((scenary) => {
      const linkedFile = scenary.file_id ? filesById.get(scenary.file_id) : undefined;
      return {
        id: scenary.id,
        projectId: detail.id,
        name: scenary.name,
        type: "image" as const,
        fileId: scenary.file_id ?? null,
        imageUrl: resolveScenarioImageUrl(linkedFile),
        aois: [],
      };
    });
};

export const useCreateProjectWizard = (
  onProjectCreated?: (project: Project) => void,
  onStep1Complete?: () => void,
) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isOpen, setIsOpen] = useState(false);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);

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

  const clearStep1RetryState = () => {
    setSaveError(null);
    setSaveNotice(null);
  };

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

  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    description: "",
    status: "draft",
    folderPath: "",
    uploadedZip: null,
    sensors: [],
    participants: initialParticipants,
    scenaries: initialscenaries,
    experimentFolderFiles: null,
  });

  const updateProjectName = (name: string) => {
    clearStep1RetryState();
    setFormData(prev => ({ ...prev, projectName: name }));
  };

  const updateDescription = (description: string) => {
    clearStep1RetryState();
    setFormData(prev => ({ ...prev, description }));
  };

  const updateFolderPath = (path: string) => {
    clearStep1RetryState();
    setFormData(prev => ({ ...prev, folderPath: path }));
  };

  const setExperimentFolder = (files: File[] | null) => {
    clearStep1RetryState();
    setFormData((prev) => ({
      ...prev,
      experimentFolderFiles: files,
      folderPath: files?.[0] ? ((files[0] as any)._relativePath || files[0].webkitRelativePath || files[0].name).split("/")[0] : "",
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
        return formData.projectName.trim() !== "" && !!formData.experimentFolderFiles?.length
      case 2:
        return formData.sensors.length > 0;
      case 3:
        return hasValidParticipants();
      default:
        return true;
    }
  };

  const processStep1ZipAndContinue = async () => {
    if (!formData.experimentFolderFiles?.length) {
      setSaveError("Debes seleccionar una carpeta para continuar.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    setSaveProgressMessage("Creando proyecto borrador...");

    let projectIdForUpload = draftProjectId;
    let keepDraftOnFailure = false;

    const updateProgress = (message: string) => {
      setSaveProgressMessage(message);
    };

    try {
      if (!projectIdForUpload) {
        const created = await ProjectsApi.create({
          name: formData.projectName,
          description: formData.description.trim() || undefined,
          status: "draft",
        });
        projectIdForUpload = created.id;
        setDraftProjectId(created.id);
      } else {
        await ProjectsApi.update(projectIdForUpload, {
          name: formData.projectName,
          description: formData.description.trim(),
          status: "draft",
        });
      }

      // Package folder into ZIP for backend upload
      updateProgress("Empaquetando carpeta del experimento...");
      let zipFile: File;
      try {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const getFilePath = (file: File): string =>
          (file as any)._relativePath || file.webkitRelativePath || file.name;

        const folderName = getFilePath(formData.experimentFolderFiles[0]).split("/")[0];
        for (const file of formData.experimentFolderFiles) {
          const fullPath = getFilePath(file);
          // Strip the root folder name from the path so entries are relative
          const relativePath = fullPath.startsWith(folderName + "/")
            ? fullPath.slice(folderName.length + 1)
            : fullPath || file.name;
          zip.file(relativePath, file, { compression: "STORE" });
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        zipFile = new File([zipBlob], `${folderName}.zip`, { type: "application/zip" });
      } catch (packError: any) {
        console.error("[CreateProjectWizard] JSZip packaging failed", packError);
        throw new Error("Error al empaquetar la carpeta. Verifica que no exceda 500MB.");
      }

      // Lock inputs immediately by setting ingestion_status to PROCESSING
      setFormData((prev) => ({
        ...prev,
        uploadedZip: {
          project_id: projectIdForUpload || "",
          ingestion_status: "PROCESSING",
          zip_saved: false,
          zip_file: null,
          counts: { folders_created: 0, files_uploaded: 0, images: 0, videos: 0, csv: 0, other: 0, scenaries_created: 0 },
          files: [],
          csv_processing: { detected: 0, processed: 0, failed: 0 },
          manifest: { total_detected: 0, images: 0, videos: 0, csv: 0, other: 0 },
        },
      }));

      setZipUploadPercent(null);
      setZipUploadBytes(null);
      setZipUploadSpeedMbps(null);
      setZipUploadEtaSeconds(null);
      setZipDriveProcessingSeconds(null);
      updateProgress("Enviando experimento al backend...");
      setIsZipUploadInProgress(true);

      const uploadAbortController = new AbortController();
      uploadAbortControllerRef.current = uploadAbortController;
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
        if (!projectIdForUpload) return;
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
          toast.loading(`Procesando archivos de ${formData.projectName} - ${percent}%`, {
            id: STEP1_LOADING_TOAST_ID,
            position: "bottom-center",
            duration: Infinity,
          });
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
        zipFile,
        (progress) => {
          if (progress.phase === "uploading") {
            updateProgress(`Enviando experimento al backend... ${progress.percent}%`);
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

      if (uploadedZipResult.ingestion_status === "FAILED") {
        throw new Error("La ingesta falló en backend. Verifica estructura y contenido.");
      }

      const detail = await ProjectsApi.get(projectIdForUpload);

      // Auto-populate detected sensors from CSV analysis
      const detectedSensors = (uploadedZipResult.detected_sensors ?? []).filter(
        (s: string): s is SensorType => ["EEG", "GSR", "EyeTracker"].includes(s)
      );

      // Auto-populate participants from CSV recording numbers
      const csvParticipants: ParticipantData[] = (uploadedZipResult.participants ?? [])
        .sort((a: DetectedParticipant, b: DetectedParticipant) => a.user_index - b.user_index)
        .map((p: DetectedParticipant) => ({
          id: p.participant_code,
          sex: null as ParticipantData["sex"],
          age: "",
        }));

      setFormData((prev) => ({
        ...prev,
        uploadedZip: uploadedZipResult,
        scenaries: buildStep4ImageScenaries(detail),
        sensors: detectedSensors.length > 0 ? detectedSensors : prev.sensors,
        participants: csvParticipants.length > 0 ? csvParticipants : prev.participants,
      }));

      // Immediately persist detected sensors and participants to DB so they are
      // available when the user closes the wizard and resumes via "Continuar".
      if (detectedSensors.length > 0) {
        await ProjectsApi.setSensors(projectIdForUpload!, detectedSensors as string[]).catch((err: unknown) => {
          console.warn("[CreateProjectWizard] could not save detected sensors to DB", err);
        });
      }
      if (csvParticipants.length > 0) {
        await ProjectsApi.setParticipants(
          projectIdForUpload!,
          csvParticipants.map((p) => ({ participant_code: p.id, age: null, sex: null }))
        ).catch((err: unknown) => {
          console.warn("[CreateProjectWizard] could not save detected participants to DB", err);
        });
      }

      setCurrentStep(2);
      keepDraftOnFailure = true;
      setSaveProgressMessage(null);
      setSaveNotice("Carpeta procesada correctamente. Puedes continuar con la configuración.");
    } catch (error: any) {
      const rawErrorMessage = error?.message ?? "Error procesando carpeta";
      const errorMessage = rawErrorMessage
        .replace(/^API\s*\d+\s*:\s*/i, "")
        .replace(/^Error subiendo archivo:\s*/i, "");

      const showSessionHint = isGoogleSessionExpiredError(errorMessage);
      const wasCanceled = /cancelad|abort/i.test(errorMessage);
      setSaveNotice(null);
      setSaveError(
        wasCanceled
          ? null
          : showSessionHint
            ? `${errorMessage}. Tu sesión de Google Drive puede haber expirado. Vuelve a conectar Google Drive.`
            : errorMessage
      );

      if (wasCanceled) {
        setSaveNotice("Subida cancelada por el usuario.");
      }

      if (!keepDraftOnFailure && projectIdForUpload) {
        try {
          await ProjectsApi.delete(projectIdForUpload);
          setDraftProjectId(null);
        } catch (cleanupError) {
          console.warn("[CreateProjectWizard] could not delete draft project after failed step 1", cleanupError);
        }
      }
    } finally {
      setIsSaving(false);
      setIsZipUploadInProgress(false);
      uploadAbortControllerRef.current = null;
      activeZipUploadProjectIdRef.current = null;
      setZipUploadPercent(null);
      setZipUploadBytes(null);
      setZipUploadSpeedMbps(null);
      setZipUploadEtaSeconds(null);
      setZipDriveProcessingSeconds(null);
      toast.dismiss(STEP1_LOADING_TOAST_ID);
      onStep1Complete?.();
    }
  };

  const nextStep = async () => {
    if (currentStep >= 4 || !canGoNext()) return;
    if (currentStep === 1) {
      await processStep1ZipAndContinue();
      return;
    }
    setSaveNotice(null);
    setCurrentStep((prev) => prev + 1);
  };
  const prevStep = () => {
    if (currentStep > 1) {
      setSaveNotice(null);
      setCurrentStep((prev) => prev - 1);
    }
  };

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
      status: "draft",
      folderPath: "",
      uploadedZip: null,
      sensors: [],
      participants: initialParticipants,
      scenaries: initialscenaries,
      experimentFolderFiles: null,
    });
    setDraftProjectId(null);
  };

  const discardDraftProject = async () => {
    if (!draftProjectId) return;
    try {
      await ProjectsApi.delete(draftProjectId);
    } catch (error) {
      console.warn("[CreateProjectWizard] failed to delete draft project", { draftProjectId, error });
    } finally {
      setDraftProjectId(null);
    }
  };

  const openForResume = async (project: Project) => {
    setDraftProjectId(project.id);

    const baseFormData: ProjectFormData = {
      projectName: project.name,
      description: project.description || "",
      status: "draft",
      folderPath: "",
      experimentFolderFiles: null,
      uploadedZip: {
        project_id: project.id,
        ingestion_status: "READY",
        zip_saved: false,
        zip_file: null,
        counts: { folders_created: 0, files_uploaded: 0, images: 0, videos: 0, csv: 0, other: 0, scenaries_created: 0 },
        files: [],
        csv_processing: { detected: 0, processed: 0, failed: 0 },
        manifest: { total_detected: 0, images: 0, videos: 0, csv: 0, other: 0 },
      },
      sensors: [],
      participants: [],
      scenaries: [],
    };

    try {
      const detail = await ProjectsApi.get(project.id);

      const detectedSensors = (detail.sensors || [])
        .map((sensor) => sensor.sensor_type)
        .filter((sensorType): sensorType is SensorType => ["EEG", "GSR", "EyeTracker"].includes(sensorType));

      const detectedParticipants: ParticipantData[] = (detail.participants || []).map((p) => ({
        id: p.participant_code,
        sex: (p.sex as ParticipantData["sex"] | null) ?? null,
        age: p.age !== null && p.age !== undefined ? String(p.age) : "",
      }));

      const detectedScenaries = buildStep4ImageScenaries(detail);

      setFormData({
        ...baseFormData,
        uploadedZip: {
          project_id: project.id,
          ingestion_status: "READY",
          zip_saved: false,
          zip_file: null,
          counts: { folders_created: 0, files_uploaded: 0, images: 0, videos: 0, csv: 0, other: 0, scenaries_created: 0 },
          files: [],
          csv_processing: { detected: 0, processed: 0, failed: 0 },
          manifest: { total_detected: 0, images: 0, videos: 0, csv: 0, other: 0 },
          detected_sensors: detectedSensors.map((s) => s as string),
        },
        sensors: detectedSensors.length > 0 ? detectedSensors : [],
        participants: detectedParticipants.length > 0 ? detectedParticipants : [],
        scenaries: detectedScenaries,
      });
      setCurrentStep(2);
      setIsOpen(true);
    } catch (error) {
      console.warn("[CreateProjectWizard] openForResume could not load full project detail", {
        projectId: project.id,
        error,
      });
      setFormData(baseFormData);
      setCurrentStep(2);
      setIsOpen(true);
    }
  };

  const saveProject = async () => {
    if (!hasValidParticipants()) {
      setSaveError("Completa sexo y edad de todos los participantes antes de guardar.");
      return;
    }

    if (!draftProjectId) {
      setSaveError("No hay un proyecto borrador para finalizar. Regresa al Paso 1 y procesa la carpeta.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    setIsSaveCompleted(false);

    const updateProgress = (message: string) => {
      setSaveProgressMessage(message);
    };

    try {
      updateProgress("Guardando sensores y participantes...");
      const updates: Promise<void>[] = [];

      if (formData.sensors.length > 0) {
        updates.push(ProjectsApi.setSensors(draftProjectId, formData.sensors as string[]));
      }

      if (formData.participants.length > 0) {
        const normalizedParticipants = normalizeParticipants(formData.participants);
        updates.push(ProjectsApi.setParticipants(draftProjectId, normalizedParticipants));
      }

      await Promise.all(updates);

      updateProgress("Finalizando configuración del proyecto...");
      await ProjectsApi.finalize(draftProjectId);

      const finalized = await ProjectsApi.get(draftProjectId);

      const newProject: Project = {
        id: draftProjectId,
        name: finalized.name,
        description: finalized.description ?? formData.description,
        status: "active",
        createdAt: formatDate(finalized.created_at),
        updatedAt: hasRealUpdate(finalized.updated_at, finalized.created_at)
          ? formatDateTime(finalized.updated_at)
          : undefined,
        sensors: formData.sensors,
        participants: formData.participants.length,
      };

      onProjectCreated?.(newProject);
      setIsSaveCompleted(true);
      setSaveProgressMessage("Proceso completado. Cerrando...");
      await new Promise((resolve) => setTimeout(resolve, 900));
      toast.success(`Proyecto "${finalized.name}" creado correctamente.`);
      setIsOpen(false);
      reset();
    } catch (e: any) {
      const rawErrorMessage = e?.message ?? "Error guardando proyecto";
      const errorMessage = rawErrorMessage
        .replace(/^API\s*\d+\s*:\s*/i, "")
        .replace(/^Error subiendo archivo:\s*/i, "");
      const showSessionHint = isGoogleSessionExpiredError(errorMessage);

      console.error("[CreateProjectWizard] saveProject failed", {
        step: saveProgressMessage,
        error: e,
        normalizedError: errorMessage,
      });

      setSaveNotice(null);
      setSaveError(
        showSessionHint
          ? `${errorMessage}. Tu sesión de Google Drive puede haber expirado. Vuelve a conectar Google Drive.`
          : (saveProgressMessage
              ? `Error guardando proyecto. Paso fallido: ${saveProgressMessage}`
              : errorMessage)
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
    setExperimentFolder,
    discardDraftProject,
    openForResume,
  };
};