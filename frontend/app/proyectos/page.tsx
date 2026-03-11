"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProjectsEmptyContainer } from "@/lib/widgets/shared/ui/organisms/ProjectsEmptyContainer"
import { ProjectsGrid } from "@/lib/widgets/shared/ui/organisms/ProjectsGrid"
import {
  CreateProjectDialog,
  useProjectsStorage,
} from "@/lib/features/create-project"

export default function ProyectosPage() {
  const { projects, addProject, removeProject } = useProjectsStorage()
  const hasProjects = projects.length > 0

  return (
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

          {hasProjects && (
            <CreateProjectDialog
              onProjectCreated={addProject}
              trigger={
                <Button className="bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors duration-200 text-sm font-medium gap-2">
                  <Plus className="w-5 h-5" />
                  Crear nuevo proyecto
                </Button>
              }
            />
          )}
        </div>

        {hasProjects ? (
          <ProjectsGrid projects={projects} onDelete={removeProject} />
        ) : (
          <div className="transition-all duration-300">
            <ProjectsEmptyContainer onProjectCreated={addProject} />
          </div>
        )}
      </div>
    </div>
  )
}
