import { analyticsMutation } from "@/features/analytics/analyticsCache";
import { ApiError, apiFetch, apiFetchBlob, apiUploadFormWithProgress, type UploadProgress } from "@/lib/api/apiFetch";
import { getStimulusImageUrl, getStimulusPreviewUrl } from "./stimulusUrls";
import type { UploadedProjectZip } from "../types";
import type { FolderSelection } from "../create-project/folderStructure";
import type { FixationScreenGeometryInput } from "../create-project/types";
import type { PreExperimentConfig } from "../pre-experiment/types";

export type ApiStimulusDisplayMode = "contain" | "cover" | "crop" | "fullscreen";

export type ApiStimulusViewport = {
  left_px: number;
  top_px: number;
  width_px: number;
  height_px: number;
  scroll_x_px?: number;
  scroll_y_px?: number;
};

export type ApiStimulusPlacement = {
  geometry_stability: "static";
  contract_version: "screen-stimulus-v1";
  screen_width_px: number;
  screen_height_px: number;
  stimulus_left_px: number;
  stimulus_top_px: number;
  stimulus_width_px: number;
  stimulus_height_px: number;
  display_mode: ApiStimulusDisplayMode;
  viewport?: ApiStimulusViewport | null;
  source?: "user_config" | "acquisition_metadata";
  contract_fingerprint?: string;
};

export type ApiStimulusPlacementEnvelope = {
  source_entry_path: string;
  placement: ApiStimulusPlacement;
};

/** Mirror of the backend `UploadClarificationResponse` (HTTP 409). */
export type ApiUploadClarification = {
  error: "structure_clarification_required";
  message: string;
  questions: Array<{
    code: string;
    field: string;
    kind: "choice" | "confirm";
    message: string;
    options: string[];
  }>;
  detected: {
    csv_files: string[];
    images_folders: string[];
    videos_folders: string[];
    acquisition_folders: string[];
  };
};

/**
 * The backend re-validates structure independently of the wizard, so a 409 can
 * still arrive (e.g. a folder edited between selection and upload).
 */
export const asUploadClarification = (error: unknown): ApiUploadClarification | null => {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const detail = error.detail as ApiUploadClarification | undefined;
  if (detail && typeof detail === "object" && detail.error === "structure_clarification_required") {
    return detail;
  }
  return null;
};

const appendSelection = (form: FormData, selection?: FolderSelection | null) => {
  if (!selection) return;
  if (selection.selectedCsvPath) form.append("selected_csv_path", selection.selectedCsvPath);
  if (selection.selectedImagesFolder) form.append("selected_images_folder", selection.selectedImagesFolder);
  if (selection.selectedVideosFolder) form.append("selected_videos_folder", selection.selectedVideosFolder);
  if (selection.selectedAcquisitionFolder) {
    form.append("selected_acquisition_folder", selection.selectedAcquisitionFolder);
  }
  if (selection.allowMissingImages) form.append("allow_missing_images", "true");
  if (selection.allowMissingVideos) form.append("allow_missing_videos", "true");
};

const appendFixationGeometry = (
  form: FormData,
  geometry?: FixationScreenGeometryInput | null,
) => {
  if (!geometry?.enabled) return;

  const widthPx = Number(geometry.widthPx);
  const heightPx = Number(geometry.heightPx);
  const widthCm = Number(geometry.widthCm);
  const heightCm = Number(geometry.heightCm);
  const values = [widthPx, heightPx, widthCm, heightCm];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Completa la geometría de pantalla con valores positivos antes de subir.");
  }

  form.append("screen_width_px", String(Math.round(widthPx)));
  form.append("screen_height_px", String(Math.round(heightPx)));
  form.append("screen_width_mm", String(widthCm * 10));
  form.append("screen_height_mm", String(heightCm * 10));
};

const appendStimulusPlacements = (
  form: FormData,
  placements?: ApiStimulusPlacementEnvelope[] | null,
) => {
  if (!placements?.length) return;
  const requestPlacements = placements.map(({ source_entry_path, placement }) => {
    const requestPlacement = { ...placement };
    delete requestPlacement.source;
    delete requestPlacement.contract_fingerprint;
    return { source_entry_path, placement: requestPlacement };
  });
  form.append("stimulus_placements_json", JSON.stringify(requestPlacements));
};

export type ApiProject = {
  id: string;
  name: string;
  description?: string | null;
  status?: "draft" | "active" | "archived" | string;
  ingestion_status?: string | null;
  ingestion_generation?: number;
  ingestion_error?: string | null;
  drive_root_folder_id?: string | null;
  drive_root_folder_name?: string | null;
  drive_root_folder_url?: string | null;
  created_at?: string;
  updated_at?: string;
  sensors?: Array<{ id: string; sensor_type: string }>;
  participants_count?: number;
  is_pre_experiment?: boolean;
  planning_participants_count?: number;
  needs_update?: boolean;
};

export type ApiProjectParticipant = {
  id: string;
  /** Extracted recording identifier; key for analytics, never edited. */
  participant_code: string;
  age?: number | null;
  sex?: "male" | "female" | "other" | string | null;
  /** Optional user-entered name. */
  name?: string | null;
  /** Corrected document, or participant_code when never corrected. */
  document?: string | null;
};

