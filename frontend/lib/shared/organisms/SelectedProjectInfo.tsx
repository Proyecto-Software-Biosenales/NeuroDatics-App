import { FolderClosed } from "lucide-react"
import { SensorBadge } from "../atoms/SensorBadge"
import type { Project } from "@/lib/entities/project/types"

interface SelectedProjectInfoProps {
  project: Project
}

export const SelectedProjectInfo = ({ project }: SelectedProjectInfoProps) => {
  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
            <FolderClosed className="w-5 h-5 text-gray-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {project.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Fecha: {project.createdAt}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 justify-end">
          {project.sensors.map((sensor) => (
            <SensorBadge
              key={sensor}
              sensor={sensor}
              size="md"
              variant="secondary"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
