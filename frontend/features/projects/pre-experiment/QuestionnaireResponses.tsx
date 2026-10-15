"use client"
import { Download, MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PlanningSection } from "./PlanningControls"
import {
  participantLabel,
  phaseLabel,
  sexLabel,
  type PreExperimentEnvelope,
  type QuestionnaireResponse,
} from "./types"

function ResponseHistory({ responses }: { responses: QuestionnaireResponse[] }) {
  return (
    <div className="space-y-3">
      {[...responses].reverse().map((response) => (
        <PlanningSection
          key={response.id}
          title={`${participantLabel(response.participant_snapshot)} · ${phaseLabel[response.phase]} · ${new Date(response.submitted_at).toLocaleString("es-CO")}`}
        >
          <div className="mt-3 space-y-3 text-sm">
            <p>{response.questionnaire_snapshot.title}</p>
            <p className="text-muted-foreground">
              Documento: {response.participant_snapshot.identification_document || "Sin dato"} · Sexo:{" "}
              {sexLabel(response.participant_snapshot.gender) || "Sin dato"} · Edad:{" "}
              {response.participant_snapshot.age ?? "Sin dato"}
            </p>
            {response.questionnaire_snapshot.questions.map((question) => {
              const answer = response.answers[question.id]
              const formatted = Array.isArray(answer)
                ? answer.map((id) => question.options.find((option) => option.id === id)?.label || id).join(", ")
                : typeof answer === "boolean"
                  ? answer
                    ? "Verdadero"
                    : "Falso"
                  : question.type === "multiple_choice" && typeof answer === "string"
                    ? question.options.find((option) => option.id === answer)?.label || answer
                    : answer
              return (
                <div key={question.id}>
                  <p className="font-medium break-words">{question.prompt}</p>
                  <p className="break-words whitespace-pre-wrap">{formatted || "Sin respuesta"}</p>
                </div>
              )
            })}
          </div>
        </PlanningSection>
      ))}
    </div>
  )
}

/** The answers already taken, with the actions to take another one or download them all.
 *  Answering and downloading work on the saved project, so they wait for unsaved changes. */
export function QuestionnaireResponses({
  saved,
  canAnswer,
  dirty,
  busy,
  onAnswer,
  onDownload,
}: {
  saved: PreExperimentEnvelope
  canAnswer: boolean
  dirty: boolean
  busy: boolean
  onAnswer: () => void
  onDownload: () => void
}) {
  const hint = dirty
    ? "Guarda los cambios para responder o descargar."
    : !canAnswer
      ? "Para responder, agrega un participante y una pregunta, y guarda."
      : null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy || dirty || !canAnswer} onClick={onAnswer}>
          <MessageSquareText aria-hidden />
          Responder cuestionario
        </Button>
        <Button type="button" variant="outline" disabled={busy || dirty} onClick={onDownload}>
          <Download aria-hidden />
          Descargar respuestas
        </Button>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {saved.responses.length ? (
        <ResponseHistory responses={saved.responses} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <MessageSquareText aria-hidden className="size-6" />
          </div>
          <p className="font-medium">Todavía no hay respuestas guardadas</p>
        </div>
      )}
    </div>
  )
}
