import { EmptyState } from "./EmptyState"
import { CreateProjectDialog } from "@/features/projects/create-project"
import { CreateProjectButton } from "./CreateProjectButton"
import type { Project } from "@/features/projects/types"

interface ProjectsEmptyContainerProps {
  onProjectCreated: (project: Project) => void
  onStep1Complete?: () => void
}

export const ProjectsEmptyContainer = ({
  onProjectCreated,
  onStep1Complete,
}: ProjectsEmptyContainerProps) => {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gradient-to-br from-gray-50 to-white transition-all duration-300 hover:border-gray-400">
      <EmptyState
        title="No hay proyectos creados"
        description="Comienza creando tu primer proyecto experimental para analizar datos de EEG, GSR y Eye Tracking"
        icon="folder-open"
        action={
          <CreateProjectDialog
            onProjectCreated={onProjectCreated}
            onStep1Complete={onStep1Complete}
            trigger={
              <CreateProjectButton showIcon={false} />
            }
          />
        }
      />
    </div>
  )
}
