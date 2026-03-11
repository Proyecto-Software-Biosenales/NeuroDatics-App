"use client"

import { useState } from "react"
import type { SensorType } from "@/lib/entities/project/types"

export const useSelectedSensors = () => {
  const [selectedSensors, setSelectedSensors] = useState<SensorType[]>([])

  const toggleSensor = (sensor: SensorType) => {
    setSelectedSensors((prev) =>
      prev.includes(sensor)
        ? prev.filter((s) => s !== sensor)
        : [...prev, sensor]
    )
  }

  const clearSensors = () => {
    setSelectedSensors([])
  }

  return {
    selectedSensors,
    toggleSensor,
    clearSensors,
    hasSensors: selectedSensors.length > 0,
  }
}
