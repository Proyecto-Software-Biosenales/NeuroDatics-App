import { Card } from "../atoms/Card"
import { ProjectSelect } from "../molecules/ProjectSelect"
import { SelectedProjectInfo } from "./SelectedProjectInfo"
import type { Project } from "@/lib/entities/project/types"

interface ProjectSelectionCardProps {
  projects: Project[]
  selectedProject: Project | null
  onProjectChange: (projectId: string) => void
}

export const ProjectSelectionCard = ({
  projects,
  selectedProject,
  onProjectChange,
}: ProjectSelectionCardProps) => {
  return (
    <Card className="p-8 hover:shadow-md transition-shadow duration-300">
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <span className="text-gray-800 font-semibold text-lg">1</span>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Selección de proyecto
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Elige el proyecto del cual deseas generar un reporte
          </p>
        </div>
      </div>

      <div className="pl-14">
        <ProjectSelect
          projects={projects}
          value={selectedProject?.id || ""}
          onChange={onProjectChange}
          placeholder="Selecciona un proyecto..."
        />

        {selectedProject && (
          <SelectedProjectInfo project={selectedProject} />
        )}
      </div>
    </Card>
  )
}
