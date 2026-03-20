"use client";
import { useEffect, useState } from "react";
import { ProjectsApi, type ApiProject } from "@/features/projects/api/projectsApi";

export function useProjectsApi() {
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const list = await ProjectsApi.list();
    setProjects(list);
    setLoading(false);
  }

  async function addProject(p: { name: string; description?: string }) {
    const created = await ProjectsApi.create(p);
    setProjects(prev => [created, ...prev]);
    return created;
  }

  async function removeProject(id: string) {
    await ProjectsApi.remove(id);
    setProjects(prev => prev.filter(x => x.id !== id));
  }

  useEffect(() => { refresh(); }, []);
  return { projects, loading, refresh, addProject, removeProject };
}