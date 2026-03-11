"use client"

import { useState, useRef, useEffect } from "react"
import { SelectTrigger } from "../atoms/SelectTrigger"
import { SelectOption } from "../atoms/SelectOption"
import { SensorBadge } from "../atoms/SensorBadge"
import type { SensorType } from "@/lib/entities/project/types"

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
  const [isOpen, setIsOpen] = useState(false)
  const selectRef = useRef<HTMLDivElement>(null)

  const selectedProject = projects.find((p) => p.id === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (projectId: string) => {
    onChange(projectId)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={selectRef}>
      <SelectTrigger
        onClick={() => setIsOpen(!isOpen)}
        isOpen={isOpen}
        placeholder={placeholder}
      >
        {selectedProject?.name}
      </SelectTrigger>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {projects.map((project) => (
            <SelectOption
              key={project.id}
              value={project.id}
              label={project.name}
              onClick={handleSelect}
              badges={
                project.sensors && project.sensors.length > 0 ? (
                  <>
                    {project.sensors.map((sensor) => (
                      <SensorBadge key={sensor} sensor={sensor} size="sm" />
                    ))}
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
