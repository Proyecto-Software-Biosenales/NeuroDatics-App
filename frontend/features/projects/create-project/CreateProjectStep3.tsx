"use client"

import { useId, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  ParticipantAssignment,
  ParticipantDataFields,
  ParticipantHeading,
  ParticipantNotes,
  type ParticipantFields,
} from "@/features/projects/pre-experiment/PlanningParticipants"
import { participantLabel, type PlanningParticipant } from "@/features/projects/pre-experiment/types"
import { UNASSIGNED, assignmentOptions } from "@/features/projects/edit/participants"
import type { ParticipantData, ParticipantField } from "./types"

interface CreateProjectStep3Props {
  participants: ParticipantData[]
  onUpdateParticipant: (
    id: string,
    field: ParticipantField,
    value: string
  ) => void
  /** A pre-experiment that receives its folder: who of its preparation is who in the data. */
  matching?: {
    planned: PlanningParticipant[]
    /** The participants as read from the data, before taking the details of the preparation. */
    detected: ParticipantData[]
    /** Participant of the preparation → code read from the data. */
    assignments: Record<string, string>
    onAssign: (plannedId: string, code: string | null) => void
    repeatedDocument: string | null
  }
}

// Name and document are optional: only sex and age gate the step.
const isParticipantComplete = (p: ParticipantData): boolean => {
  const hasValidSex = p.sex === "male" || p.sex === "female" || p.sex === "other"
  const ageNum = Number(p.age)
  const hasValidAge = p.age.trim() !== "" && Number.isFinite(ageNum) && ageNum > 0
  return p.id.trim() !== "" && hasValidSex && hasValidAge
}

/** A card of the step: a participant of the preparation, of the data, or one of each that are the same person. */
type Card = { key: string; planned?: PlanningParticipant; participant?: ParticipantData }

const badgeClass = "shrink-0 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-full px-2 py-0.5"

export const CreateProjectStep3 = ({
  participants,
  onUpdateParticipant,
  matching,
}: CreateProjectStep3Props) => {
  const byCode = new Map(participants.map((participant) => [participant.id, participant]))
  const assignments = matching?.assignments ?? {}
  const assigned = new Set(Object.values(assignments))
  // The participants of the preparation first, each with the one of the data it is; then those only in the data.
  const cards: Card[] = [
    ...(matching?.planned ?? []).map((planned) => ({
      key: `preparacion-${planned.id}`,
      planned,
      participant: assignments[planned.id] ? byCode.get(assignments[planned.id]) : undefined,
    })),
    ...participants
      .filter((participant) => !assigned.has(participant.id))
      .map((participant) => ({ key: `datos-${participant.id}`, participant })),
  ]
  const [openParticipant, setOpenParticipant] = useState<string>(cards[0]?.key || "")
  const baseId = useId()

  // The shared fields report a change by its name; the sex select only offers valid values.
  const updateFields = (id: string, change: Partial<ParticipantFields>) => {
    for (const [field, value] of Object.entries(change)) onUpdateParticipant(id, field as ParticipantField, value)
  }

  const incompleteCount = participants.filter((p) => !isParticipantComplete(p)).length
  const unassignedCount = (matching?.planned ?? []).filter((planned) => !assignments[planned.id]).length

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Datos del participante
        </h3>
      </div>

      {participants.length > 0 && incompleteCount > 0 && (
        <div className="p-3 bg-muted border border-border rounded-lg text-sm text-foreground">
          {incompleteCount === 1
            ? "1 participante requiere sexo y edad para continuar."
            : `${incompleteCount} participantes requieren sexo y edad para continuar.`}
        </div>
      )}

      {unassignedCount > 0 && (
        <div className="p-3 bg-muted border border-border rounded-lg text-sm text-foreground">
          {unassignedCount === 1
            ? "1 participante del pre-experimento queda sin asignar."
            : `${unassignedCount} participantes del pre-experimento quedan sin asignar.`}{" "}
          Seguirán en el proyecto con sus cuestionarios y notas, pero no aparecerán en el dashboard, los informes
          ni las estadísticas.
        </div>
      )}

      {matching?.repeatedDocument && (
        <div role="alert" className="p-3 bg-muted border border-border rounded-lg text-sm text-foreground">
          Hay dos participantes con el documento {matching.repeatedDocument}. Asigna ese documento a quien
          corresponde.
        </div>
      )}

      <div className="space-y-3">
        {cards.map((card, index) => {
          const { planned, participant } = card
          const isOpen = openParticipant === card.key
          // DOM ids from the position: the extracted code may contain any character.
          const fieldId = `${baseId}-${index}`
          const code = planned ? assignments[planned.id] ?? null : null
          // A participant of the data can be assigned only once: the choices are the free ones and its own.
          const choices =
            planned && matching
              ? assignmentOptions(
                  planned,
                  matching.detected.filter((item) => !assigned.has(item.id) || item.id === code)
                )
              : []

          const detail = planned
            ? participantLabel(planned)
            : [participant?.document.trim() || participant?.id, participant?.name.trim()].filter(Boolean).join(" — ")

          return (
            <Collapsible
              key={card.key}
              open={isOpen}
              onOpenChange={(open) => setOpenParticipant(open ? card.key : "")}
              className="min-w-0 rounded-xl border bg-card"
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  className="h-auto w-full min-w-0 justify-start gap-3 rounded-xl px-4 py-3 whitespace-normal"
                >
                  <ParticipantHeading number={index + 1} detail={detail} />
                  {planned && !participant && <span className={badgeClass}>Sin asignar</span>}
                  {participant && !isParticipantComplete(participant) && (
                    <span className={badgeClass}>Completar</span>
                  )}
                  {isOpen ? (
                    <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>

              <CollapsibleContent className="grid gap-3 border-t p-4">
                {planned && matching && (
                  <ParticipantAssignment
                    fieldId={fieldId}
                    value={code ?? UNASSIGNED}
                    options={choices}
                    onChange={(value) => matching.onAssign(planned.id, value === UNASSIGNED ? null : value)}
                  >
                    El documento con el que aparece en los datos del experimento; se sugiere el más parecido al que
                    registraste. Si no participó, déjalo sin asignar: seguirá en el proyecto con sus cuestionarios y
                    notas, pero no aparecerá en el dashboard, los informes ni las estadísticas.
                  </ParticipantAssignment>
                )}
                {participant && (
                  <>
                    <ParticipantDataFields
                      fieldId={fieldId}
                      recordedCode={participant.id}
                      fields={{
                        name: participant.name ?? "",
                        document: participant.document ?? participant.id,
                        sex: participant.sex ?? "",
                        age: participant.age,
                      }}
                      onChange={(change) => updateFields(participant.id, change)}
                    />
                    <ParticipantNotes
                      value={participant.notes ?? ""}
                      onChange={(notes) => onUpdateParticipant(participant.id, "notes", notes)}
                    />
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
