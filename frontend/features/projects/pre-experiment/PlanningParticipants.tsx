"use client"
import { useId, type ReactNode } from "react"
import { Plus, Trash2, UserRound, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FieldHint } from "@/components/FieldHint"
import { randomId } from "@/lib/randomId"
import { PlanningSelect } from "./PlanningControls"
import { UNASSIGNED } from "@/features/projects/edit/participants"
import {
  repeatedDocument,
  sexOptions,
  type PlanningParticipant,
  type PreExperimentConfig,
} from "./types"

export const newPlanningParticipant = (): PlanningParticipant => ({
  id: randomId(),
  name: "",
  identification_document: "",
  gender: "",
  age: null,
  notes: "",
})

/** An age as typed, as the preparation stores it: empty is no age. */
export const planningAge = (age: string) => (age.trim() === "" ? null : Number(age))

/** What a participant card shows and edits, whichever list the participant is kept in. */
export type ParticipantFields = {
  name: string
  document: string
  sex: string
  age: string
  notes: string
}

export type ParticipantCard = {
  key: string
  fields: ParticipantFields
  /** The code read from the experiment's data: the participant cannot be removed, sex and age are
   *  required and an empty document falls back to the code. */
  recordedCode?: string
  /** What identified older saves before the document. */
  legacyCode?: string
  repeated: boolean
  /** A participant of the preparation in a project with data, which it is not part of until it is assigned the
   *  document of one read from the data. */
  assignment?: { options: { value: string; label: string }[]; onChange: (code: string) => void }
  /** Marks a missing sex or age after a failed save. */
  incomplete?: boolean
  onChange: (change: Partial<ParticipantFields>) => void
  onRemove?: () => void
}

