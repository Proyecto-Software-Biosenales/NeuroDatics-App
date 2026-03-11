import { EmptyState } from "../molecules/EmptyState"
import { Button } from "@/components/ui/button"
import { CreateProjectDialog } from "@/lib/features/create-project"
import type { Project } from "@/lib/entities/project/types"

interface ProjectsEmptyContainerProps {
  onProjectCreated: (project: Project) => void
}

export const ProjectsEmptyContainer = ({
  onProjectCreated,
}: ProjectsEmptyContainerProps) => {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gradient-to-br from-gray-50 to-white transition-all duration-300 hover:border-gray-400">
      <CreateProjectDialog
        onProjectCreated={onProjectCreated}
        trigger={
          <EmptyState
            title="No hay proyectos creados"
            description="Comienza creando tu primer proyecto experimental para analizar datos de EEG, GSR y Eye Tracking"
            icon="folder-open"
            action={
              <Button className="bg-black text-white px-8 py-6 rounded-lg hover:bg-gray-700 transition-colors duration-200 text-base font-medium">
                Crear nuevo proyecto
              </Button>
            }
          />
        }
      />
    </div>
  )
}
