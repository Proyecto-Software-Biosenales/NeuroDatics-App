"use client"

import { useState } from "react"
import type { Project } from "@/features/projects/types"

export const useSelectedProject = (projects: Project[]) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) || null

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId)
  }

  const clearSelection = () => {
    setSelectedProjectId("")
  }

  return {
    selectedProject,
    selectedProjectId,
    selectProject,
    clearSelection,
    hasSelection: !!selectedProject,
  }
}
