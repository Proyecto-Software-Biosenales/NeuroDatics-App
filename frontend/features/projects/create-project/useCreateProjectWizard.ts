"use client";

import { useRef, useState } from "react";
import type {
  ProjectFormData,
  SensorType,
  ParticipantData,
  ParticipantField,
  FixationScreenGeometryInput,
} from "./types";
import {
  createEmptyFixationScreenGeometry,
  participantDataFromApi,
  participantToApi,
  resolveFixationGeometry,
} from "./types";
import { useScreenSettings } from "@/features/settings/screenSettings";
import type { Project } from "@/features/projects/types";
import { isSensorType, toProject } from "@/features/projects/projectMapping";
import { describeFailure } from "@/features/projects/projectErrors";
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
import { resolveScenarioImageUrl } from "../driveFallbackUrl";
import { storageCopy } from "../storageCopy";
import { PreExperimentApi } from "../pre-experiment/api";
import type { PlanningParticipant, PreExperimentEnvelope } from "../pre-experiment/types";
import {
  assignedParticipant,
  linkParticipants,
  mirroredParticipant,
  repeatedDocuments,
  suggestedAssignments,
} from "../edit/participants";
import { newPlanningParticipant } from "../pre-experiment/PlanningParticipants";

/** The preparation of a pre-experiment that receives its folder, and who of it is who in the data. */
export type WizardPreparation = {
  envelope: PreExperimentEnvelope;
  /** The participants as read from the data, before any took the details of one of the preparation. */
  detected: ParticipantData[];
  /** Participant of the preparation → code read from the data. Those left out stay only in the preparation. */
  assignments: Record<string, string>;
};

/** The preparation of a project, or null when it has no participants to assign. Reading it is not required to
 *  continue: the editor can assign them later. */
const readPreparation = async (projectId: string, detected: ParticipantData[]): Promise<WizardPreparation | null> => {
  try {
    const envelope = await PreExperimentApi.get(projectId);
    if (!envelope.config.participants.length) return null;
    return { envelope, detected, assignments: suggestedAssignments(envelope.config.participants, detected) };
  } catch (error) {
    console.warn("[CreateProjectWizard] could not read the preparation", { projectId, error });
    return null;
  }
};

/** A participant of the data assigned to one of the preparation, with the notes the preparation keeps of it. */
const withPlanned = (participant: ParticipantData, planned: PlanningParticipant): ParticipantData => ({
  ...assignedParticipant(participant, planned),
  notes: planned.notes,
});

/** The participants read from the data, each assigned one taking the details of the preparation. */
const withAssignments = (preparation: WizardPreparation): ParticipantData[] => {
  const planned = new Map(preparation.envelope.config.participants.map((item) => [item.id, item]));
  const byCode = new Map(Object.entries(preparation.assignments).map(([id, code]) => [code, planned.get(id)]));
  return preparation.detected.map((participant) => {
    const item = byCode.get(participant.id);
    return item ? withPlanned(participant, item) : participant;
  });
};

const assignmentLinks = (preparation: WizardPreparation | null) =>
  Object.fromEntries(Object.entries(preparation?.assignments ?? {}).map(([id, code]) => [code, id]));

/** Keeps the preparation's copy of each assigned participant equal to what was saved with the data, notes included.
 *  Notes live only in the preparation, so a participant of the data with notes and no copy gets one. A failure is
 *  not one of the project: the editor pairs them by document and keeps them equal on the next change. */
const savePreparation = async (projectId: string, preparation: WizardPreparation | null, participants: ParticipantData[]) => {
  if (!preparation && !participants.some((participant) => participant.notes?.trim())) return;
  try {
    const envelope = preparation?.envelope ?? (await PreExperimentApi.get(projectId));
    const links = preparation ? assignmentLinks(preparation) : linkParticipants(participants, envelope.config.participants);
    const byPlanned = new Map(participants.filter((participant) => links[participant.id]).map((participant) => [links[participant.id], participant]));
    const updated = envelope.config.participants.map((item) => {
      const participant = byPlanned.get(item.id);
      return participant ? { ...item, ...mirroredParticipant(participant), notes: participant.notes ?? item.notes } : item;
    });
    const created = participants
      .filter((participant) => !links[participant.id] && participant.notes?.trim())
      .map((participant) => ({ ...newPlanningParticipant(), ...mirroredParticipant(participant), notes: participant.notes ?? "" }));
    const next = [...updated, ...created];
    if (JSON.stringify(next) === JSON.stringify(envelope.config.participants)) return;
    await PreExperimentApi.save(projectId, envelope.revision, { ...envelope.config, participants: next });
  } catch (error) {
    console.warn("[CreateProjectWizard] the preparation keeps its own copy of the participants", { projectId, error });
  }
};

