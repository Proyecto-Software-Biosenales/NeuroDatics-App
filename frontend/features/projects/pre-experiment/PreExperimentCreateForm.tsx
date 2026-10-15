"use client"
import { useEffect, useRef, useState } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Info,
  Monitor,
  NotebookPen,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { SectionTabs } from "../components/SectionTabs"
import { ProjectsApi } from "../api/projectsApi"
import type { Project } from "../types"
import {
  emptyConfig,
  validateParticipants,
  validateQuestionnaire,
  validateScreen,
  withoutEmptyNotes,
  withScreenDefaults,
  type Phase,
  type PreExperimentConfig,
} from "./types"
import { planningError } from "./api"
import { ApiError } from "@/lib/api/apiFetch"
import { useScreenSettings } from "@/features/settings/screenSettings"
import { PlanningParticipants } from "./PlanningParticipants"
import { PlanningScreen } from "./PlanningScreen"
import { PlanningQuestionnaires } from "./PlanningQuestionnaires"
import { PlanningNotes } from "./PlanningNotes"
import { hasScreenData, noteCount, plural, questionCount } from "./summary"

type Step = "project" | "participants" | "screen" | "questionnaires" | "notes"
type StepInfo = {
  id: Step
  label: string
  icon: LucideIcon
}

const steps: StepInfo[] = [
  { id: "project", label: "Proyecto", icon: FileText },
  { id: "participants", label: "Participantes", icon: UsersRound },
  { id: "questionnaires", label: "Cuestionarios", icon: ClipboardList },
  { id: "screen", label: "Pantalla", icon: Monitor },
  { id: "notes", label: "Notas", icon: NotebookPen },
]

const phases = ["before", "after"] as const

/** What a tab already holds; empty tabs show nothing instead of "Opcional". */
function stepStatus(step: Step, config: PreExperimentConfig) {
  switch (step) {
    case "project":
      return null
    case "participants":
      return config.participants.length
        ? plural(config.participants.length, "participante", "participantes")
        : null
    case "screen":
      return hasScreenData(config) ? "Con datos" : null
    case "questionnaires": {
      const count = questionCount(config)
      return count ? plural(count, "pregunta", "preguntas") : null
    }
    case "notes":
      return noteCount(config) ? plural(noteCount(config), "nota", "notas") : null
  }
}

function stepFilled(step: Step, name: string, config: PreExperimentConfig) {
  switch (step) {
    case "project":
      return !!name.trim()
    case "participants":
      return config.participants.length > 0
    case "screen":
      return hasScreenData(config)
    case "questionnaires":
      return questionCount(config) > 0
    case "notes":
      return noteCount(config) > 0
  }
}

function stepErrors(name: string, config: PreExperimentConfig) {
  return {
    project: name.trim() ? null : "Escribe el nombre del proyecto.",
    participants: validateParticipants(config),
    screen: validateScreen(config),
    questionnaires:
      validateQuestionnaire(config, "before") ?? validateQuestionnaire(config, "after"),
    notes: null,
  } satisfies Record<Step, string | null>
}

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
  const [step, setStep] = useState<Step>("project")
  const [phase, setPhase] = useState<Phase>("before")
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const globalScreen = useScreenSettings()?.screen
  // The screen starts as the one saved in Configuración, unless it was already typed.
  useEffect(() => {
    setConfig((current) => withScreenDefaults(current, globalScreen))
  }, [globalScreen])
  const errors = stepErrors(name, config)
  const index = steps.findIndex((item) => item.id === step)
  const current = steps[index]
  const create = async () => {
    if (inFlight.current) return
    const invalid = steps.find((item) => errors[item.id])
    if (invalid) {
      setAttempted(true)
      setError(errors[invalid.id])
      setStep(invalid.id)
      if (invalid.id === "questionnaires")
        setPhase(validateQuestionnaire(config, "before") ? "before" : "after")
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
        pre_experiment: withoutEmptyNotes(config),
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
  const change = (next: PreExperimentConfig) => {
    setConfig(next)
    if (attempted) setError(null)
  }
  return (
    <div className="space-y-5 py-2">
      <Tabs
        value={step}
        onValueChange={(next) => setStep(next as Step)}
        className="gap-5"
      >
        <SectionTabs
          label="Secciones del pre-experimento"
          disabled={busy}
          tabs={steps.map((item) => {
            const invalid = attempted && !!errors[item.id]
            return {
              id: item.id,
              label: item.label,
              icon: item.icon,
              invalid,
              filled: stepFilled(item.id, name, config),
              status: stepStatus(item.id, config),
            }
          })}
        />

        <fieldset disabled={busy} className="min-w-0">
          <legend className="sr-only">{current.label}</legend>
          <TabsContent value="project" className="space-y-5">
            <div className="space-y-4">
              <Label className="block space-y-1.5 text-sm">
                <span>Nombre del proyecto *</span>
                <Input
                  value={name}
                  aria-invalid={attempted && !!errors.project}
                  onChange={(event) => {
                    setName(event.target.value)
                    if (attempted) setError(null)
                  }}
                />
              </Label>
              <Label className="block space-y-1.5 text-sm">
                <span>Descripción</span>
                <Textarea
                  value={description}
                  placeholder="¿Qué quieres estudiar?"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Label>
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              No necesitas los datos todavía. Cuando tengas las grabaciones,
              agrega la carpeta desde la tarjeta del proyecto.
            </p>
          </TabsContent>

          <TabsContent value="participants">
            <PlanningParticipants value={config} onChange={change} />
          </TabsContent>

          <TabsContent value="screen">
            <PlanningScreen value={config} onChange={change} />
          </TabsContent>

          <TabsContent value="questionnaires">
            <PlanningQuestionnaires
              value={config}
              onChange={change}
              view={phase}
              onViewChange={(next) => setPhase(next as Phase)}
              invalidPhases={phases.filter((item) => attempted && !!validateQuestionnaire(config, item))}
              disabled={busy}
            />
          </TabsContent>

          <TabsContent value="notes">
            <PlanningNotes value={config} onChange={change} />
          </TabsContent>
        </fieldset>
      </Tabs>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 gap-2">
          {index > 0 && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setStep(steps[index - 1].id)}
            >
              <ChevronLeft aria-hidden />
              Anterior
            </Button>
          )}
          {index < steps.length - 1 && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setStep(steps[index + 1].id)}
            >
              Siguiente
              <ChevronRight aria-hidden />
            </Button>
          )}
        </div>
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
            <Check aria-hidden />
            {busy ? "Creando…" : "Crear pre-experimento"}
          </Button>
        </div>
      </div>
    </div>
  )
}
