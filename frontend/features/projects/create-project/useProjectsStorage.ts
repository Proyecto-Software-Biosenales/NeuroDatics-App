"use client"

import { useState, useEffect } from "react"
import type { Project } from "@/features/projects/types"

const STORAGE_KEY = "neurodatics_projects"

const mockProjects: Project[] = [
  {
    id: "1",
    name: "Helados colombianos",
    createdAt: "14/12/2025",
    sensors: ["EyeTracker"],
    participants: 3,
  },
  {
    id: "2",
    name: "Publicidad Coca-cola",
    createdAt: "28/11/2025",
    sensors: ["EEG", "GSR", "EyeTracker"],
    participants: 1,
  },
]

export const useProjectsStorage = () => {
  const [projects, setProjects] = useState<Project[]>(() => {
    if (typeof window === "undefined") return mockProjects
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return Array.isArray(parsed) && parsed.length > 0
          ? parsed
          : mockProjects
      }
    } catch {
      // fall through to defaults
    }
    return mockProjects
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
    } catch {
      // ignore storage errors
    }
  }, [projects])

  const addProject = (project: Project) => {
    setProjects((prev) => [project, ...prev])
  }

  const removeProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  return { projects, addProject, removeProject }
}
