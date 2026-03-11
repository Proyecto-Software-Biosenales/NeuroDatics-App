import { Folder } from "lucide-react"
import { Card } from "../atoms/Card"
import { SensorBadge } from "../atoms/SensorBadge"
import { DeleteProjectDialog } from "../molecules/DeleteProjectDialog"
import type { Project } from "@/lib/entities/project/types"

interface ProjectsGridProps {
  projects: Project[]
  onDelete: (id: string) => Promise<void> | void
}

export const ProjectsGrid = ({ projects, onDelete }: ProjectsGridProps) => {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <Card
          key={project.id}
          className="group relative cursor-pointer p-6 transition-all duration-200 hover:shadow-lg"
        >
          <DeleteProjectDialog
            projectId={project.id}
            projectName={project.name}
            onDelete={onDelete}
          />

          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 transition-colors group-hover:bg-gray-200">
              <Folder className="h-6 w-6 text-gray-600" />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="mb-1 truncate text-lg font-semibold text-gray-900">
                {project.name}
              </h3>
              <p className="text-sm text-gray-500">{project.createdAt}</p>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {project.sensors.map((sensor) => (
              <SensorBadge key={sensor} sensor={sensor} size="sm" />
            ))}
          </div>

          {project.participants !== undefined && (
            <div className="text-sm text-gray-600">
              {project.participants} participante
              {project.participants !== 1 ? "s" : ""}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}