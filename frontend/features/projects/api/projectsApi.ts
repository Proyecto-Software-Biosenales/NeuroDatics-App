import { ApiError, apiFetch, apiFetchBlob, apiUploadFormWithProgress, type UploadProgress } from "@/lib/api/apiFetch";
import type { UploadedProjectZip } from "../types";
import type { FolderSelection } from "../create-project/folderStructure";

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

export type ApiProject = {
  id: string;
  name: string;
  description?: string | null;
  status?: "draft" | "active" | "archived" | string;
  ingestion_status?: string | null;
  ingestion_error?: string | null;
  drive_root_folder_id?: string | null;
  drive_root_folder_name?: string | null;
  drive_root_folder_url?: string | null;
  created_at?: string;
  updated_at?: string;
  sensors?: Array<{ id: string; sensor_type: string }>;
  participants_count?: number;
};

export type ApiProjectParticipant = {
  id: string;
  participant_code: string;
  age?: number | null;
  sex?: "male" | "female" | "other" | string | null;
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

export type ApiScenaryPayload = {
  name: string;
  type: string;
  file_id?: string | null;
  source_entry_path?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  duration_ms?: number | null;
};

export type ApiProjectScenary = {
  id: string;
  name: string;
  type?: string;
  file_id?: string | null;
  width?: number | null;
  height?: number | null;
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

  create: (payload: { name: string; description?: string; status?: "draft" | "active" | "archived" }) =>
    apiFetch<ApiProject>("/api/projects/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  get: (projectId: string) =>
    apiFetch<ApiProjectDetail>(`/api/projects/${projectId}`),

  update: (projectId: string, payload: Partial<{ name: string; description: string; status: string }>) =>
    apiFetch<ApiProject>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  remove: (projectId: string) =>
    apiFetch<DeleteProjectResult>(`/api/projects/${projectId}`, { method: "DELETE" }),

  delete: (projectId: string) =>
    apiFetch<DeleteProjectResult>(`/api/projects/${projectId}`, { method: "DELETE" }),

  uploadZip: (projectId: string, file: File, selection?: FolderSelection | null, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("file", file);
    appendSelection(form, selection);
    return apiUploadFormWithProgress<UploadedProjectZip>(
      `/api/projects/${projectId}/files/experiment-zip`,
      form,
      undefined,
      signal,
    );
  },

  uploadZipWithProgress: (
    projectId: string,
    file: File,
    onProgress?: (progress: UploadProgress) => void,
    signal?: AbortSignal,
    selection?: FolderSelection | null,
  ) => {
    const form = new FormData();
    form.append("file", file);
    appendSelection(form, selection);
    return apiUploadFormWithProgress<UploadedProjectZip>(
      `/api/projects/${projectId}/files/experiment-zip`,
      form,
      onProgress,
      signal,
    );
  },

  getZipUploadProgress: (projectId: string) =>
    apiFetch<ApiDriveUploadProgress>(`/api/projects/${projectId}/files/experiment-zip/progress`),

  cancelZipUpload: (projectId: string) =>
    apiFetch<{ message: string }>(`/api/projects/${projectId}/files/experiment-zip/cancel`, {
      method: "POST",
    }),

  deleteZip: (projectId: string) =>
    apiFetch<{ message: string }>(`/api/projects/${projectId}/files/experiment-zip`, {
      method: "DELETE",
    }),

  setSensors: (projectId: string, sensors: string[]) =>
    apiFetch<void>(`/api/projects/${projectId}/sensors`, {
      method: "PUT",
      body: JSON.stringify({ sensors }),
    }),

  setParticipants: (
    projectId: string,
    participants: Array<{ participant_code: string; age?: number | null; sex?: "male" | "female" | "other" | null }>
  ) =>
    apiFetch<void>(`/api/projects/${projectId}/participants`, {
      method: "PUT",
      body: JSON.stringify({ participants }),
    }),

  setScenaries: (projectId: string, scenaries: ApiScenaryPayload[]) =>
    apiFetch<void>(`/api/projects/${projectId}/scenaries`, {
      method: "PUT",
      body: JSON.stringify({ scenaries }),
    }),

  setAois: (projectId: string, aois: ApiAoiPayload[]) =>
    apiFetch<void>(`/api/projects/${projectId}/aois`, {
      method: "PUT",
      body: JSON.stringify({ aois }),
    }),

  finalize: (projectId: string) =>
    apiFetch<void>(`/api/projects/${projectId}/finalize`, { method: "POST" }),

  fetchScenarioImage: (projectId: string, fileId: string) =>
    apiFetchBlob(`/api/projects/${projectId}/files/${fileId}/image`),

  fetchScenarioPreview: (projectId: string, fileId: string, timeS = 0) => {
    const params = new URLSearchParams();
    if (timeS > 0) params.set("time_s", String(timeS));
    const query = params.toString();
    return apiFetchBlob(`/api/projects/${projectId}/files/${fileId}/preview${query ? `?${query}` : ""}`);
  },
};
