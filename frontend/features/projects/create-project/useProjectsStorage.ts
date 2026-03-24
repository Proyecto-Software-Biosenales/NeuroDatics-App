"use client"

import { useState, useEffect } from "react"
import type { Project } from "@/features/projects/types"
import { ProjectsApi } from "@/features/projects/api/projectsApi"

const STORAGE_KEY = "neurodatics_projects"

const normalizeStatus = (status: unknown): "draft" | "active" | "archived" => {
  if (typeof status !== "string") return "draft"
  const normalized = status.toLowerCase()
  if (normalized === "active" || normalized === "archived") return normalized
  return "draft"
}

const formatDate = (iso?: string): string => {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("es-ES")
}

const formatDateTime = (iso?: string): string => {
  if (!iso) return ""
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const hasRealUpdate = (updatedIso?: string, createdIso?: string): boolean => {
  if (!updatedIso) return false
  if (!createdIso) return true

  const updatedMs = new Date(updatedIso).getTime()
  const createdMs = new Date(createdIso).getTime()

  if (!Number.isFinite(updatedMs) || !Number.isFinite(createdMs)) {
    return updatedIso !== createdIso
  }

  return Math.abs(updatedMs - createdMs) > 1000
}

export const useProjectsStorage = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load projects from backend on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Fetch from backend
        const backendProjects = await ProjectsApi.list()
        
        // Transform backend response to frontend format if needed
        const formattedProjects: Project[] = backendProjects.map((bp: any) => ({
          id: bp.id,
          name: bp.name,
          description: bp.description,
          status: normalizeStatus(bp.status),
          createdAt: formatDate(bp.created_at),
          updatedAt: hasRealUpdate(bp.updated_at, bp.created_at)
            ? formatDateTime(bp.updated_at)
            : undefined,
          sensors: bp.sensors && bp.sensors.length > 0 
            ? bp.sensors.map((s: any) => s.sensor_type || s)
            : [],
          participants: bp.participants_count || 0,
        }))
        
        setProjects(formattedProjects)
        // Sync to localStorage for offline support
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formattedProjects))
      } catch (err) {
        // If backend fails, try localStorage fallback
        try {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored) {
            const parsed = JSON.parse(stored)
            setProjects(Array.isArray(parsed) ? parsed : [])
          } else {
            setProjects([])
          }
          setError("No se pudieron cargar los proyectos del servidor")
        } catch {
          setProjects([])
          setError("Error al cargar los proyectos")
        }
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  const addProject = (project: Project) => {
    setProjects((prev) => [project, ...prev])
    // Sync to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([project, ...projects]))
    } catch {
      // ignore storage errors
    }
  }

  const removeProject = async (id: string) => {
    // Call backend to delete from database first
    const deleteResult = await ProjectsApi.remove(id)
    // Then update local state
    setProjects((prev) => prev.filter((p) => p.id !== id))
    // Sync to localStorage
    try {
      const updated = projects.filter((p) => p.id !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // ignore storage errors
    }

    return deleteResult
  }

  const updateProject = (updatedProject: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)))
    try {
      const updated = projects.map((p) => (p.id === updatedProject.id ? updatedProject : p))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // ignore storage errors
    }
  }

  return { projects, addProject, updateProject, removeProject, loading, error }
}
