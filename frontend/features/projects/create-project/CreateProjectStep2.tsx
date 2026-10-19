"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { FieldHint } from "@/components/FieldHint"
import { cn } from "@/lib/utils"

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
    title: "Sensor galvánico",
    description: "Registra la conductancia de la piel.",
    icon: Zap,
  },
  {
    id: "EyeTracker" as const,
    title: "Eye tracker",
    description: "Rastreo de la mirada y las fijaciones en pantalla.",
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
      <h3 className="text-xl font-semibold text-foreground">
        Sensores utilizados
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sensors.map((sensor) => {
          const isSelected = selectedSensors.includes(sensor.id)
          const Icon = sensor.icon

          return (
            <Label
              key={sensor.id}
              htmlFor={`project-sensor-${sensor.id}`}
              className={`relative block cursor-pointer p-5 rounded-xl border-2 transition-colors text-left ${
                isSelected
                  ? "border-foreground bg-muted"
                  : "border-border bg-card hover:border-foreground/40"
              }`}
            >
              <Checkbox id={`project-sensor-${sensor.id}`} checked={isSelected} onCheckedChange={() => onToggleSensor(sensor.id)} aria-label={sensor.title} className="absolute right-3 top-3" />

              {/* On the selected card (muted) the box and the badge take the page colour, so they never vanish into it. */}
              <div className={cn("mb-4 flex size-12 items-center justify-center rounded-xl", isSelected ? "bg-background" : "bg-muted")}>
                <Icon className="w-6 h-6 text-foreground" strokeWidth={2} />
              </div>

              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-semibold text-foreground">
                  {sensor.title}
                </h4>
                <FieldHint>{sensor.description}</FieldHint>
              </div>

              {autoDetectedSensors.includes(sensor.id) && (
                <Badge variant="secondary" className={cn("mt-2", isSelected && "bg-background")}>
                  Detectado
                </Badge>
              )}
            </Label>
          )
        })}
      </div>
    </div>
  )
}
