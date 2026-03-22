"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProjectsEmptyContainer } from "@/features/projects/components/ProjectsEmptyContainer"
import { ProjectsGrid } from "@/features/projects/components/ProjectsGrid"
import { AuthGuard } from "@/features/auth/components/AuthGuard"
import {
  CreateProjectDialog,
  useProjectsStorage,
} from "@/features/projects/create-project"

export default function ProyectosPage() {
  const { projects, addProject, updateProject, removeProject, loading, error } = useProjectsStorage()
  const hasProjects = projects.length > 0

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
              trigger={
                <Button className="bg-black text-white px-6 py-5 rounded-lg hover:bg-gray-700 transition-colors duration-200 text-sm font-medium gap-2">
                  <Plus className="w-5 h-5" />
                  Crear nuevo proyecto
                </Button>
              }
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
                <ProjectsGrid projects={projects} onDelete={removeProject} onEdit={updateProject} />
              ) : (
                <div className="transition-all duration-300">
                  <ProjectsEmptyContainer onProjectCreated={addProject} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