/** The participant cards of a project: the same list whether or not the project has its folder. */
export function ParticipantCards({ cards, onAdd }: { cards: ParticipantCard[]; onAdd: () => void }) {
  const baseId = useId()
  if (!cards.length)
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
        <Button type="button" onClick={onAdd}>
          <Plus aria-hidden />
          Agregar participante
        </Button>
      </div>
    )
  return (
    <div className="space-y-3">
      {cards.map((card, index) => {
        const fieldId = `${baseId}-${index}`
        const { fields, recordedCode, repeated } = card
        const label = [fields.document.trim() || recordedCode || card.legacyCode?.trim(), fields.name.trim()]
          .filter(Boolean)
          .join(" — ")
        return (
          <fieldset key={card.key} className="min-w-0 rounded-xl border bg-card">
            <legend className="sr-only">Participante {index + 1}</legend>
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <ParticipantHeading number={index + 1} detail={label} repeated={repeated} />
              {/* Participants read from the data stay: the recordings are theirs. */}
              {card.onRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar participante ${index + 1}`}
                  title="Quitar participante"
                  onClick={card.onRemove}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
            <div className="grid gap-3 p-4">
              <ParticipantDataFields
                fieldId={fieldId}
                fields={fields}
                recordedCode={recordedCode}
                repeated={repeated}
                incomplete={card.incomplete}
                onChange={card.onChange}
              />
              {card.assignment && (
                <ParticipantAssignment
                  fieldId={fieldId}
                  value={UNASSIGNED}
                  options={card.assignment.options}
                  onChange={card.assignment.onChange}
                >
                  No está en los datos del experimento: sigue en el proyecto con sus cuestionarios y notas, pero no
                  aparece en el dashboard, los informes ni las estadísticas. Si participó, elige su documento en los
                  datos.
                </ParticipantAssignment>
              )}
              <ParticipantNotes value={fields.notes} onChange={(notes) => card.onChange({ notes })} />
            </div>
          </fieldset>
        )
      })}
      <Button type="button" variant="outline" className="w-full" onClick={onAdd}>
        <Plus aria-hidden />
        Agregar participante
      </Button>
    </div>
  )
}

/** The head of a participant card: its number and, below, its document and name. Only spans, so it also fits
 *  inside the button that opens a card of the upload. */
export function ParticipantHeading({
  number,
  detail,
  repeated = false,
}: {
  number: number
  detail: string
  repeated?: boolean
}) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <UserRound aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium">Participante {number}</span>
        <span
          className={`block truncate text-xs font-normal ${repeated ? "text-destructive" : "text-muted-foreground"}`}
        >
          {repeated ? "Documento repetido" : detail || "Sin documento todavía"}
        </span>
      </span>
    </>
  )
}

/** Name, document, sex and age of a participant, in one row of equal columns. Every label row is h-5, so a hint
 *  icon does not push its field below its neighbours. */
export function ParticipantDataFields({
  fieldId,
  fields,
  recordedCode,
  repeated = false,
  incomplete = false,
  onChange,
}: {
  fieldId: string
  fields: Omit<ParticipantFields, "notes">
  /** See ParticipantCard.recordedCode. */
  recordedCode?: string
  repeated?: boolean
  /** Marks a missing sex or age. */
  incomplete?: boolean
  onChange: (change: Partial<ParticipantFields>) => void
}) {
  const recorded = recordedCode !== undefined
  const missingSex = incomplete && !fields.sex
  const missingAge = incomplete && !(Number(fields.age) > 0)
  return (
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
          maxLength={recorded ? 120 : 255}
          aria-describedby={`${fieldId}-nombre-ayuda`}
          value={fields.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex h-5 items-center gap-1.5">
          <Label htmlFor={`${fieldId}-documento`}>{recorded ? "Documento" : "Documento *"}</Label>
          <FieldHint id={`${fieldId}-documento-ayuda`}>
            {recorded
              ? `Detectado en los datos: ${recordedCode}. Si lo dejas vacío, se usa este valor.`
              : "Identifica al participante: no puede repetirse en el proyecto."}
          </FieldHint>
        </div>
        <Input
          id={`${fieldId}-documento`}
          autoComplete="off"
          maxLength={recorded ? 50 : 100}
          placeholder={recordedCode}
          aria-describedby={`${fieldId}-documento-ayuda`}
          aria-invalid={repeated}
          value={fields.document}
          onChange={(event) => onChange({ document: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        {/* The trigger is named by aria-label; this label is only what is seen. */}
        <Label aria-hidden className="h-5">
          {recorded ? "Sexo *" : "Sexo"}
        </Label>
        <PlanningSelect
          label="Sexo"
          value={fields.sex}
          options={[...sexOptions]}
          invalid={missingSex}
          onChange={(sex) => onChange({ sex })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-edad`} className="h-5">
          {recorded ? "Edad *" : "Edad"}
        </Label>
        <Input
          id={`${fieldId}-edad`}
          type="number"
          min={0}
          max={150}
          step={1}
          aria-invalid={missingAge}
          value={fields.age}
          onChange={(event) => onChange({ age: event.target.value })}
        />
      </div>
    </div>
  )
}

/** «Asignar documento»: which participant read from the data a participant of the preparation is. */
export function ParticipantAssignment({
  fieldId,
  value,
  options,
  onChange,
  children,
}: {
  fieldId: string
  value: string
  options: { value: string; label: string }[]
  onChange: (code: string) => void
  /** The hint of the field. */
  children: ReactNode
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex h-5 items-center gap-1.5">
          <Label aria-hidden className="whitespace-nowrap">
            Asignar documento
          </Label>
          <FieldHint id={`${fieldId}-asignar-ayuda`}>{children}</FieldHint>
        </div>
        <PlanningSelect
          label="Asignar documento"
          value={value}
          options={options}
          disabled={options.length < 2}
          onChange={onChange}
        />
      </div>
    </div>
  )
}

export function ParticipantNotes({ value, onChange }: { value: string; onChange: (notes: string) => void }) {
  return (
    <Label className="flex-col items-stretch gap-1.5">
      <span className="flex h-5 items-center">Notas del participante</span>
      <Textarea
        value={value}
        placeholder="Observaciones, condiciones especiales…"
        onChange={(event) => onChange(event.target.value)}
      />
    </Label>
  )
}

/** The participants of a project's preparation, with the fields of a project created from its folder. */
export function PlanningParticipants({
  value,
  onChange,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
}) {
  const isRepeated = repeatedDocument(value.participants)
  const update = (id: string, change: Partial<PlanningParticipant>) =>
    onChange({
      ...value,
      participants: value.participants.map((item) => (item.id === id ? { ...item, ...change } : item)),
    })
  return (
    <ParticipantCards
      onAdd={() => onChange({ ...value, participants: [...value.participants, newPlanningParticipant()] })}
      cards={value.participants.map((participant) => ({
        key: participant.id,
        fields: planningFields(participant),
        legacyCode: participant.code,
        repeated: isRepeated(participant),
        onChange: (change) => update(participant.id, planningChange(change)),
        onRemove: () =>
          onChange({ ...value, participants: value.participants.filter((item) => item.id !== participant.id) }),
      }))}
    />
  )
}

export const planningFields = (participant: PlanningParticipant): ParticipantFields => ({
  name: participant.name,
  document: participant.identification_document,
  sex: participant.gender,
  age: participant.age === null ? "" : String(participant.age),
  notes: participant.notes,
})

export function planningChange(change: Partial<ParticipantFields>): Partial<PlanningParticipant> {
  const next: Partial<PlanningParticipant> = {}
  if (change.name !== undefined) next.name = change.name
  if (change.document !== undefined) next.identification_document = change.document
  if (change.sex !== undefined) next.gender = change.sex
  if (change.age !== undefined) next.age = planningAge(change.age)
  if (change.notes !== undefined) next.notes = change.notes
  return next
}
