"use client"
import { useRef, useState } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Info,
  Monitor,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectsApi } from "../api/projectsApi"
import type { Project } from "../types"
import {
  emptyConfig,
  phaseLabel,
  validateParticipants,
  validateQuestionnaire,
  validateScreen,
  type Phase,
  type PreExperimentConfig,
} from "./types"
import { planningError } from "./api"
import { ApiError } from "@/lib/api/apiFetch"
import { PlanningParticipants } from "./PlanningParticipants"
import { PlanningScreen } from "./PlanningScreen"
import { PlanningQuestionnaire } from "./PlanningQuestionnaire"

type Step = "project" | "participants" | "screen" | "questionnaires"
type StepInfo = {
  id: Step
  label: string
  title: string
  description: string
  icon: LucideIcon
}

const steps: StepInfo[] = [
  {
    id: "project",
    label: "Proyecto",
    title: "Datos del proyecto",
    description: "Ponle un nombre para reconocerlo. Es lo único obligatorio.",
    icon: FileText,
  },
  {
    id: "participants",
    label: "Participantes",
    title: "Participantes",
    description: "Registra a quienes harán el experimento, si ya los conoces.",
    icon: UsersRound,
  },
  {
    id: "screen",
    label: "Pantalla",
    title: "Pantalla y datos relevantes",
    description: "Describe el equipo y las condiciones en que se presentarán los estímulos.",
    icon: Monitor,
  },
  {
    id: "questionnaires",
    label: "Cuestionarios",
    title: "Cuestionarios",
    description: "Prepara las preguntas que responderán antes y después del experimento.",
    icon: ClipboardList,
  },
]

const phases = ["before", "after"] as const

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

const hasScreenData = (config: PreExperimentConfig) =>
  !!config.notes.trim() ||
  Object.values(config.screen).some((value) =>
    typeof value === "string" ? !!value.trim() : value !== null
  )

function stepStatus(step: Step, name: string, config: PreExperimentConfig) {
  switch (step) {
    case "project":
      return name.trim() ? "Listo" : "Obligatorio"
    case "participants":
      return config.participants.length
        ? plural(config.participants.length, "agregado", "agregados")
        : "Opcional"
    case "screen":
      return hasScreenData(config) ? "Con datos" : "Opcional"
    case "questionnaires": {
      const active = phases.filter((phase) => config.questionnaires[phase].enabled).length
      return active ? plural(active, "activo", "activos") : "Opcional"
    }
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
      return phases.some((phase) => config.questionnaires[phase].enabled)
  }
}

function stepErrors(name: string, config: PreExperimentConfig) {
  return {
    project: name.trim() ? null : "Escribe el nombre del proyecto.",
    participants: validateParticipants(config),
    screen: validateScreen(config),
    questionnaires:
      validateQuestionnaire(config, "before") ?? validateQuestionnaire(config, "after"),
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
        <TabsList
          aria-label="Secciones del pre-experimento"
          className="grid h-auto w-full grid-cols-4 gap-1 rounded-xl p-1 group-data-horizontal/tabs:h-auto"
        >
          {steps.map((item) => {
            const Icon = item.icon
            const invalid = attempted && !!errors[item.id]
            const filled = stepFilled(item.id, name, config)
            return (
              <TabsTrigger
                key={item.id}
                value={item.id}
                disabled={busy}
                className="h-auto min-w-0 flex-col gap-1 rounded-lg px-0.5 py-2 whitespace-normal sm:px-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                <span className="relative">
                  <Icon aria-hidden className="size-4" />
                  {(invalid || filled) && (
                    <span
                      aria-hidden
                      className={`absolute -top-1.5 -right-2 flex size-3 items-center justify-center rounded-full ${
                        invalid ? "bg-destructive" : "bg-foreground text-background"
                      }`}
                    >
                      {!invalid && <Check className="size-2" strokeWidth={4} />}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate text-[10px] sm:text-sm">
                  {item.label}
                </span>
                <span
                  className={`hidden text-[11px] font-normal sm:block ${
                    invalid ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {invalid ? "Revisar" : stepStatus(item.id, name, config)}
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{current.title}</h3>
          <p className="text-sm text-muted-foreground">{current.description}</p>
        </div>

        <fieldset disabled={busy} className="min-w-0">
          <legend className="sr-only">{current.title}</legend>
          <TabsContent value="project" className="space-y-5">
            <div className="space-y-4">
              <Label className="block space-y-1.5 text-sm">
                <span>Nombre del proyecto *</span>
                <Input
                  value={name}
                  placeholder="Ej: Atención visual en anuncios"
                  aria-invalid={attempted && !!errors.project}
                  onChange={(event) => {
                    setName(event.target.value)
                    if (attempted) setError(null)
                  }}
                />
              </Label>
              <Label className="block space-y-1.5 text-sm">
                <span>Descripción (opcional)</span>
                <Textarea
                  value={description}
                  placeholder="¿Qué quieres estudiar?"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Label>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                ¿Quieres adelantar algo más? Todo es opcional.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {steps.slice(1).map((item) => {
                  const Icon = item.icon
                  const filled = stepFilled(item.id, name, config)
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      variant="outline"
                      onClick={() => setStep(item.id)}
                      className="group h-auto items-start justify-start gap-3 rounded-xl bg-card p-3 text-left font-normal whitespace-normal hover:border-foreground/40 hover:bg-muted/40 sm:flex-col"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon aria-hidden className="size-4" />
                      </span>
                      <span className="min-w-0 space-y-0.5">
                        <span className="flex items-center gap-1 text-sm font-medium">
                          {item.label}
                          <ChevronRight
                            aria-hidden
                            className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          />
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {filled ? stepStatus(item.id, name, config) : item.description}
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>
            </div>
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              No necesitas una carpeta de datos todavía. Podrás completar o
              cambiar esta información en Configuración y agregar la carpeta
              cuando tengas las grabaciones.
            </p>
          </TabsContent>

          <TabsContent value="participants">
            <PlanningParticipants value={config} onChange={change} />
          </TabsContent>

          <TabsContent value="screen">
            <PlanningScreen value={config} onChange={change} />
          </TabsContent>

          <TabsContent value="questionnaires">
            <Tabs
              value={phase}
              onValueChange={(next) => setPhase(next as Phase)}
              className="gap-4"
            >
              <TabsList
                aria-label="Momento del cuestionario"
                className="grid h-auto w-full grid-cols-2 gap-1 p-1 group-data-horizontal/tabs:h-auto"
              >
                {phases.map((item) => {
                  const questionnaire = config.questionnaires[item]
                  const invalid = attempted && !!validateQuestionnaire(config, item)
                  return (
                    <TabsTrigger
                      key={item}
                      value={item}
                      disabled={busy}
                      className="h-auto gap-2 py-1.5 whitespace-normal data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                    >
                      {phaseLabel[item]}
                      <span
                        className={`rounded-full px-1.5 text-[11px] font-normal ${
                          invalid
                            ? "bg-destructive/10 text-destructive"
                            : questionnaire.enabled
                              ? "bg-foreground text-background"
                              : "bg-muted-foreground/15"
                        }`}
                      >
                        {questionnaire.questions.length}
                        <span className="sr-only"> preguntas</span>
                      </span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
              {phases.map((item) => (
                <TabsContent key={item} value={item}>
                  <PlanningQuestionnaire
                    phase={item}
                    value={config}
                    onChange={change}
                    disabled={busy}
                  />
                </TabsContent>
              ))}
            </Tabs>
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
