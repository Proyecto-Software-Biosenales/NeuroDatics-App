"use client"
import { Plus, Trash2, UserRound, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PlanningParticipant, PreExperimentConfig } from "./types"

// [field, label, placeholder, columns out of six on wider screens]
const textFields = [
  ["code", "Código", "Ej: P01", "sm:col-span-2"],
  ["name", "Nombre del participante", "Nombre completo", "sm:col-span-4"],
  ["identification_document", "Documento de identificación", "Opcional", "sm:col-span-3"],
  ["gender", "Género", "Opcional", "sm:col-span-2"],
] as const

const newParticipant = (): PlanningParticipant => ({
  id: crypto.randomUUID(),
  code: "",
  name: "",
  identification_document: "",
  gender: "",
  age: null,
  notes: "",
})

/** Participant cards shared by the creation tabs and Configuración. */
export function PlanningParticipants({
  value,
  onChange,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
}) {
  const update = (id: string, change: Partial<PlanningParticipant>) =>
    onChange({
      ...value,
      participants: value.participants.map((item) =>
        item.id === id ? { ...item, ...change } : item
      ),
    })
  const add = () =>
    onChange({ ...value, participants: [...value.participants, newParticipant()] })
  if (!value.participants.length)
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <UsersRound aria-hidden className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">Aún no hay participantes</p>
          <p className="text-sm text-muted-foreground">
            Registra a quienes harán el experimento. Solo el código y el nombre
            son obligatorios.
          </p>
        </div>
        <Button type="button" onClick={add}>
          <Plus aria-hidden />
          Agregar participante
        </Button>
      </div>
    )
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Código y nombre son obligatorios al agregar un participante. Los demás
        datos son opcionales.
      </p>
      {value.participants.map((participant, index) => {
        const summary = [participant.code.trim(), participant.name.trim()]
          .filter(Boolean)
          .join(" — ")
        return (
          <fieldset
            key={participant.id}
            className="min-w-0 rounded-xl border bg-card"
          >
            <legend className="sr-only">Participante {index + 1}</legend>
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <UserRound aria-hidden className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Participante {index + 1}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {summary || "Sin código ni nombre todavía"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar participante ${index + 1}`}
                title="Quitar participante"
                onClick={() =>
                  onChange({
                    ...value,
                    participants: value.participants.filter(
                      (item) => item.id !== participant.id
                    ),
                  })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-6">
              {textFields.map(([key, label, placeholder, span]) => (
                <Label key={key} className={`block space-y-1.5 text-sm ${span}`}>
                  <span>
                    {label}
                    {(key === "code" || key === "name") && " *"}
                  </span>
                  <Input
                    value={participant[key]}
                    placeholder={placeholder}
                    onChange={(event) =>
                      update(participant.id, { [key]: event.target.value })
                    }
                  />
                </Label>
              ))}
              <Label className="block space-y-1.5 text-sm sm:col-span-1">
                <span>Edad</span>
                <Input
                  type="number"
                  min={0}
                  max={150}
                  step={1}
                  placeholder="Opcional"
                  value={participant.age ?? ""}
                  onChange={(event) =>
                    update(participant.id, {
                      age:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </Label>
              <Label className="block space-y-1.5 text-sm sm:col-span-6">
                <span>Notas del participante</span>
                <Textarea
                  value={participant.notes}
                  placeholder="Observaciones, condiciones especiales…"
                  onChange={(event) =>
                    update(participant.id, { notes: event.target.value })
                  }
                />
              </Label>
            </div>
          </fieldset>
        )
      })}
      <Button type="button" variant="outline" className="w-full" onClick={add}>
        <Plus aria-hidden />
        Agregar participante
      </Button>
    </div>
  )
}
