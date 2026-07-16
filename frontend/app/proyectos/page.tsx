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
      <div className="min-h-[calc(100vh-var(--app-nav-height))] bg-gray-50 dark:bg-black">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 xl:px-8 xl:py-10">
          <div className="mb-6 flex items-start justify-between gap-4 xl:mb-10">
            <div>
              <h1 className="mb-2 text-2xl font-semibold text-foreground tracking-tight xl:mb-3 xl:text-3xl">
                Proyectos
              </h1>
              <p className="max-w-3xl text-base text-muted-foreground leading-relaxed xl:text-lg">
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
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                  <div className="w-8 h-8 border-4 border-border border-t-foreground rounded-full animate-spin"></div>
                </div>
                <p className="text-muted-foreground">Cargando proyectos...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-6 mb-6">
              <p className="text-red-800 dark:text-red-400 font-medium">{error}</p>
              <p className="text-red-700 dark:text-red-500 text-sm mt-2">
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
                          className={isActive ? "bg-foreground text-background hover:bg-foreground/90" : ""}
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
                    <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
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
