"use client"
import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ProjectsApi } from "../api/projectsApi"
import type { Project } from "../types"
import { emptyConfig, validateConfig } from "./types"
import { planningError } from "./api"
import { PreExperimentEditor } from "./PreExperimentEditor"
import { ApiError } from "@/lib/api/apiFetch"
import { PlanningSection } from "./PlanningControls"

export function PreExperimentCreateForm({
  onCreated,
  onCancel,
  onBusyChange,
}: {
  onCreated: (project: Project) => void
  onCancel: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [config, setConfig] = useState(emptyConfig)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const create = async () => {
    if (inFlight.current) return
    const validation = !name.trim()
      ? "Escribe el nombre del proyecto."
      : validateConfig(config)
    if (validation) {
      setError(validation)
      return
    }
    inFlight.current = true
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      const project = await ProjectsApi.create({
        name: name.trim(),
        description: description.trim(),
        status: "draft",
        pre_experiment: config,
      })
      onCreated({
        id: project.id,
        name: project.name,
        description: project.description ?? undefined,
        status: "draft",
        ingestionStatus: "PENDING",
        createdAt: new Date(
          project.created_at || Date.now()
        ).toLocaleDateString("es-CO"),
        sensors: [],
        participants: 0,
        isPreExperiment: true,
        planningParticipantsCount:
          project.planning_participants_count ?? config.participants.length,
      })
    } catch (failure) {
      setError(
        failure instanceof ApiError ? failure.message : planningError(failure)
      )
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">
        Organiza datos y cuestionarios sin una carpeta. Solo el nombre es
        obligatorio; podrás completar todo lo demás desde Configuración.
      </p>
      <fieldset disabled={busy} className="space-y-3">
        <Label className="block space-y-1 text-sm">
          Nombre del proyecto *
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Label>
        <Label className="block space-y-1 text-sm">
          Descripción (opcional)
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Label>
      </fieldset>
      <PlanningSection title="Agregar información y cuestionarios ahora (opcional)">
        <PreExperimentEditor
          value={config}
          onChange={setConfig}
          disabled={busy}
        />
      </PlanningSection>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button type="button" disabled={busy} onClick={() => void create()}>
          {busy ? "Creando…" : "Crear pre-experimento"}
        </Button>
      </div>
    </div>
  )
}