export type ApiProjectAoi = {
  id: string;
  scenaries_id?: string;
  name: string;
  color?: string;
  shape_type?: string;
  shape?: Record<string, unknown>;
};

export type ApiAoiPayload = {
  scenaries_name: string;
  name: string;
  color: string;
  shape_type: string;
  shape: {
    x: number;
    y: number;
    width: number;
    height: number;
    points?: Array<{ x: number; y: number }>;
  };
};

export type ApiProjectScenary = {
  id: string;
  name: string;
  type?: string;
  file_id?: string | null;
  width?: number | null;
  height?: number | null;
  source_entry_path?: string | null;
  stimulus_placement?: ApiStimulusPlacement | null;
  aois?: ApiProjectAoi[];
};

export type ApiProjectFile = {
  id: string;
  kind: string;
  filename: string;
  external_id?: string | null;
  source_entry_path?: string | null;
  drive_web_view_link?: string | null;
  drive_download_link?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at?: string;
};

export type ApiProjectDetail = ApiProject & {
  source_folder_name?: string | null;
  files?: ApiProjectFile[];
  participants?: ApiProjectParticipant[];
  scenaries?: ApiProjectScenary[];
};

export type DeleteProjectResult = {
  message: string;
  drive_folder_found: boolean;
  drive_folder_deleted: boolean;
};

export type ApiDriveUploadProgress = {
  upload_id?: string | null;
  phase: "idle" | "uploading" | "completed" | "failed" | "canceling" | string;
  uploaded_bytes: number;
  total_bytes: number;
  percent: number;
  speed_mbps?: number | null;
  eta_seconds?: number | null;
  elapsed_seconds?: number;
  error?: string | null;
};

export const ProjectsApi = {
  list: () => apiFetch<ApiProject[]>("/api/projects/"),

  create: (payload: { name: string; description?: string; status?: "draft" | "active" | "archived"; pre_experiment?: PreExperimentConfig }) =>
    apiFetch<ApiProject>("/api/projects/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  get: (projectId: string, signal?: AbortSignal) =>
    apiFetch<ApiProjectDetail>(`/api/projects/${projectId}`, { signal }),

  update: (projectId: string, payload: Partial<{ name: string; description: string; status: string }>) =>
    analyticsMutation(projectId, () => apiFetch<ApiProject>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    })),

  remove: (projectId: string) =>
    analyticsMutation(projectId, () => apiFetch<DeleteProjectResult>(`/api/projects/${projectId}`, { method: "DELETE" })),

  uploadZipWithProgress: (
    projectId: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    signal?: AbortSignal,
    selection?: FolderSelection | null,
    fixationGeometry?: FixationScreenGeometryInput | null,
    stimulusPlacements?: ApiStimulusPlacementEnvelope[] | null,
    uploadId?: string,
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (uploadId) form.append("upload_id", uploadId);
    appendSelection(form, selection);
    appendFixationGeometry(form, fixationGeometry);
    appendStimulusPlacements(form, stimulusPlacements);
    return analyticsMutation(projectId, () => apiUploadFormWithProgress<UploadedProjectZip>(
      `/api/projects/${projectId}/files/experiment-zip`,
      form,
      onProgress,
      signal,
    ));
  },

  getZipUploadProgress: (projectId: string, uploadId?: string, signal?: AbortSignal) =>
    apiFetch<ApiDriveUploadProgress>(`/api/projects/${projectId}/files/experiment-zip/progress${uploadId ? `?upload_id=${encodeURIComponent(uploadId)}` : ""}`, { signal }),

  cancelZipUpload: (projectId: string, uploadId?: string) =>
    apiFetch<{ message: string }>(`/api/projects/${projectId}/files/experiment-zip/cancel${uploadId ? `?upload_id=${encodeURIComponent(uploadId)}` : ""}`, {
      method: "POST",
    }),

  setSensors: (projectId: string, sensors: string[]) =>
    analyticsMutation(projectId, () => apiFetch<void>(`/api/projects/${projectId}/sensors`, {
      method: "PUT",
      body: JSON.stringify({ sensors }),
    })),

  setParticipants: (
    projectId: string,
    participants: Array<{
      participant_code: string;
      age?: number | null;
      sex?: "male" | "female" | "other" | null;
      name?: string | null;
      document?: string | null;
    }>
  ) =>
    analyticsMutation(projectId, () => apiFetch<void>(`/api/projects/${projectId}/participants`, {
      method: "PUT",
      body: JSON.stringify({ participants }),
    })),

  setAois: (projectId: string, aois: ApiAoiPayload[]) =>
    analyticsMutation(projectId, () => apiFetch<void>(`/api/projects/${projectId}/aois`, {
      method: "PUT",
      body: JSON.stringify({ aois }),
    })),

  finalize: (projectId: string) =>
    analyticsMutation(projectId, () => apiFetch<void>(`/api/projects/${projectId}/finalize`, { method: "POST" })),

  fetchScenarioImage: (projectId: string, fileId: string) =>
    apiFetchBlob(getStimulusImageUrl(projectId, fileId)),

  fetchScenarioPreview: (projectId: string, fileId: string, timeS = 0) => {
    return apiFetchBlob(getStimulusPreviewUrl(projectId, fileId, { timeS: timeS > 0 ? timeS : undefined }));
  },
};
