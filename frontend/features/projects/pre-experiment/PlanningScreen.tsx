"use client"
import { useId, type ReactNode } from "react"
import { Monitor, NotebookPen, Ruler } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FieldHint } from "@/components/FieldHint"
import type { PreExperimentConfig } from "./types"

type Measure = keyof Omit<PreExperimentConfig["screen"], "notes">

function Group({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <section className="@container space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted [&_svg]:size-4">
          {icon}
        </div>
        <h4 className="text-sm font-medium">{title}</h4>
      </div>
      {children}
    </section>
  )
}

/** Screen geometry and free-form experiment notes; every field is optional.
 *  The measures start from Configuración (`withScreenDefaults`). */
export function PlanningScreen({
  value,
  onChange,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
}) {
  const baseId = useId()
  const setScreen = (change: Partial<PreExperimentConfig["screen"]>) =>
    onChange({ ...value, screen: { ...value.screen, ...change } })
  const measure = (key: Measure, label: string, unit: string, hint?: string) => (
    <div key={key} className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={`${baseId}-${key}`}>{label}</Label>
        {hint && <FieldHint id={`${baseId}-${key}-ayuda`}>{hint}</FieldHint>}
      </div>
      <div className="relative">
        <Input
          id={`${baseId}-${key}`}
          aria-describedby={hint ? `${baseId}-${key}-ayuda` : undefined}
          type="number"
          min={key.endsWith("_px") ? 1 : 0.01}
          step={key.endsWith("_px") ? 1 : "any"}
          className="pr-10"
          value={value.screen[key] ?? ""}
          onChange={(event) =>
            setScreen({
              [key]: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
        >
          {unit}
        </span>
      </div>
    </div>
  )
  return (
    <div className="space-y-4">
      <Group
        icon={<Monitor aria-hidden />}
        title="Pantalla"
      >
        <div className="grid grid-cols-2 gap-3">
          {measure("width_px", "Ancho (px)", "px")}
          {measure("height_px", "Alto (px)", "px")}
        </div>
      </Group>
      <Group
        icon={<Ruler aria-hidden />}
        title="Medidas físicas"
      >
        {/* One row in the editor and the creation dialog; inputs align at the bottom if a label wraps. */}
        <div className="grid items-end gap-3 @lg:grid-cols-3">
          {measure("width_cm", "Ancho (cm)", "cm")}
          {measure("height_cm", "Alto (cm)", "cm")}
          {measure(
            "viewing_distance_cm",
            "Distancia (cm)",
            "cm",
            "Distancia del participante a la pantalla. Solo se usa si falla el registro de distancia del eye tracker, que es más preciso."
          )}
        </div>
      </Group>
      <Group
        icon={<NotebookPen aria-hidden />}
        title="Notas"
      >
        <Label className="block space-y-1.5 text-sm">
          <span>Notas de pantalla</span>
          <Textarea
            value={value.screen.notes}
            placeholder="Brillo, calibración, iluminación de la sala…"
            onChange={(event) => setScreen({ notes: event.target.value })}
          />
        </Label>
        <Label className="block space-y-1.5 text-sm">
          <span>Datos relevantes del experimento</span>
          <Textarea
            value={value.notes}
            placeholder="Objetivo, condiciones, orden de los estímulos…"
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
          />
        </Label>
      </Group>
    </div>
  )
}
