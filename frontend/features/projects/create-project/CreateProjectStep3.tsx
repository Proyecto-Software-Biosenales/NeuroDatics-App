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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Datos del participante
        </h3>
        <p className="text-sm text-gray-600">
          Información demográfica del participante del experimento
        </p>
      </div>

      <div className="space-y-3">
        {participants.map((participant) => {
          const isOpen = openParticipant === participant.id

          return (
            <div
              key={participant.id}
              className="border border-gray-200 rounded-xl bg-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenParticipant(isOpen ? "" : participant.id)
                }
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">
                  {participant.id}
                </span>
                {isOpen ? (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                  <div className="pt-4">
                    <Label className="text-sm font-medium text-gray-900 mb-3 block">
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
                              ? "border-black bg-black text-white"
                              : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
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
                      className="text-sm font-medium text-gray-900 mb-2 block"
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
