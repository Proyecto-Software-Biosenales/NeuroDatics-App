"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
    <Select value={value} onValueChange={(val) => val && onChange(val)}>
      <SelectTrigger className="w-full flex items-center justify-between px-5 py-3.5 bg-background border border-input rounded-xl text-left text-foreground hover:border-ring hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-200">
        <SelectValue placeholder={placeholder}>
          {projects.find((project) => project.id === value)?.name ?? placeholder}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        <SelectGroup>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id} textValue={project.name}>
              <div className="flex flex-col gap-2 py-1">
                <span className="font-medium text-foreground">{project.name}</span>
                {project.sensors && project.sensors.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {project.sensors.map((sensor) => (
                      <SensorBadge key={sensor} sensor={sensor} size="sm" />
                    ))}
                  </div>
                ) : null}
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
