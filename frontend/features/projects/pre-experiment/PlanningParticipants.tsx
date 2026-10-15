"use client"
import { useId } from "react"
import { Plus, Trash2, UserRound, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FieldHint } from "@/components/FieldHint"
import { PlanningSelect } from "./PlanningControls"
import {
  participantLabel,
  repeatedDocument,
  sexOptions,
  type PlanningParticipant,
  type PreExperimentConfig,
} from "./types"

const newParticipant = (): PlanningParticipant => ({
  id: crypto.randomUUID(),
  name: "",
  identification_document: "",
  gender: "",
  age: null,
  notes: "",
})

/** Participant cards of the pre-experiment, with the fields of a project created from its folder. */
export function PlanningParticipants({
  value,
  onChange,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
}) {
  const baseId = useId()
  const isRepeated = repeatedDocument(value.participants)
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
            Registra a quienes harán el experimento.
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
      {value.participants.map((participant, index) => {
        const fieldId = `${baseId}-${index}`
        const repeated = isRepeated(participant)
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
                <p
                  className={`truncate text-xs ${repeated ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {repeated
                    ? "Documento repetido"
                    : participantLabel(participant) || "Sin documento todavía"}
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
            {/* The four data fields share one row of equal columns and the notes go below. Every label
                row is h-5, so a hint icon does not push its field below its neighbours. */}
            <div className="grid gap-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex h-5 items-center gap-1.5">
                    <Label htmlFor={`${fieldId}-nombre`}>Nombre</Label>
                    <FieldHint id={`${fieldId}-nombre-ayuda`}>
                      Opcional. Si lo dejas vacío, se muestra el documento.
                    </FieldHint>
                  </div>
                  <Input
                    id={`${fieldId}-nombre`}
                    autoComplete="off"
                    maxLength={255}
                    aria-describedby={`${fieldId}-nombre-ayuda`}
                    value={participant.name}
                    onChange={(event) =>
                      update(participant.id, { name: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex h-5 items-center gap-1.5">
                    <Label htmlFor={`${fieldId}-documento`}>Documento *</Label>
                    <FieldHint id={`${fieldId}-documento-ayuda`}>
                      Identifica al participante: no puede repetirse en el
                      proyecto.
                    </FieldHint>
                  </div>
                  <Input
                    id={`${fieldId}-documento`}
                    autoComplete="off"
                    maxLength={100}
                    aria-describedby={`${fieldId}-documento-ayuda`}
                    aria-invalid={repeated}
                    value={participant.identification_document}
                    onChange={(event) =>
                      update(participant.id, {
                        identification_document: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  {/* The trigger is named by aria-label; this label is only what is seen. */}
                  <Label aria-hidden className="h-5">
                    Sexo
                  </Label>
                  <PlanningSelect
                    label="Sexo"
                    value={participant.gender}
                    options={[...sexOptions]}
                    onChange={(gender) => update(participant.id, { gender })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-edad`} className="h-5">
                    Edad
                  </Label>
                  <Input
                    id={`${fieldId}-edad`}
                    type="number"
                    min={0}
                    max={150}
                    step={1}
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
                </div>
              </div>
              <Label className="flex-col items-stretch gap-1.5">
                <span className="flex h-5 items-center">Notas del participante</span>
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
