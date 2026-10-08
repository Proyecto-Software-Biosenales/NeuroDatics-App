"use client"
import { useEffect, useRef, useState } from "react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import type {
  Answers,
  Phase,
  PreExperimentEnvelope,
  QuestionnaireResponse,
} from "./types"
import { missingRequiredAnswer, phaseLabel } from "./types"
import { planningError, PreExperimentApi } from "./api"
import { PlanningSelect } from "./PlanningControls"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export function QuestionnaireDialog({
  projectId,
  saved,
  onClose,
  onSubmitted,
}: {
  projectId: string
  saved: PreExperimentEnvelope
  onClose: () => void
  onSubmitted: (response: QuestionnaireResponse) => void
}) {
  const [participantId, setParticipantId] = useState("")
  const [phase, setPhase] = useState<Phase | "">("")
  const [answers, setAnswers] = useState<Answers>({})
  const [started, setStarted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const inFlight = useRef(false)
  useEffect(() => {
    if (!started || done) return
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", protect)
    return () => window.removeEventListener("beforeunload", protect)
  }, [started, done])
  const questionnaire = phase ? saved.config.questionnaires[phase] : null
  const participant = saved.config.participants.find(
    (item) => item.id === participantId
  )
  const submit = async () => {
    if (
      !phase ||
      !participant ||
      !questionnaire ||
      inFlight.current ||
      done ||
      conflict
    )
      return
    if (
      questionnaire.questions.some((question) =>
        missingRequiredAnswer(question, answers[question.id])
      )
    ) {
      setError("Completa todas las respuestas obligatorias.")
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const response = await PreExperimentApi.respond(
        projectId,
        saved.revision,
        participant.id,
        phase,
        answers
      )
      setDone(true)
      onSubmitted(response)
    } catch (failure) {
      setError(planningError(failure))
      setConflict(
        typeof failure === "object" &&
          failure !== null &&
          "status" in failure &&
          failure.status === 409
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        showCloseButton={!busy && (!started || done)}
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (busy || (started && !done)) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>Responder cuestionario</DialogTitle>
          <DialogDescription>
            Selecciona al participante y entrega la aplicación para responder.
            Las respuestas se guardan con la versión de las preguntas y los
            datos del participante.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div role="status" className="space-y-4">
            <p>Respuestas guardadas correctamente.</p>
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {!started ? (
              <>
                <Label className="block space-y-1 text-sm">
                  Participante
                  <PlanningSelect
                    label="Participante"
                    placeholder="Seleccionar participante"
                    value={participantId}
                    onChange={setParticipantId}
                    options={saved.config.participants.map((item) => ({
                      value: item.id,
                      label: `${item.code} — ${item.name}`,
                    }))}
                  />
                </Label>
                <Label className="block space-y-1 text-sm">
                  Momento del cuestionario
                  <PlanningSelect
                    label="Momento del cuestionario"
                    placeholder="Seleccionar momento"
                    value={phase}
                    onChange={(value) => setPhase(value as Phase)}
                    options={(["before", "after"] as const)
                      .filter(
                        (item) => saved.config.questionnaires[item].enabled
                      )
                      .map((item) => ({
                        value: item,
                        label: phaseLabel[item],
                      }))}
                  />
                </Label>
                <Button
                  disabled={!participantId || !phase}
                  onClick={() => setStarted(true)}
                >
                  Comenzar respuestas
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">
                  {participant?.code} — {participant?.name} ·{" "}
                  {phase && phaseLabel[phase]}
                </p>
                <h3 className="font-semibold">{questionnaire?.title}</h3>
                <p className="text-sm text-muted-foreground">
                  * Respuesta obligatoria
                </p>
                <fieldset
                  disabled={busy || conflict}
                  className="min-w-0 space-y-4"
                >
                  {questionnaire?.questions.map((question, index) => (
                    <fieldset
                      key={question.id}
                      className="space-y-3 rounded-lg border p-3"
                    >
                      <legend className="px-1 text-sm break-words">
                        {index + 1}. {question.prompt}
                        {question.required ? " *" : ""}
                      </legend>
                      {question.type === "open_text" && (
                        <Textarea
                          aria-label={question.prompt}
                          value={
                            typeof answers[question.id] === "string"
                              ? (answers[question.id] as string)
                              : ""
                          }
                          onChange={(event) =>
                            setAnswers({
                              ...answers,
                              [question.id]: event.target.value,
                            })
                          }
                        />
                      )}
                      {question.type === "true_false" && (
                        <RadioGroup
                          disabled={busy || conflict}
                          className="flex flex-wrap gap-4"
                          value={
                            typeof answers[question.id] === "boolean"
                              ? String(answers[question.id])
                              : ""
                          }
                          onValueChange={(value) =>
                            setAnswers({
                              ...answers,
                              [question.id]: value === "true",
                            })
                          }
                        >
                          {[true, false].map((value) => (
                            <Label
                              key={String(value)}
                              className="flex items-center gap-2 text-sm"
                            >
                              <RadioGroupItem value={String(value)} />
                              {value ? "Verdadero" : "Falso"}
                            </Label>
                          ))}
                        </RadioGroup>
                      )}
                      {question.type === "multiple_choice" && (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Marca una o varias opciones.
                          </p>
                          {question.options.map((option) => (
                            <Label
                              key={option.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Checkbox
                                disabled={busy || conflict}
                                checked={
                                  Array.isArray(answers[question.id]) &&
                                  (answers[question.id] as string[]).includes(
                                    option.id
                                  )
                                }
                                onCheckedChange={(checked) => {
                                  const selected = Array.isArray(
                                    answers[question.id]
                                  )
                                    ? (answers[question.id] as string[])
                                    : []
                                  setAnswers({
                                    ...answers,
                                    [question.id]:
                                      checked === true
                                        ? [...selected, option.id]
                                        : selected.filter(
                                            (id) => id !== option.id
                                          ),
                                  })
                                }}
                              />
                              {option.label}
                            </Label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                  ))}
                </fieldset>
                <Button
                  disabled={busy || conflict}
                  onClick={() => void submit()}
                >
                  {busy ? "Guardando respuestas…" : "Guardar respuestas"}
                </Button>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button variant="outline" disabled={busy} onClick={onClose}>
              {started
                ? "Cerrar y descartar respuestas sin guardar"
                : "Cancelar"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
