"use client"
import { useId } from "react"
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  ClipboardList,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PlanningSelect } from "./PlanningControls"
import type { Phase, PlanningQuestion, PreExperimentConfig, Questionnaire } from "./types"

const newQuestion = (): PlanningQuestion => ({
  id: crypto.randomUUID(),
  type: "open_text",
  prompt: "",
  required: true,
  options: [],
})

const typeOptions = [
  { value: "open_text", label: "Respuesta abierta" },
  { value: "multiple_choice", label: "Selección múltiple" },
  { value: "true_false", label: "Verdadero o falso" },
]

const typeIcon = { open_text: Type, multiple_choice: CheckSquare, true_false: ToggleLeft }

const phaseWord: Record<Phase, string> = { before: "antes", after: "después" }

const phaseHint: Record<Phase, string> = {
  before: "Se responde antes de comenzar: datos previos, estado inicial, expectativas.",
  after: "Se responde al terminar: percepción, recuerdo, satisfacción.",
}

/** Editor for one questionnaire (before or after the experiment). */
export function PlanningQuestionnaire({
  phase,
  value,
  onChange,
  disabled = false,
}: {
  phase: Phase
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
  disabled?: boolean
}) {
  const id = useId()
  const questionnaire = value.questionnaires[phase]
  const update = (change: Partial<Questionnaire>) =>
    onChange({
      ...value,
      questionnaires: {
        ...value.questionnaires,
        [phase]: { ...questionnaire, ...change },
      },
    })
  const updateQuestion = (id: string, change: Partial<PlanningQuestion>) =>
    update({
      questions: questionnaire.questions.map((question) =>
        question.id === id ? { ...question, ...change } : question
      ),
    })
  const move = (index: number, offset: -1 | 1) => {
    const questions = [...questionnaire.questions]
    ;[questions[index], questions[index + offset]] = [
      questions[index + offset],
      questions[index],
    ]
    update({ questions })
  }
  const showEditor = questionnaire.enabled || questionnaire.questions.length > 0
  return (
    <div className="space-y-4">
      <Label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
          questionnaire.enabled ? "border-foreground bg-muted/60" : "bg-card hover:bg-muted/40"
        }`}
      >
        <Checkbox
          className="mt-0.5"
          disabled={disabled}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-hint`}
          checked={questionnaire.enabled}
          onCheckedChange={(checked) => update({ enabled: checked === true })}
        />
        <span className="space-y-1">
          <span id={`${id}-title`} className="block font-medium">
            Usar cuestionario {phaseWord[phase]}
          </span>
          <span
            id={`${id}-hint`}
            className="block text-xs leading-relaxed font-normal text-muted-foreground"
          >
            {phaseHint[phase]}
          </span>
        </span>
      </Label>
      {!showEditor && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          <ClipboardList aria-hidden className="size-6" />
          Activa el cuestionario para empezar a escribir preguntas.
        </div>
      )}
      {showEditor && (
        <>
          <Label className="block space-y-1.5 text-sm">
            <span>Título del cuestionario</span>
            <Input
              value={questionnaire.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </Label>
          {!questionnaire.enabled && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Las preguntas se conservan, pero este cuestionario no estará
              disponible para responder.
            </p>
          )}
          {!questionnaire.questions.length && (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Todavía no hay preguntas. Agrega la primera.
            </p>
          )}
          <ol className="space-y-3">
            {questionnaire.questions.map((question, index) => {
              const Icon = typeIcon[question.type]
              const last = index === questionnaire.questions.length - 1
              return (
                <li key={question.id}>
                  <fieldset className="min-w-0 rounded-xl border bg-card">
                    <legend className="sr-only">Pregunta {index + 1}</legend>
                    <div className="flex items-center gap-2 border-b px-4 py-2.5">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                        {index + 1}
                      </span>
                      <Icon aria-hidden className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm font-medium">
                        Pregunta {index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Subir"
                        aria-label={`Subir pregunta ${index + 1}`}
                        disabled={disabled || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Bajar"
                        aria-label={`Bajar pregunta ${index + 1}`}
                        disabled={disabled || last}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Quitar"
                        aria-label={`Quitar pregunta ${index + 1}`}
                        onClick={() =>
                          update({
                            questions: questionnaire.questions.filter(
                              (item) => item.id !== question.id
                            ),
                          })
                        }
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                    <div className="space-y-3 p-4">
                      <Label className="block space-y-1.5 text-sm">
                        <span>Enunciado</span>
                        <Textarea
                          value={question.prompt}
                          placeholder="Escribe la pregunta…"
                          onChange={(event) =>
                            updateQuestion(question.id, { prompt: event.target.value })
                          }
                        />
                      </Label>
                      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
                        <Label className="block space-y-1.5 text-sm">
                          <span>Tipo de pregunta</span>
                          <PlanningSelect
                            label="Tipo de pregunta"
                            disabled={disabled}
                            value={question.type}
                            options={typeOptions}
                            onChange={(selected) => {
                              const type = selected as PlanningQuestion["type"]
                              updateQuestion(question.id, {
                                type,
                                options:
                                  type === "multiple_choice"
                                    ? question.options.length
                                      ? question.options
                                      : [
                                          { id: crypto.randomUUID(), label: "" },
                                          { id: crypto.randomUUID(), label: "" },
                                        ]
                                    : [],
                              })
                            }}
                          />
                        </Label>
                        <Label className="flex h-8 items-center gap-2 text-sm font-normal">
                          <Checkbox
                            disabled={disabled}
                            checked={question.required}
                            onCheckedChange={(checked) =>
                              updateQuestion(question.id, { required: checked === true })
                            }
                          />
                          Respuesta obligatoria
                        </Label>
                      </div>
                      {question.type === "open_text" && (
                        <p className="text-xs text-muted-foreground">
                          El participante escribirá su respuesta con sus propias palabras.
                        </p>
                      )}
                      {question.type === "true_false" && (
                        <p className="text-xs text-muted-foreground">
                          El participante elegirá entre «Verdadero» y «Falso».
                        </p>
                      )}
                      {question.type === "multiple_choice" && (
                        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            El participante podrá marcar una o varias opciones.
                          </p>
                          {question.options.map((option, optionIndex) => (
                            <div key={option.id} className="flex items-center gap-2">
                              <span aria-hidden className="size-4 shrink-0 rounded border bg-background" />
                              <Input
                                aria-label={`Opción ${optionIndex + 1}`}
                                placeholder={`Opción ${optionIndex + 1}`}
                                value={option.label}
                                onChange={(event) =>
                                  updateQuestion(question.id, {
                                    options: question.options.map((item) =>
                                      item.id === option.id
                                        ? { ...item, label: event.target.value }
                                        : item
                                    ),
                                  })
                                }
                              />
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                title="Quitar opción"
                                aria-label={`Quitar opción ${optionIndex + 1}`}
                                onClick={() =>
                                  updateQuestion(question.id, {
                                    options: question.options.filter(
                                      (item) => item.id !== option.id
                                    ),
                                  })
                                }
                              >
                                <X aria-hidden />
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              updateQuestion(question.id, {
                                options: [
                                  ...question.options,
                                  { id: crypto.randomUUID(), label: "" },
                                ],
                              })
                            }
                          >
                            <Plus aria-hidden />
                            Agregar opción
                          </Button>
                        </div>
                      )}
                    </div>
                  </fieldset>
                </li>
              )
            })}
          </ol>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              update({ questions: [...questionnaire.questions, newQuestion()] })
            }
          >
            <Plus aria-hidden />
            Agregar pregunta {phaseWord[phase]}
          </Button>
        </>
      )}
    </div>
  )
}
