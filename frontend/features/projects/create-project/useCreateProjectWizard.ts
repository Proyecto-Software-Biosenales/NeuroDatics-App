"use client";

import { useRef, useState } from "react";
import type {
  ProjectFormData,
  SensorType,
  ParticipantData,
  FixationScreenGeometryInput,
} from "./types";
import { createEmptyFixationScreenGeometry } from "./types";
import type { Project } from "@/features/projects/types";
import { ProjectsApi, asUploadClarification, type ApiProjectDetail } from "@/features/projects/api/projectsApi";
import { apiAoiToFormAoi, serializeScenaryAois } from "./aoiUtils";
import { getFileRelativePath, type FolderSelection } from "./folderStructure";
import {
  createEmptyStimulusPlacementDraft,
  isStimulusPlacementDraftValid,
  serializeStimulusPlacements,
  type StimulusPlacementDraft,
} from "./stimulusPlacement";
import { toast } from "sonner";
import { useZipUploadAttempt } from "./useZipUploadAttempt";
import { packageExperimentFolder } from "./packageExperimentFolder";
import { detectedUploadMetadata } from "./uploadMetadata";

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

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error !== null && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
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
        aois: (scenary.aois || []).map((aoi, index) => apiAoiToFormAoi(aoi, index)),
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
  const [isResumedDraft, setIsResumedDraft] = useState(false);
  const uploadAttempt = useZipUploadAttempt();
  const preserveDraftRef = useRef(false);
  const resumeLoadIdRef = useRef(0);
  const [folderSelection, setFolderSelection] = useState<FolderSelection | null>(null);

  const clearStep1RetryState = () => {
    setSaveError(null);
    setSaveNotice(null);
  };

  const cancelZipUpload = () => {
    uploadAttempt.cancel();
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
    fixationGeometry: createEmptyFixationScreenGeometry(),
    stimulusPlacements: [],
  });

  const updateProjectName = (name: string) => {
    clearStep1RetryState();
    setFormData(prev => ({ ...prev, projectName: name }));
  };

  const updateDescription = (description: string) => {
    clearStep1RetryState();
    setFormData(prev => ({ ...prev, description }));
  };

  const updateFixationGeometry = (fixationGeometry: FixationScreenGeometryInput) => {
    clearStep1RetryState();
    setFormData((prev) => ({ ...prev, fixationGeometry }));
  };

  const syncStimulusPlacementPaths = (paths: string[]) => {
    clearStep1RetryState();
    setFormData((prev) => {
      const existing = new Map(
        prev.stimulusPlacements.map((placement) => [placement.sourceEntryPath, placement]),
      );
      return {
        ...prev,
        stimulusPlacements: paths.map(
          (path) => existing.get(path) ?? createEmptyStimulusPlacementDraft(path),
        ),
      };
    });
  };

  const updateStimulusPlacement = (
    sourceEntryPath: string,
    update: Partial<StimulusPlacementDraft>,
  ) => {
    clearStep1RetryState();
    setFormData((prev) => ({
      ...prev,
      stimulusPlacements: prev.stimulusPlacements.map((placement) =>
        placement.sourceEntryPath === sourceEntryPath
          ? { ...placement, ...update, sourceEntryPath }
          : placement,
      ),
    }));
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
      uploadedZip: null,
      folderPath: files?.[0] ? getFileRelativePath(files[0]).split("/")[0] : "",
    }))
  }

  const setFolderStructureSelection = (selection: FolderSelection | null) => {
    clearStep1RetryState();
    setFolderSelection(selection);
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

  const updateScenaryAois = (scenaryId: string, aois: ProjectFormData["scenaries"][number]["aois"]) => {
    setFormData((prev) => ({
      ...prev,
      scenaries: prev.scenaries.map((scenary) =>
        scenary.id === scenaryId ? { ...scenary, aois } : scenary
      ),
    }));
  };

  const canGoNext = () => {
    const geometry = formData.fixationGeometry;
    const geometryIsValid = !geometry?.enabled || [
      geometry.widthPx,
      geometry.heightPx,
      geometry.widthCm,
      geometry.heightCm,
      geometry.viewingDistanceCm,
    ].every((value) => Number.isFinite(Number(value)) && Number(value) > 0);
    const placementsAreValid = formData.stimulusPlacements.every(
      isStimulusPlacementDraftValid,
    );

    switch (currentStep) {
      case 1:
        // `experimentFolderFiles` stays null while Step 1 still has unanswered
        // structure questions, so this also gates on the clarification flow.
        return (
          formData.projectName.trim() !== "" &&
          !!formData.experimentFolderFiles?.length &&
          !!folderSelection &&
          geometryIsValid &&
          placementsAreValid
        )
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

    const attempt = uploadAttempt.begin();
    if (!attempt) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveNotice(null);
    setSaveProgressMessage("Creando proyecto borrador...");

    let projectIdForUpload = draftProjectId;
    let uploadCommitted = formData.uploadedZip?.ingestion_status === "READY";

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
        if (!attempt.isCurrent()) return;
        attempt.assertActive();
        setDraftProjectId(created.id);
      } else {
        await ProjectsApi.update(projectIdForUpload, {
          name: formData.projectName,
          description: formData.description.trim(),
          status: "draft",
        });
      }

      attempt.assertActive();
      let uploadedZipResult = uploadCommitted ? formData.uploadedZip! : null;
      if (!uploadedZipResult) {
        updateProgress("Empaquetando carpeta del experimento...");
        const zipFile = await packageExperimentFolder(formData.experimentFolderFiles, attempt.signal);
        attempt.assertActive();

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

        attempt.startPolling(projectIdForUpload, (snapshot) => {
          const totalBytes = Math.max(0, snapshot.total_bytes || 0);
          const uploadedBytes = Math.max(0, snapshot.uploaded_bytes || 0);

          if (totalBytes <= 0 && snapshot.phase !== "completed" && snapshot.phase !== "failed") {
            updateProgress("Preparando sincronización en Google Drive...");
            return;
          }

          const { percent, speed_mbps: speedMbps = null, eta_seconds: etaSeconds = null } = snapshot;

          setZipUploadPercent(percent);
          setZipUploadBytes({ loaded: uploadedBytes, total: totalBytes });
          setZipUploadSpeedMbps(speedMbps);
          setZipUploadEtaSeconds(etaSeconds);
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

        });

        preserveDraftRef.current = true;
        attempt.markRequestStarted(projectIdForUpload);
        uploadedZipResult = await ProjectsApi.uploadZipWithProgress(
          projectIdForUpload,
          zipFile,
          (progress) => {
            if (!attempt.isCurrent() || attempt.signal.aborted) return;
            if (progress.phase === "uploading") {
              updateProgress(`Enviando experimento al backend... ${progress.percent}%`);
              return;
            }

            if (progress.phase === "processing") {
              return;
            }

          },
          attempt.signal,
          folderSelection,
          formData.fixationGeometry,
          serializeStimulusPlacements(formData.stimulusPlacements),
          attempt.id,
        );

        attempt.markRequestCompleted();
        if (!attempt.isCurrent()) return;
        if (uploadedZipResult.ingestion_status !== "READY") {
          throw new Error("La ingesta no se completó en backend. Verifica estructura y contenido.");
        }
        uploadCommitted = true;
        setFormData((prev) => ({ ...prev, uploadedZip: uploadedZipResult }));
      }

      const detail = await ProjectsApi.get(projectIdForUpload);

      if (!attempt.isCurrent()) return;
      const { sensors: detectedSensors, participants: detectedParticipants } =
        detectedUploadMetadata(uploadedZipResult, formData.participants);

      setFormData((prev) => ({
        ...prev,
        uploadedZip: uploadedZipResult,
        scenaries: buildStep4ImageScenaries(detail),
        sensors: detectedSensors,
        participants: detectedParticipants,
      }));

      // The ingestion transaction already persisted the detected metadata.
      if (!attempt.isCurrent()) return;
      setCurrentStep(2);
      setSaveProgressMessage(null);
      setSaveNotice("Carpeta procesada correctamente. Puedes continuar con la configuración.");
    } catch (error) {
      if (!attempt.isCurrent()) return;
      // A rejected request or a failed follow-up read never proves that the
      // server has not published data. Retain the draft for recovery.
      if (!uploadCommitted) setFormData((prev) => ({ ...prev, uploadedZip: null }));
      // The backend re-validates structure independently. If it still finds the
      // archive ambiguous, surface its questions instead of a generic failure
      // and send the user back to Step 1 to answer them.
      const clarification = asUploadClarification(error);
      if (clarification) {
        setSaveNotice(null);
        setSaveError(
          [clarification.message, ...clarification.questions.map((q) => q.message)].join(" ")
        );
        setFolderSelection(null);
        setFormData((prev) => ({ ...prev, uploadedZip: null, experimentFolderFiles: null }));
        setCurrentStep(1);
        return;
      }

      const rawErrorMessage = getErrorMessage(error, "Error procesando carpeta");
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

    } finally {
      const isCurrent = attempt.isCurrent();
      uploadAttempt.finish(attempt);
      if (isCurrent) {
        setIsSaving(false);
        setSaveProgressMessage(null);
        setIsZipUploadInProgress(false);
        setZipUploadPercent(null);
        setZipUploadBytes(null);
        setZipUploadSpeedMbps(null);
        setZipUploadEtaSeconds(null);
        setZipDriveProcessingSeconds(null);
        toast.dismiss(STEP1_LOADING_TOAST_ID);
        onStep1Complete?.();
      }
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
    resumeLoadIdRef.current += 1;
    uploadAttempt.reset();
    preserveDraftRef.current = false;
    setIsSaving(false);
    setIsZipUploadInProgress(false);
    toast.dismiss(STEP1_LOADING_TOAST_ID);
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
      fixationGeometry: createEmptyFixationScreenGeometry(),
      stimulusPlacements: [],
    });
    setDraftProjectId(null);
    setIsResumedDraft(false);
    setFolderSelection(null);
  };

  const discardDraftProject = async () => {
    if (!draftProjectId) return;

    // Never delete a project that is being resumed from the cards list.
    if (isResumedDraft || preserveDraftRef.current) {
      setDraftProjectId(null);
      return;
    }

    // Never delete if step 1 already completed — files are in Drive and the
    // user should be able to resume via "Continuar" from the projects list.
    const ingestionStatus = formData.uploadedZip?.ingestion_status;
    if (ingestionStatus === "READY" || ingestionStatus === "PROCESSING") {
      setDraftProjectId(null);
      return;
    }

    try {
      await ProjectsApi.delete(draftProjectId);
    } catch (error) {
      console.warn("[CreateProjectWizard] failed to delete draft project", { draftProjectId, error });
    } finally {
      setDraftProjectId(null);
    }
  };

  const openForResume = async (project: Project) => {
    reset();
    const resumeLoadId = resumeLoadIdRef.current;
    setDraftProjectId(project.id);

    // Step 1 was never completed (upload interrupted or never started) —
    // open the wizard at step 1 so the user can re-upload the folder.
    const ing = String(project.ingestionStatus || "").toUpperCase();
    if (ing !== "READY") {
      setFormData({
        projectName: project.name,
        description: project.description || "",
        status: "draft",
        folderPath: "",
        experimentFolderFiles: null,
        uploadedZip: null,
        sensors: [],
        participants: initialParticipants,
        scenaries: initialscenaries,
        fixationGeometry: createEmptyFixationScreenGeometry(),
        stimulusPlacements: [],
      });
      setCurrentStep(1);
      // isResumedDraft=true prevents deletion on cancel (project already existed)
      setIsResumedDraft(true);
      setIsOpen(true);
      return;
    }

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
      fixationGeometry: createEmptyFixationScreenGeometry(),
      stimulusPlacements: [],
    };

    try {
      const detail = await ProjectsApi.get(project.id);
      if (resumeLoadId !== resumeLoadIdRef.current) return;

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
      setIsResumedDraft(true);
      setIsOpen(true);
    } catch (error) {
      if (resumeLoadId !== resumeLoadIdRef.current) return;
      console.warn("[CreateProjectWizard] openForResume could not load full project detail", {
        projectId: project.id,
        error,
      });
      setFormData(baseFormData);
      setCurrentStep(2);
      setIsResumedDraft(true);
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

      updates.push(ProjectsApi.setAois(draftProjectId, serializeScenaryAois(formData.scenaries)));

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
    } catch (e) {
      const rawErrorMessage = getErrorMessage(e, "Error guardando proyecto");
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

    }
  };

  return {
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
  };
};
