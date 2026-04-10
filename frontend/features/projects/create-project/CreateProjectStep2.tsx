"use client"

import { Brain, Zap, Eye, Check } from "lucide-react"
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
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Sensores utilizados
        </h3>
        <p className="text-sm text-gray-600">
          Selecciona los sensores utilizados en este proyecto
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sensors.map((sensor) => {
          const isSelected = selectedSensors.includes(sensor.id)
          const Icon = sensor.icon

          return (
            <button
              key={sensor.id}
              type="button"
              onClick={() => onToggleSensor(sensor.id)}
              className={`relative p-6 rounded-xl border-2 transition-all duration-200 text-left ${
                isSelected
                  ? "border-black bg-gray-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-black rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" strokeWidth={3} />
                </div>
              )}

              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-gray-700" strokeWidth={2} />
              </div>

              <h4 className="text-base font-semibold text-gray-900 mb-2">
                {sensor.title}
              </h4>

              <p className="text-sm text-gray-600 leading-relaxed">
                {sensor.description}
              </p>

              {autoDetectedSensors.includes(sensor.id) && (
                <span className="mt-2 inline-block text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  Auto-detectado
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
