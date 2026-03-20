import { apiFetch } from "@/lib/api/apiFetch";

export type ApiProject = {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export const ProjectsApi = {
  list: () => apiFetch<ApiProject[]>("/api/projects/"),

  create: (payload: { name: string; description?: string }) =>
    apiFetch<ApiProject>("/api/projects/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  get: (projectId: string) =>
    apiFetch<ApiProject>(`/api/projects/${projectId}`),

  update: (projectId: string, payload: Partial<{ name: string; description: string; status: string }>) =>
    apiFetch<ApiProject>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  remove: (projectId: string) =>
    apiFetch<void>(`/api/projects/${projectId}`, { method: "DELETE" }),

  delete: (projectId: string) =>
    apiFetch<void>(`/api/projects/${projectId}`, { method: "DELETE" }),

  uploadZip: (projectId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ drive_file_id: string }>(`/api/projects/${projectId}/files/experiment-zip`, {
      method: "POST",
      body: form,
    });
  },

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

  setScenaries: (projectId: string, scenaries: any[]) =>
    apiFetch<void>(`/api/projects/${projectId}/scenaries`, {
      method: "PUT",
      body: JSON.stringify({ scenaries }),
    }),

  setAois: (projectId: string, aois: any[]) =>
    apiFetch<void>(`/api/projects/${projectId}/aois`, {
      method: "PUT",
      body: JSON.stringify({ aois }),
    }),

  finalize: (projectId: string) =>
    apiFetch<void>(`/api/projects/${projectId}/finalize`, { method: "POST" }),
};