"use client"
import type { ReactNode } from "react"
import { Monitor, NotebookPen, Ruler } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PreExperimentConfig } from "./types"

type Measure = keyof Omit<PreExperimentConfig["screen"], "model" | "notes">

function Group({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode
  title: string
  hint: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted [&_svg]:size-4">
          {icon}
        </div>
        <div>
          <h4 className="text-sm font-medium">{title}</h4>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

/** Screen geometry and free-form experiment notes; every field is optional. */
export function PlanningScreen({
  value,
  onChange,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
}) {
  const setScreen = (change: Partial<PreExperimentConfig["screen"]>) =>
    onChange({ ...value, screen: { ...value.screen, ...change } })
  const measure = (key: Measure, label: string, unit: string) => (
    <Label key={key} className="block space-y-1.5 text-sm">
      <span>{label}</span>
      <div className="relative">
        <Input
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
    </Label>
  )
  return (
    <div className="space-y-4">
      <Group
        icon={<Monitor aria-hidden />}
        title="Pantalla"
        hint="Modelo y resolución del monitor donde se presentan los estímulos."
      >
        <Label className="block space-y-1.5 text-sm">
          <span>Modelo de pantalla</span>
          <Input
            value={value.screen.model}
            placeholder="Ej: Dell P2419H"
            onChange={(event) => setScreen({ model: event.target.value })}
          />
        </Label>
        <div className="grid grid-cols-2 gap-3">
          {measure("width_px", "Ancho (px)", "px")}
          {measure("height_px", "Alto (px)", "px")}
        </div>
      </Group>
      <Group
        icon={<Ruler aria-hidden />}
        title="Medidas físicas"
        hint="Tamaño visible de la pantalla y distancia a la que se sienta el participante."
      >
        <div className="grid items-end gap-3 sm:grid-cols-3">
          {measure("width_cm", "Ancho (cm)", "cm")}
          {measure("height_cm", "Alto (cm)", "cm")}
          {measure("viewing_distance_cm", "Distancia a la pantalla (cm)", "cm")}
        </div>
      </Group>
      <Group
        icon={<NotebookPen aria-hidden />}
        title="Notas"
        hint="Cualquier detalle que quieras recordar al analizar los datos."
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
