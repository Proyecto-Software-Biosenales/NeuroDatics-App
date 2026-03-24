"use client";

import { useState } from "react";
import type { ProjectFormData, SensorType, ParticipantData } from "./types";
import type { Project } from "@/features/projects/types";
import { ProjectsApi } from "@/features/projects/api/projectsApi";
import { toast } from "sonner";


const initialParticipants: ParticipantData[] = [
  { id: "1000557085", sex: null, age: "" },
  { id: "1000187293", sex: null, age: "" },
  { id: "1023675443", sex: null, age: "" },
];

const initialscenaries = [
  { id: "1", name: "San Jeronimo", aois: [] },
  { id: "2", name: "Yom Yom", aois: [] },
  { id: "3", name: "Crem Helado", aois: [] },
];

const formatDate = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const useCreateProjectWizard = (onProjectCreated?: (project: Project) => void) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isOpen, setIsOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 👇 agrega aquí experimentZip si ya lo estás capturando desde Step1
  const [formData, setFormData] = useState<ProjectFormData>({
    projectName: "",
    description: "",
    status: "draft",
    folderPath: "",
    uploadedZip: null,
    sensors: [],
    participants: initialParticipants,
    scenaries: initialscenaries,
    experimentZip: null,
  });

  const updateProjectName = (name: string) => setFormData(prev => ({ ...prev, projectName: name }));
  const updateDescription = (description: string) => setFormData(prev => ({ ...prev, description }));
  const updateFolderPath = (path: string) => setFormData(prev => ({ ...prev, folderPath: path }));
  const setExperimentZip = (file: File | null) => {
    setFormData((prev) => ({
      ...prev,
      experimentZip: file,
      folderPath: file ? file.name : "", // para mostrar nombre en UI
    }))
  }

  const normalizeParticipants = (participants: ParticipantData[]) => {
    return participants.map(p => ({
      participant_code: p.id,
      age: p.age && !isNaN(Number(p.age)) ? Number(p.age) : null,
      sex: ["male", "female", "other"].includes(p.sex || "") ? p.sex : null
    }))
  }

  const hasValidParticipants = () => {
    if (formData.participants.length === 0) return false
    return formData.participants.every((p) => {
      const hasId = p.id.trim() !== ""
      const hasValidSex = p.sex === "male" || p.sex === "female" || p.sex === "other"
      const ageNum = Number(p.age)
      const hasValidAge = p.age.trim() !== "" && Number.isFinite(ageNum) && ageNum > 0
      return hasId && hasValidSex && hasValidAge
    })
  }

  const toggleSensor = (sensor: SensorType) => {
    setFormData(prev => ({
      ...prev,
      sensors: prev.sensors.includes(sensor) ? prev.sensors.filter(s => s !== sensor) : [...prev.sensors, sensor],
    }));
  };

  const updateParticipant = (id: string, field: "sex" | "age", value: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.map(p => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return formData.projectName.trim() !== "" && !!formData.experimentZip
      case 2:
        return formData.sensors.length > 0;
      case 3:
        return hasValidParticipants();
      default:
        return true;
    }
  };

  const nextStep = () => currentStep < 4 && canGoNext() && setCurrentStep(prev => prev + 1);
  const prevStep = () => currentStep > 1 && setCurrentStep(prev => prev - 1);

  const reset = () => {
    setCurrentStep(1);
    setSaveError(null);
    setFormData({
      projectName: "",
      description: "",
      status: "draft",
      folderPath: "",
      uploadedZip: null,
      sensors: [],
      participants: initialParticipants,
      scenaries: initialscenaries,
      experimentZip: null,
    });
  };

  // ✅ AHORA ES ASYNC y llama backend real con rollback
  const saveProject = async () => {
    if (!hasValidParticipants()) {
      setSaveError("Completa sexo y edad de todos los participantes antes de guardar.")
      return
    }

    setIsSaving(true);
    setSaveError(null);
    const loadingToastId = toast.loading("Guardando proyecto...");
    let createdProjectId: string | null = null;

    try {
      // 1) Crear proyecto real
      const created = await ProjectsApi.create({
        name: formData.projectName,
        description: formData.description.trim() || undefined,
      });
      createdProjectId = created.id;

      // 2) Subir zip a Drive (si existe)
      if (formData.experimentZip) {
        try {
          const uploadedZipResult = await ProjectsApi.uploadZip(createdProjectId, formData.experimentZip);
          
          // Almacenar resultado del upload en formData
          setFormData(prev => ({
            ...prev,
            uploadedZip: uploadedZipResult
          }));

          if (uploadedZipResult.ingestion_status === "FAILED") {
            throw new Error("La ingesta del ZIP fallo en backend. Verifica estructura y contenido.");
          }

          if (uploadedZipResult.csv_processing.failed > 0) {
            console.warn("Algunos CSV no pudieron procesarse durante la ingesta", uploadedZipResult.csv_processing);
          }

          console.log(
            `ZIP ingested successfully: files=${uploadedZipResult.counts.files_uploaded}, images=${uploadedZipResult.counts.images}, videos=${uploadedZipResult.counts.videos}, csv=${uploadedZipResult.counts.csv}`
          );
        } catch (error) {
          // Rollback: eliminar proyecto creado
          try {
            await ProjectsApi.delete(createdProjectId);
          } catch (rollbackError) {
            console.error("Error during rollback:", rollbackError);
          }
          throw new Error(`Error subiendo archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
      }
    
      // 3) Sensores
      if (formData.sensors.length > 0) {
        await ProjectsApi.setSensors(createdProjectId, formData.sensors as string[]);
      }

      // 4) Participantes (sin PII) - normalizar datos
      if (formData.participants.length > 0) {
        const normalizedParticipants = normalizeParticipants(formData.participants);
        await ProjectsApi.setParticipants(createdProjectId, normalizedParticipants);
      }

      // 5) (Opcional) scenaries/aois cuando lo conectes
      // await ProjectsApi.setScenaries(createdProjectId, ...)
      // await ProjectsApi.setAois(createdProjectId, ...)
      
      // 6) Finalizar proyecto
      await ProjectsApi.finalize(createdProjectId);

      // 7) Actualiza UI (grid)
      const newProject: Project = {
        id: createdProjectId,
        name: created.name,
        description: created.description ?? formData.description,
        status: (created.status?.toLowerCase() as Project["status"]) || formData.status,
        createdAt: formatDate(created.created_at),
        sensors: formData.sensors,
        participants: formData.participants.length,
      };

      onProjectCreated?.(newProject);
      toast.success(`Proyecto "${created.name}" creado correctamente.`, {
        id: loadingToastId,
      });
      setIsOpen(false);
      reset();
    } catch (e: any) {
      console.error("Error saving project:", e);
      setSaveError(e?.message ?? "Error guardando proyecto");
      toast.error("No se pudo guardar el proyecto.", {
        id: loadingToastId,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    currentStep,
    formData,
    isOpen,
    setIsOpen,
    updateProjectName,
    updateDescription,
    updateFolderPath,
    toggleSensor,
    updateParticipant,
    canGoNext,
    nextStep,
    prevStep,
    reset,
    saveProject,
    isSaving,
    saveError,
    setExperimentZip,
  };
};