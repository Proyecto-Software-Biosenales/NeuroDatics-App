"use client"

import { useState } from "react"
import type { ProjectFormData, SensorType, ParticipantData } from "./types"
import type { Project } from "@/lib/entities/project/types"

const initialParticipants: ParticipantData[] = [
  { id: "1000557085", sex: null, age: "" },
  { id: "1000187293", sex: null, age: "" },
  { id: "1023675443", sex: null, age: "" },
]

const initialStimuli = [
  { id: "1", name: "San Jeronimo", aois: [] },
  { id: "2", name: "Yom Yom", aois: [] },
  { id: "3", name: "Crem Helado", aois: [] },
]

const generateId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

const formatDate = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

export const useCreateProjectWizard = (
  onProjectCreated?: (project: Project) => void
) => {
  const [currentStep, setCurrentStep] = useState(1)
  const [isOpen, setIsOpen] = useState(false)
  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    folderPath: "",
    sensors: [],
    participants: initialParticipants,
    stimuli: initialStimuli,
  })

  const updateProjectName = (name: string) => {
    setFormData((prev) => ({ ...prev, projectName: name }))
  }

  const updateFolderPath = (path: string) => {
    setFormData((prev) => ({ ...prev, folderPath: path }))
  }

  const toggleSensor = (sensor: SensorType) => {
    setFormData((prev) => ({
      ...prev,
      sensors: prev.sensors.includes(sensor)
        ? prev.sensors.filter((s) => s !== sensor)
        : [...prev.sensors, sensor],
    }))
  }

  const updateParticipant = (
    id: string,
    field: "sex" | "age",
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.id === id ? { ...p, [field]: value } : p
      ),
    }))
  }

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return formData.projectName.trim() !== ""
      case 2:
        return formData.sensors.length > 0
      case 3:
        return true
      case 4:
        return true
      default:
        return false
    }
  }

  const nextStep = () => {
    if (currentStep < 4 && canGoNext()) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const reset = () => {
    setCurrentStep(1)
    setFormData({
      projectName: "",
      folderPath: "",
      sensors: [],
      participants: initialParticipants,
      stimuli: initialStimuli,
    })
  }

  const saveProject = () => {
    const newProject: Project = {
      id: generateId(),
      name: formData.projectName,
      createdAt: formatDate(new Date()),
      sensors: formData.sensors,
      participants: formData.participants.length,
    }

    if (onProjectCreated) {
      onProjectCreated(newProject)
    }

    setIsOpen(false)
    reset()
  }

  return {
    currentStep,
    formData,
    isOpen,
    setIsOpen,
    updateProjectName,
    updateFolderPath,
    toggleSensor,
    updateParticipant,
    canGoNext,
    nextStep,
    prevStep,
    reset,
    saveProject,
  }
}
