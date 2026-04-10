"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import type { Project } from "@/features/projects/types"
import { ProjectsApi } from "@/features/projects/api/projectsApi"

const STORAGE_KEY = "neurodatics_projects"

const normalizeStatus = (status: unknown): "draft" | "active" | "archived" => {
  if (typeof status !== "string") return "active"
  const normalized = status.toLowerCase()
  if (normalized === "draft" || normalized === "active" || normalized === "archived") return normalized
  return "active"
}

const normalizeIngestionStatus = (status?: string): string | undefined => {
  if (!status) return undefined
  return status.toUpperCase()
}

const isDraftStep1Processing = (project: Project): boolean => {
  if (project.status !== "draft") return false
  const ing = normalizeIngestionStatus(project.ingestionStatus)
  return ing === "PENDING" || ing === "PROCESSING"
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
  const projectsRef = useRef<Project[]>([])
  const previousStatusByIdRef = useRef<Map<string, string | undefined>>(new Map())
  const hasProcessingDraftRef = useRef(false)

  const buildProject = (bp: any): Project => ({
    id: bp.id,
    name: bp.name,
    description: bp.description,
    status: normalizeStatus(bp.status),
    ingestionStatus: bp.ingestion_status?.toUpperCase() as Project["ingestionStatus"] || undefined,
    createdAt: formatDate(bp.created_at),
    updatedAt: hasRealUpdate(bp.updated_at, bp.created_at)
      ? formatDateTime(bp.updated_at)
      : undefined,
    sensors: bp.sensors && bp.sensors.length > 0
      ? bp.sensors.map((s: any) => s.sensor_type || s)
      : [],
    participants: bp.participants_count || 0,
  })

  const refreshProjects = async () => {
    try {
      const backendProjects = await ProjectsApi.list()
      const formattedProjects: Project[] = backendProjects.map(buildProject)
      setProjects(formattedProjects)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formattedProjects))
    } catch {
      // Silent - do not overwrite error state
    }
  }

  // Load projects from backend on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Fetch from backend
        const backendProjects = await ProjectsApi.list()
        
        // Transform backend response to frontend format if needed
        const formattedProjects: Project[] = backendProjects.map(buildProject)
        
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

  useEffect(() => {
    projectsRef.current = projects
    hasProcessingDraftRef.current = projects.some(isDraftStep1Processing)
    previousStatusByIdRef.current = new Map(
      projects.map((p) => [p.id, normalizeIngestionStatus(p.ingestionStatus)])
    )
  }, [projects])

  const hasProcessingDraft = projects.some(isDraftStep1Processing)

  useEffect(() => {
    if (!hasProcessingDraftRef.current) return

    let interval: ReturnType<typeof setInterval> | null = null

    const pollProjects = async () => {
      try {
        const backendProjects = await ProjectsApi.list()
        const previousMap = previousStatusByIdRef.current

        const nextProjects: Project[] = backendProjects.map(buildProject)

        for (const project of nextProjects) {
          const previous = previousMap.get(project.id)
          const current = normalizeIngestionStatus(project.ingestionStatus)
          if (
            (previous === "PENDING" || previous === "PROCESSING") &&
            current === "READY" &&
            project.status === "draft"
          ) {
            toast.success(
              `Paso 1 completado para "${project.name}". Ya puedes continuar con los pasos 2, 3 y 4.`,
              { position: "top-center" }
            )
          }
        }

        setProjects(nextProjects)
        projectsRef.current = nextProjects
        previousStatusByIdRef.current = new Map(
          nextProjects.map((p) => [p.id, normalizeIngestionStatus(p.ingestionStatus)])
        )

        const stillProcessing = nextProjects.some(isDraftStep1Processing)
        hasProcessingDraftRef.current = stillProcessing
        if (!stillProcessing && interval) {
          clearInterval(interval)
          interval = null
        }
      } catch {
        // Ignore polling errors silently
      }
    }

    interval = setInterval(() => {
      void pollProjects()
    }, 3000)

    return () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
  }, [hasProcessingDraft])

  const addProject = (project: Project) => {
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === project.id)
      const next = exists
        ? prev.map((p) => (p.id === project.id ? project : p))
        : [project, ...prev]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
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

  return { projects, addProject, updateProject, removeProject, refreshProjects, loading, error }
}
