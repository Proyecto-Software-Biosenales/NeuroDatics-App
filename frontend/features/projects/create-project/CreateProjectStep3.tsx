"use client"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldHint } from "@/components/FieldHint"
import type { ParticipantData, ParticipantField } from "./types"

interface CreateProjectStep3Props {
  participants: ParticipantData[]
  onUpdateParticipant: (
    id: string,
    field: ParticipantField,
    value: string
  ) => void
  /** The section already has its title elsewhere (the editor's tab). */
  hideTitle?: boolean
}

const sexOptions = [
  { label: "Masculino", value: "male" },
  { label: "Femenino", value: "female" },
  { label: "Otro", value: "other" },
] as const

// Name and document are optional: only sex and age gate the step.
const isParticipantComplete = (p: ParticipantData): boolean => {
  const hasValidSex = p.sex === "male" || p.sex === "female" || p.sex === "other"
  const ageNum = Number(p.age)
  const hasValidAge = p.age.trim() !== "" && Number.isFinite(ageNum) && ageNum > 0
  return p.id.trim() !== "" && hasValidSex && hasValidAge
}

export const CreateProjectStep3 = ({
  participants,
  onUpdateParticipant,
  hideTitle = false,
}: CreateProjectStep3Props) => {
  const [openParticipant, setOpenParticipant] = useState<string>(
    participants[0]?.id || ""
  )

  const incompleteCount = participants.filter((p) => !isParticipantComplete(p)).length

  return (
    <div className="space-y-6">
      {!hideTitle && (
        <div>
          <h3 className="text-xl font-semibold text-foreground mb-2">
            Datos del participante
          </h3>
        </div>
      )}

      {participants.length > 0 && incompleteCount > 0 && (
        <div className="p-3 bg-muted border border-border rounded-lg text-sm text-foreground">
          {incompleteCount === 1
            ? "1 participante requiere sexo y edad para continuar."
            : `${incompleteCount} participantes requieren sexo y edad para continuar.`}
        </div>
      )}

      <div className="space-y-3">
        {participants.map((participant, index) => {
          const isOpen = openParticipant === participant.id
          // DOM ids from the position: the extracted code may contain any character.
          const fieldId = `participant-${index}`
          const name = participant.name ?? ""
          const documentValue = participant.document ?? participant.id
          const documentCorrected =
            documentValue.trim() !== "" && documentValue.trim() !== participant.id

          return (
            <Collapsible
              key={participant.id}
              open={isOpen}
              onOpenChange={(open) => setOpenParticipant(open ? participant.id : "")}
              className="border border-border rounded-xl bg-card overflow-hidden"
            >
              <CollapsibleTrigger asChild><Button variant="ghost"
                type="button"
                className="h-auto w-full justify-between p-4"
              >
                <div className="flex items-center">
                  <span className="font-medium text-foreground">
                    Participante {index + 1}
                  </span>
                  {!isParticipantComplete(participant) && (
                    <span className="ml-2 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-full px-2 py-0.5">
                      Completar
                    </span>
                  )}
                </div>
                {isOpen ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
              </Button></CollapsibleTrigger>

                <CollapsibleContent className="px-4 pb-4 space-y-4 border-t border-border">
                  <div className="pt-4">
                    <div className="mb-2 flex items-center gap-1.5">
                      <Label htmlFor={`${fieldId}-nombre`} className="text-sm font-medium text-foreground">
                        Nombre
                      </Label>
                      <FieldHint id={`${fieldId}-nombre-ayuda`}>
                        Opcional. Si lo dejas vacío, el Dashboard mostrará el documento.
                      </FieldHint>
                    </div>
                    <Input
                      id={`${fieldId}-nombre`}
                      type="text"
                      autoComplete="off"
                      maxLength={120}
                      aria-describedby={`${fieldId}-nombre-ayuda`}
                      value={name}
                      onChange={(e) => onUpdateParticipant(participant.id, "name", e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <Label htmlFor={`${fieldId}-documento`} className="text-sm font-medium text-foreground">
                        Documento
                      </Label>
                      <FieldHint id={`${fieldId}-documento-ayuda`}>
                        {documentCorrected
                          ? `Detectado en los datos: ${participant.id}. Si lo dejas vacío, se usa este valor.`
                          : "Tomado de los datos del experimento. Corrígelo si está mal."}
                      </FieldHint>
                    </div>
                    <Input
                      id={`${fieldId}-documento`}
                      type="text"
                      autoComplete="off"
                      maxLength={50}
                      placeholder={participant.id}
                      aria-describedby={`${fieldId}-documento-ayuda`}
                      value={documentValue}
                      onChange={(e) => onUpdateParticipant(participant.id, "document", e.target.value)}
                    />
                  </div>

                  <div>
                    <Label id={`${fieldId}-sexo`} className="mb-3 block">
                      Sexo
                    </Label>
                    <RadioGroup aria-labelledby={`${fieldId}-sexo`} value={participant.sex} onValueChange={(value) => onUpdateParticipant(participant.id, "sex", value)} className="flex flex-wrap gap-2">
                      {sexOptions.map((option) => (
                        <Label
                          key={option.value}
                          htmlFor={`${fieldId}-sexo-${option.value}`}
                          className="flex-1 cursor-pointer rounded-lg border border-border px-3 py-2 has-[[data-state=checked]]:bg-muted"
                        >
                          <RadioGroupItem id={`${fieldId}-sexo-${option.value}`} value={option.value} />
                          {option.label}
                        </Label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div>
                    <Label
                      htmlFor={`${fieldId}-edad`}
                      className="text-sm font-medium text-foreground mb-2 block"
                    >
                      Edad
                    </Label>
                    <Input
                      id={`${fieldId}-edad`}
                      type="text"
                      inputMode="numeric"
                      value={participant.age}
                      onChange={(e) =>
                        onUpdateParticipant(
                          participant.id,
                          "age",
                          e.target.value
                        )
                      }
                    />
                  </div>
                </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}
