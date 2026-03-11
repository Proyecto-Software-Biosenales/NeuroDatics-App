import { Folder, Trash2 } from "lucide-react"
import { Card } from "../atoms/Card"
import { SensorBadge } from "../atoms/SensorBadge"
import type { Project } from "@/lib/entities/project/types"

interface ProjectsGridProps {
  projects: Project[]
  onDelete: (id: string) => void
}

export const ProjectsGrid = ({ projects, onDelete }: ProjectsGridProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => (
        <Card
          key={project.id}
          className="relative p-6 hover:shadow-lg transition-all duration-200 cursor-pointer group"
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              const confirmed = window.confirm(
                `¿Eliminar el proyecto "${project.name}"?`
              )
              if (confirmed) onDelete(project.id)
            }}
            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-red-500"
          >
            <Trash2 size={18} />
          </button>

          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-gray-200 transition-colors">
              <Folder className="w-6 h-6 text-gray-600" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">
                {project.name}
              </h3>
              <p className="text-sm text-gray-500">{project.createdAt}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
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
