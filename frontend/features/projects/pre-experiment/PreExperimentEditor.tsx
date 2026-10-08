"use client"

import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Phase, PlanningQuestion, PreExperimentConfig } from "./types"
import { phaseLabel } from "./types"
import { Checkbox } from "@/components/ui/checkbox"
import { PlanningSection, PlanningSelect } from "./PlanningControls"

const newQuestion = (): PlanningQuestion => ({
  id: crypto.randomUUID(),
  type: "open_text",
  prompt: "",
  required: true,
  options: [],
})

export function PreExperimentEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
  disabled?: boolean
}) {
  const updateQuestionnaire = (
    phase: Phase,
    update: Partial<PreExperimentConfig["questionnaires"][Phase]>
  ) =>
    onChange({
      ...value,
      questionnaires: {
        ...value.questionnaires,
        [phase]: { ...value.questionnaires[phase], ...update },
      },
    })
  const updateQuestion = (
    phase: Phase,
    id: string,
    update: Partial<PlanningQuestion>
  ) =>
    updateQuestionnaire(phase, {
      questions: value.questionnaires[phase].questions.map((question) =>
        question.id === id ? { ...question, ...update } : question
      ),
    })
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <legend className="sr-only">Información del pre-experimento</legend>
      <PlanningSection
        title={`Participantes (${value.participants.length})`}
        defaultOpen={value.participants.length > 0}
      >
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Código y nombre son obligatorios al agregar un participante. Los
            demás datos son opcionales.
          </p>
          {value.participants.map((participant, index) => (
            <fieldset
              key={participant.id}
              className="space-y-3 rounded-lg border p-3"
            >
              <legend className="px-1 text-sm font-medium">
                Participante {index + 1}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["code", "Código"],
                    ["name", "Nombre del participante"],
                    ["identification_document", "Documento de identificación"],
                    ["gender", "Género"],
                  ] as const
                ).map(([key, label]) => (
                  <Label key={key} className="block space-y-1 text-sm">
                    {label}
                    {(key === "code" || key === "name") && " *"}
                    <Input
                      value={participant[key]}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          participants: value.participants.map((item) =>
                            item.id === participant.id
                              ? { ...item, [key]: event.target.value }
                              : item
                          ),
                        })
                      }
                    />
                  </Label>
                ))}
                <Label className="block space-y-1 text-sm">
                  Edad
                  <Input
                    type="number"
                    min={0}
                    max={150}
                    step={1}
                    value={participant.age ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        participants: value.participants.map((item) =>
                          item.id === participant.id
                            ? {
                                ...item,
                                age:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              }
                            : item
                        ),
                      })
                    }
                  />
                </Label>
                <Label className="block space-y-1 text-sm">
                  Notas del participante
                  <Textarea
                    value={participant.notes}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        participants: value.participants.map((item) =>
                          item.id === participant.id
                            ? { ...item, notes: event.target.value }
                            : item
                        ),
                      })
                    }
                  />
                </Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange({
                    ...value,
                    participants: value.participants.filter(
                      (item) => item.id !== participant.id
                    ),
                  })
                }
              >
                Quitar participante {index + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...value,
                participants: [
                  ...value.participants,
                  {
                    id: crypto.randomUUID(),
                    code: "",
                    name: "",
                    identification_document: "",
                    gender: "",
                    age: null,
                    notes: "",
                  },
                ],
              })
            }
          >
            Agregar participante
          </Button>
        </div>
      </PlanningSection>
      <PlanningSection title="Pantalla y datos relevantes (opcionales)">
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Label className="block space-y-1 text-sm">
            Modelo de pantalla
            <Input
              value={value.screen.model}
              onChange={(event) =>
                onChange({
                  ...value,
                  screen: { ...value.screen, model: event.target.value },
                })
              }
            />
          </Label>
          {(
            [
              ["width_px", "Ancho (px)"],
              ["height_px", "Alto (px)"],
              ["width_cm", "Ancho (cm)"],
              ["height_cm", "Alto (cm)"],
              ["viewing_distance_cm", "Distancia a la pantalla (cm)"],
            ] as const
          ).map(([key, label]) => (
            <Label key={key} className="block space-y-1 text-sm">
              {label}
              <Input
                type="number"
                min={key.endsWith("_px") ? 1 : 0.01}
                step={key.endsWith("_px") ? 1 : "any"}
                value={value.screen[key] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    screen: {
                      ...value.screen,
                      [key]:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    },
                  })
                }
              />
            </Label>
          ))}
          <Label className="block space-y-1 text-sm sm:col-span-2">
            Notas de pantalla
            <Textarea
              value={value.screen.notes}
              onChange={(event) =>
                onChange({
                  ...value,
                  screen: { ...value.screen, notes: event.target.value },
                })
              }
            />
          </Label>
          <Label className="block space-y-1 text-sm sm:col-span-2">
            Datos relevantes del experimento
            <Textarea
              value={value.notes}
              onChange={(event) =>
                onChange({ ...value, notes: event.target.value })
              }
            />
          </Label>
        </div>
      </PlanningSection>
      {(["before", "after"] as const).map((phase) => {
        const questionnaire = value.questionnaires[phase]
        return (
          <fieldset key={phase} className="space-y-4 rounded-lg border p-4">
            <legend className="px-1 font-medium">{phaseLabel[phase]}</legend>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                disabled={disabled}
                checked={questionnaire.enabled}
                onCheckedChange={(checked) =>
                  updateQuestionnaire(phase, { enabled: checked === true })
                }
              />
              Usar cuestionario {phase === "before" ? "antes" : "después"}
            </Label>
            {(questionnaire.enabled || questionnaire.questions.length > 0) && (
              <>
                <Label className="block space-y-1 text-sm">
                  Título del cuestionario
                  <Input
                    value={questionnaire.title}
                    onChange={(event) =>
                      updateQuestionnaire(phase, { title: event.target.value })
                    }
                  />
                </Label>
                {!questionnaire.enabled && (
                  <p className="text-sm text-muted-foreground">
                    Las preguntas se conservan, pero este cuestionario no estará
                    disponible para responder.
                  </p>
                )}
                {questionnaire.questions.map((question, index) => (
                  <fieldset
                    key={question.id}
                    className="min-w-0 space-y-3 rounded-lg bg-muted/30 p-3"
                  >
                    <legend className="text-sm font-medium">
                      Pregunta {index + 1}
                    </legend>
                    <Label className="block space-y-1 text-sm">
                      Enunciado
                      <Textarea
                        value={question.prompt}
                        onChange={(event) =>
                          updateQuestion(phase, question.id, {
                            prompt: event.target.value,
                          })
                        }
                      />
                    </Label>
                    <Label className="block space-y-1 text-sm">
                      Tipo de pregunta
                      <PlanningSelect
                        label="Tipo de pregunta"
                        disabled={disabled}
                        value={question.type}
                        onChange={(selected) => {
                          const type = selected as PlanningQuestion["type"]
                          updateQuestion(phase, question.id, {
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
                        options={[
                          { value: "open_text", label: "Respuesta abierta" },
                          {
                            value: "multiple_choice",
                            label: "Selección múltiple",
                          },
                          { value: "true_false", label: "Verdadero o falso" },
                        ]}
                      />
                    </Label>
                    <Label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        disabled={disabled}
                        checked={question.required}
                        onCheckedChange={(checked) =>
                          updateQuestion(phase, question.id, {
                            required: checked === true,
                          })
                        }
                      />
                      Respuesta obligatoria
                    </Label>
                    {question.type === "multiple_choice" && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          El participante podrá marcar una o varias opciones.
                        </p>
                        {question.options.map((option, optionIndex) => (
                          <div key={option.id} className="flex items-end gap-2">
                            <Label className="min-w-0 flex-1 text-sm">
                              Opción {optionIndex + 1}
                              <Input
                                value={option.label}
                                onChange={(event) =>
                                  updateQuestion(phase, question.id, {
                                    options: question.options.map((item) =>
                                      item.id === option.id
                                        ? { ...item, label: event.target.value }
                                        : item
                                    ),
                                  })
                                }
                              />
                            </Label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              aria-label={`Quitar opción ${optionIndex + 1}`}
                              onClick={() =>
                                updateQuestion(phase, question.id, {
                                  options: question.options.filter(
                                    (item) => item.id !== option.id
                                  ),
                                })
                              }
                            >
                              Quitar
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateQuestion(phase, question.id, {
                              options: [
                                ...question.options,
                                { id: crypto.randomUUID(), label: "" },
                              ],
                            })
                          }
                        >
                          Agregar opción
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {["Subir", "Bajar"].map((label, direction) => (
                        <Button
                          key={label}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            disabled ||
                            (direction === 0
                              ? index === 0
                              : index === questionnaire.questions.length - 1)
                          }
                          onClick={() => {
                            const questions = [...questionnaire.questions]
                            const other = index + (direction === 0 ? -1 : 1)
                            ;[questions[index], questions[other]] = [
                              questions[other],
                              questions[index],
                            ]
                            updateQuestionnaire(phase, { questions })
                          }}
                        >
                          {label} pregunta {index + 1}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateQuestionnaire(phase, {
                            questions: questionnaire.questions.filter(
                              (item) => item.id !== question.id
                            ),
                          })
                        }
                      >
                        Quitar pregunta {index + 1}
                      </Button>
                    </div>
                  </fieldset>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    updateQuestionnaire(phase, {
                      questions: [...questionnaire.questions, newQuestion()],
                    })
                  }
                >
                  Agregar pregunta {phase === "before" ? "antes" : "después"}
                </Button>
              </>
            )}
          </fieldset>
        )
      })}
    </fieldset>
  )
}
