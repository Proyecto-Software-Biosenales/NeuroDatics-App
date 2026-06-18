import { Card } from "../../../components/ui/Card"
import { ProjectSelect } from "../../../features/projects/components/ProjectSelect"
import { SelectedProjectInfo } from "./SelectedProjectInfo"
import type { Project } from "@/features/projects/types"

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
        <div className="flex-shrink-0 w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
          <span className="text-foreground font-semibold text-lg">1</span>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Selección de proyecto
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
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