const STEP1_LOADING_TOAST_ID = "create-project-step1-drive-sync";

const initialParticipants: ParticipantData[] = [];

const initialscenaries: ProjectFormData["scenaries"] = [];

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
  const savedScreen = useScreenSettings()?.screen ?? null;
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
  const [preparation, setPreparation] = useState<WizardPreparation | null>(null);

  const clearStep1RetryState = () => {
    setSaveError(null);
    setSaveNotice(null);
  };

  const cancelZipUpload = () => {
    uploadAttempt.cancel();
    setSaveProgressMessage(storageCopy.cancellingUpload);
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

  const normalizeParticipants = (participants: ParticipantData[]) => participants.map(participantToApi)

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

  const updateParticipant = (id: string, field: ParticipantField, value: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.map(p => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  };

  /** Assigns a participant of the preparation the one of the data it is, or none. The one it leaves goes back to
   *  what was read from the data, and the one it takes gets the preparation's details. */
  const assignParticipant = (plannedId: string, code: string | null) => {
    if (!preparation) return;
    const planned = preparation.envelope.config.participants.find((item) => item.id === plannedId);
    const previous = preparation.assignments[plannedId];
    if (!planned || previous === code) return;
    if (code && Object.entries(preparation.assignments).some(([id, taken]) => taken === code && id !== plannedId)) return;
    const assignments = { ...preparation.assignments };
    if (code) assignments[plannedId] = code;
    else delete assignments[plannedId];
    const detected = new Map(preparation.detected.map((participant) => [participant.id, participant]));
    setPreparation({ ...preparation, assignments });
    setFormData((prev) => ({
      ...prev,
      participants: prev.participants.map((participant) => {
        const original = detected.get(participant.id);
        if (participant.id === code && original) return withPlanned(original, planned);
        if (participant.id === previous && original) return original;
        return participant;
      }),
    }));
  };

  /** A document two cards share: a participant left unassigned has the document of one of the data. */
  const repeatedParticipantDocument = preparation
    ? repeatedDocuments(formData.participants, preparation.envelope.config.participants, assignmentLinks(preparation)).first
    : null;

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
        return hasValidParticipants() && !repeatedParticipantDocument;
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
    setSaveProgressMessage("Creando el proyecto…");

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
        updateProgress("Preparando la carpeta…");
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
        updateProgress("Subiendo datos del experimento…");
        setIsZipUploadInProgress(true);

        attempt.startPolling(projectIdForUpload, (snapshot) => {
          const totalBytes = Math.max(0, snapshot.total_bytes || 0);
          const uploadedBytes = Math.max(0, snapshot.uploaded_bytes || 0);

          if (totalBytes <= 0 && snapshot.phase !== "completed" && snapshot.phase !== "failed") {
            updateProgress(storageCopy.preparingSync);
            return;
          }

          const { percent, speed_mbps: speedMbps = null, eta_seconds: etaSeconds = null } = snapshot;

          setZipUploadPercent(percent);
          setZipUploadBytes({ loaded: uploadedBytes, total: totalBytes });
          setZipUploadSpeedMbps(speedMbps);
          setZipUploadEtaSeconds(etaSeconds);
          setZipDriveProcessingSeconds(snapshot.elapsed_seconds ?? 0);
          if (snapshot.phase === "canceling") {
            updateProgress("Cancelando la subida…");
          } else if (percent >= 99 && snapshot.phase !== "completed") {
            updateProgress(storageCopy.finalizingSync);
          } else {
            toast.loading(`Procesando archivos de «${formData.projectName}» · ${percent}%`, {
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
              updateProgress(`Subiendo datos del experimento… ${progress.percent}%`);
              return;
            }

            if (progress.phase === "processing") {
              return;
            }

          },
          attempt.signal,
          folderSelection,
          resolveFixationGeometry(formData.fixationGeometry, savedScreen),
          serializeStimulusPlacements(formData.stimulusPlacements),
          attempt.id,
        );

        attempt.markRequestCompleted();
        if (!attempt.isCurrent()) return;
        if (uploadedZipResult.ingestion_status !== "READY") {
          throw new Error("No se pudieron procesar los datos. Revisa la carpeta.");
        }
        uploadCommitted = true;
        setFormData((prev) => ({ ...prev, uploadedZip: uploadedZipResult }));
      }

      const detail = await ProjectsApi.get(projectIdForUpload);

      if (!attempt.isCurrent()) return;
      const { sensors: detectedSensors, participants: detectedParticipants } =
        detectedUploadMetadata(uploadedZipResult, preparation?.detected ?? formData.participants);
      // Only a project that existed before its folder (a pre-experiment) can have a preparation.
      const prepared = isResumedDraft ? await readPreparation(projectIdForUpload, detectedParticipants) : null;
      if (!attempt.isCurrent()) return;

      setPreparation(prepared);
      setFormData((prev) => ({
        ...prev,
        uploadedZip: uploadedZipResult,
        scenaries: buildStep4ImageScenaries(detail),
        sensors: detectedSensors,
        participants: prepared ? withAssignments(prepared) : detectedParticipants,
      }));

      // The ingestion transaction already persisted the detected metadata.
      if (!attempt.isCurrent()) return;
      setCurrentStep(2);
      setSaveProgressMessage(null);
      setSaveNotice("Carpeta procesada.");
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

      const { cancelled: wasCanceled, message: errorMessage } = describeFailure(error, "No se pudo procesar la carpeta.");
      setSaveNotice(null);
      setSaveError(wasCanceled ? null : errorMessage);

      if (wasCanceled) {
        setSaveNotice("Subida cancelada.");
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
    setPreparation(null);
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
      await ProjectsApi.remove(draftProjectId);
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
        .filter(isSensorType);

      const detectedParticipants: ParticipantData[] = (detail.participants || []).map((p) =>
        participantDataFromApi(p, (p.sex as ParticipantData["sex"] | null) ?? null),
      );

      const detectedScenaries = buildStep4ImageScenaries(detail);
      const prepared = await readPreparation(project.id, detectedParticipants);
      if (resumeLoadId !== resumeLoadIdRef.current) return;

      setPreparation(prepared);
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
        participants: prepared ? withAssignments(prepared) : detectedParticipants,
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
      setSaveError("Primero sube y procesa la carpeta del experimento.");
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
      updateProgress("Guardando sensores y participantes…");
      if (formData.sensors.length > 0) {
        await ProjectsApi.setSensors(draftProjectId, formData.sensors as string[]);
      }

      if (formData.participants.length > 0) {
        const normalizedParticipants = normalizeParticipants(formData.participants);
        await ProjectsApi.setParticipants(draftProjectId, normalizedParticipants);
      }
      await savePreparation(draftProjectId, preparation, formData.participants);

      await ProjectsApi.setAois(draftProjectId, serializeScenaryAois(formData.scenaries));

      updateProgress("Finalizando la configuración del proyecto…");
      await ProjectsApi.finalize(draftProjectId);

      const finalized = await ProjectsApi.get(draftProjectId);

      const newProject: Project = {
        ...toProject(finalized),
        id: draftProjectId,
        description: finalized.description ?? formData.description,
        status: "active",
        sensors: formData.sensors,
        participants: formData.participants.length,
      };

      onProjectCreated?.(newProject);
      setIsSaveCompleted(true);
      setSaveProgressMessage("Listo. Cerrando…");
      await new Promise((resolve) => setTimeout(resolve, 900));
      toast.success(`Proyecto «${finalized.name}» creado.`);
      setIsOpen(false);
      reset();
    } catch (e) {
      const { message: errorMessage, needsDriveRenewal } = describeFailure(e, "No se pudo guardar el proyecto.");

      console.error("[CreateProjectWizard] saveProject failed", {
        step: saveProgressMessage,
        error: e,
        normalizedError: errorMessage,
      });

      setSaveNotice(null);
      setSaveError(
        needsDriveRenewal || !saveProgressMessage
          ? errorMessage
          : `No se pudo guardar el proyecto. Falló el paso: ${saveProgressMessage}`
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
    preparation,
    assignParticipant,
    repeatedParticipantDocument,
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
    hasDraftProject: !!draftProjectId,
    isResumedDraft,
  };
};
