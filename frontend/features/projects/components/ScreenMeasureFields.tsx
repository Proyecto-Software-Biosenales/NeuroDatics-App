"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type ScreenMeasure = "widthPx" | "heightPx" | "widthCm" | "heightCm"

const MEASURES: { key: ScreenMeasure; slug: string; label: string; unit: "px" | "cm" }[] = [
  { key: "widthPx", slug: "width-px", label: "Ancho (px)", unit: "px" },
  { key: "heightPx", slug: "height-px", label: "Alto (px)", unit: "px" },
  { key: "widthCm", slug: "width-cm", label: "Ancho (cm)", unit: "cm" },
  { key: "heightCm", slug: "height-cm", label: "Alto (cm)", unit: "cm" },
]

/** The four screen measures in one row, with the same labels and unit suffix as Configuración.
 *  Shared by «Pantalla distinta a la configuración» and the pre-experiment's screen. */
export function ScreenMeasureFields({
  idPrefix,
  values,
  onChange,
  placeholders,
  disabled,
}: {
  idPrefix: string
  values: Record<ScreenMeasure, string>
  onChange: (measure: ScreenMeasure, value: string) => void
  placeholders?: Partial<Record<ScreenMeasure, string>>
  disabled?: boolean
}) {
  return (
    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {MEASURES.map(({ key, slug, label, unit }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-${slug}`}>{label}</Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-${slug}`}
              type="number"
              min={unit === "px" ? "1" : "0.1"}
              step={unit === "px" ? "1" : "0.1"}
              className="pr-10"
              placeholder={placeholders?.[key]}
              value={values[key]}
              onChange={(event) => onChange(key, event.target.value)}
              disabled={disabled}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
            >
              {unit}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
