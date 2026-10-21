"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import type { Project } from "@/features/projects/types"
import { ProjectsApi } from "@/features/projects/api/projectsApi"
import { toProject } from "@/features/projects/projectMapping"
import { purgeLegacyProjectsMirror } from "@/lib/auth/sessionStore"

const playStep1ReadySound = () => {
  try {
    const ctx = new AudioContext()
    const notes = [523.25, 659.25, 783.99] // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = "sine"
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.13
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
      osc.start(start)
      osc.stop(start + 0.35)
    })
    setTimeout(() => ctx.close(), 1200)
  } catch {
    // Web Audio API may not be available in some environments
  }
}

const normalizeIngestionStatus = (status?: string): string | undefined => {
  if (!status) return undefined
  return status.toUpperCase()
}

const isDraftStep1Processing = (project: Project): boolean => {
  if (project.status !== "draft") return false
  const ing = normalizeIngestionStatus(project.ingestionStatus)
  // Only poll when the backend is ACTIVELY processing (file was fully received).
  // PENDING means the upload was never completed — no backend work is running.
  return ing === "PROCESSING"
}

export const useProjectsStorage = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const projectsRef = useRef<Project[]>([])
  const previousStatusByIdRef = useRef<Map<string, string | undefined>>(new Map())
  const hasProcessingDraftRef = useRef(false)

  const refreshProjects = async () => {
    try {
      const backendProjects = await ProjectsApi.list()
      const formattedProjects: Project[] = backendProjects.map(toProject)
      setProjects(formattedProjects)
      setError(null)
    } catch {
      // Silent - do not overwrite error state
    }
  }

  // Load projects from backend on mount
  useEffect(() => {
    // Older versions kept a copy of the list in this browser, shared by whoever signed in next.
    purgeLegacyProjectsMirror()
    const loadProjects = async () => {
      try {
        setLoading(true)
        setError(null)
        setProjects((await ProjectsApi.list()).map(toProject))
      } catch {
        // With the API down the list is unknown: show the error, never a stored list.
        setProjects([])
        setError("No se pudieron cargar los proyectos.")
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

        const nextProjects: Project[] = backendProjects.map(toProject)

        for (const project of nextProjects) {
          const previous = previousMap.get(project.id)
          const current = normalizeIngestionStatus(project.ingestionStatus)
          if (
            (previous === "PENDING" || previous === "PROCESSING") &&
            current === "READY" &&
            project.status === "draft"
          ) {
            toast.success(
              `Carpeta de «${project.name}» procesada. Puedes continuar.`,
              { position: "top-center" }
            )
            playStep1ReadySound()
          }
        }

        setProjects(nextProjects)
        setError(null)
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
    // The API just answered with this project, so an earlier load error no longer describes the page.
    setError(null)
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === project.id)
      return exists
        ? prev.map((p) => (p.id === project.id ? project : p))
        : [project, ...prev]
    })
  }

  const removeProject = async (id: string) => {
    // Call backend to delete from database first
    const deleteResult = await ProjectsApi.remove(id)
    // Then update local state
    setProjects((prev) => prev.filter((p) => p.id !== id))

    return deleteResult
  }

  const updateProject = (updatedProject: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)))
  }

  return { projects, addProject, updateProject, removeProject, refreshProjects, loading, error }
}
