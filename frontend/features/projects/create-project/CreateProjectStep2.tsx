"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

import { Brain, Zap, Eye } from "lucide-react"
import type { SensorType } from "./types"

interface CreateProjectStep2Props {
  selectedSensors: SensorType[]
  onToggleSensor: (sensor: SensorType) => void
  autoDetectedSensors?: SensorType[]
}

const sensors = [
  {
    id: "EEG" as const,
    title: "Electroencefalógrafo",
    description: "Registra la actividad eléctrica cerebral.",
    icon: Brain,
  },
  {
    id: "GSR" as const,
    title: "Sensor Galvánico",
    description: "Registra la conductancia de la piel.",
    icon: Zap,
  },
  {
    id: "EyeTracker" as const,
    title: "Eye tracker",
    description: "Rastreo mirada y fijaciones en pantalla.",
    icon: Eye,
  },
]

export const CreateProjectStep2 = ({
  selectedSensors,
  onToggleSensor,
  autoDetectedSensors = [],
}: CreateProjectStep2Props) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Sensores utilizados
        </h3>
        <p className="text-sm text-muted-foreground">
          Selecciona los sensores utilizados en este proyecto
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sensors.map((sensor) => {
          const isSelected = selectedSensors.includes(sensor.id)
          const Icon = sensor.icon

          return (
            <Label
              key={sensor.id}
              htmlFor={`project-sensor-${sensor.id}`}
              className={`relative block cursor-pointer p-6 rounded-xl border-2 transition-colors text-left ${
                isSelected
                  ? "border-foreground bg-muted"
                  : "border-border bg-card hover:border-foreground/40"
              }`}
            >
              <Checkbox id={`project-sensor-${sensor.id}`} checked={isSelected} onCheckedChange={() => onToggleSensor(sensor.id)} aria-label={sensor.title} className="absolute right-3 top-3" />

              <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-foreground" strokeWidth={2} />
              </div>

              <h4 className="text-base font-semibold text-foreground mb-2">
                {sensor.title}
              </h4>

              <p className="text-sm text-muted-foreground leading-relaxed">
                {sensor.description}
              </p>

              {autoDetectedSensors.includes(sensor.id) && (
                <Badge variant="secondary" className="mt-2">
                  Auto-detectado
                </Badge>
              )}
            </Label>
          )
        })}
      </div>
    </div>
  )
}
