"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox"
import { SensorBadge } from "./SensorBadge"
import type { SensorType } from "@/features/projects/types"

interface Project {
  id: string
  name: string
  sensors?: SensorType[]
}

interface ProjectSelectProps {
  projects: Project[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export const ProjectSelect = ({
  projects,
  value,
  onChange,
  placeholder = "Selecciona un proyecto...",
}: ProjectSelectProps) => {
  return (
    <Combobox value={value} onValueChange={(val) => val && onChange(val)}>
      <ComboboxTrigger className="w-full flex items-center justify-between px-5 py-3.5 bg-white border border-gray-300 rounded-xl text-left text-gray-700 hover:border-gray-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-transparent transition-all duration-200">
        <ComboboxValue placeholder={placeholder} />
      </ComboboxTrigger>

      <ComboboxContent>
        <ComboboxList>
          {projects.map((project) => (
            <ComboboxItem key={project.id} value={project.id} label={project.name}>
              <div className="flex flex-col gap-2 py-1">
                <span className="font-medium text-gray-900">{project.name}</span>
                {project.sensors && project.sensors.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {project.sensors.map((sensor) => (
                      <SensorBadge key={sensor} sensor={sensor} size="sm" />
                    ))}
                  </div>
                ) : null}
              </div>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
