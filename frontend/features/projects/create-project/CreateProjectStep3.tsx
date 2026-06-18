"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ParticipantData } from "./types"

interface CreateProjectStep3Props {
  participants: ParticipantData[]
  onUpdateParticipant: (
    id: string,
    field: "sex" | "age",
    value: string
  ) => void
}

export const CreateProjectStep3 = ({
  participants,
  onUpdateParticipant,
}: CreateProjectStep3Props) => {
  const [openParticipant, setOpenParticipant] = useState<string>(
    participants[0]?.id || ""
  )

  const sexOptions = [
    { label: "Masculino", value: "male" },
    { label: "Femenino", value: "female" },
    { label: "Otro", value: "other" },
  ] as const

  const isParticipantComplete = (p: ParticipantData): boolean => {
    const hasValidSex = p.sex === "male" || p.sex === "female" || p.sex === "other"
    const ageNum = Number(p.age)
    const hasValidAge = p.age.trim() !== "" && Number.isFinite(ageNum) && ageNum > 0
    return p.id.trim() !== "" && hasValidSex && hasValidAge
  }

  const incompleteCount = participants.filter((p) => !isParticipantComplete(p)).length

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          Datos del participante
        </h3>
        <p className="text-sm text-muted-foreground">
          Información demográfica del participante del experimento
        </p>
      </div>

      {participants.length > 0 && incompleteCount > 0 && (
        <div className="p-3 bg-muted border border-border rounded-lg text-sm text-foreground">
          {incompleteCount === 1
            ? "1 participante requiere sexo y edad para continuar."
            : `${incompleteCount} participantes requieren sexo y edad para continuar.`}
        </div>
      )}

      <div className="space-y-3">
        {participants.map((participant) => {
          const isOpen = openParticipant === participant.id

          return (
            <div
              key={participant.id}
              className="border border-border rounded-xl bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenParticipant(isOpen ? "" : participant.id)
                }
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center">
                  <span className="font-medium text-foreground">
                    {participant.id}
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
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-border">
                  <div className="pt-4">
                    <Label className="text-sm font-medium text-foreground mb-3 block">
                      Sexo
                    </Label>
                    <div className="flex gap-2">
                      {sexOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            onUpdateParticipant(participant.id, "sex", option.value)
                          }
                          className={`flex-1 px-4 py-2 rounded-lg border transition-all duration-200 text-sm font-medium ${
                            participant.sex === option.value
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card text-foreground hover:border-foreground/40"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label
                      htmlFor={`edad-${participant.id}`}
                      className="text-sm font-medium text-foreground mb-2 block"
                    >
                      Edad
                    </Label>
                    <Input
                      id={`edad-${participant.id}`}
                      type="text"
                      placeholder="Ej: 25"
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
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
