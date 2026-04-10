"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { CreateProjectButton } from "@/features/projects/components/CreateProjectButton"
import { ProjectsEmptyContainer } from "@/features/projects/components/ProjectsEmptyContainer"
import { ProjectsGrid } from "@/features/projects/components/ProjectsGrid"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import type { Project, ProjectStatus } from "@/features/projects/types"
import {
  CreateProjectDialog,
  useProjectsStorage,
} from "@/features/projects/create-project"

type ProjectFilter = "all" | ProjectStatus

export default function ProyectosPage() {
  const { projects, addProject, updateProject, removeProject, loading, error, refreshProjects } = useProjectsStorage()
  const [statusFilter, setStatusFilter] = useState<ProjectFilter>("all")
  const [resumeProject, setResumeProject] = useState<Project | null>(null)
  const hasProjects = projects.length > 0

  const filteredProjects = useMemo(() => {
    if (statusFilter === "all") return projects
    return projects.filter((project) => (project.status || "active") === statusFilter)
  }, [projects, statusFilter])

  const hasFilteredProjects = filteredProjects.length > 0

  const filterButtons: Array<{ value: ProjectFilter; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "draft", label: "Borradores" },
    { value: "active", label: "Activos" },
    { value: "archived", label: "Archivados" },
  ]

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-8 py-10">
          <div className="mb-10 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900 mb-3 tracking-tight">
                Proyectos
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed">
                Gestiona tus experimentos de neuromarketing y análisis de
                bioseñales.
              </p>
            </div>

              <CreateProjectDialog
                onProjectCreated={addProject}
                onStep1Complete={refreshProjects}
                resumeProject={resumeProject}
                onResumeHandled={() => setResumeProject(null)}
                trigger={<CreateProjectButton compact />}
              />
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-200 mb-4">
                  <div className="w-8 h-8 border-4 border-gray-300 border-t-black rounded-full animate-spin"></div>
                </div>
                <p className="text-gray-600">Cargando proyectos...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-6 mb-6">
              <p className="text-red-800 font-medium">{error}</p>
              <p className="text-red-700 text-sm mt-2">
                Si el problema persiste, intenta recargar la página.
              </p>
            </div>
          )}

          {/* Projects grid or empty state */}
          {!loading && (
            <>
              {hasProjects ? (
                <>
                  <div className="mb-6 flex flex-wrap items-center gap-2">
                    {filterButtons.map((filter) => {
                      const isActive = statusFilter === filter.value
                      return (
                        <Button
                          key={filter.value}
                          type="button"
                          variant={isActive ? "default" : "outline"}
                          onClick={() => setStatusFilter(filter.value)}
                          className={isActive ? "bg-black text-white hover:bg-gray-800" : ""}
                        >
                          {filter.label}
                        </Button>
                      )
                    })}
                  </div>

                  {hasFilteredProjects ? (
                    <ProjectsGrid
                      projects={filteredProjects}
                      onDelete={removeProject}
                      onEdit={updateProject}
                      onContinueDraft={setResumeProject}
                    />
                  ) : (
                    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-600">
                      No hay proyectos en este estado.
                    </div>
                  )}
                </>
              ) : (
                <div className="transition-all duration-300">
                  <ProjectsEmptyContainer onProjectCreated={addProject} onStep1Complete={refreshProjects} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
