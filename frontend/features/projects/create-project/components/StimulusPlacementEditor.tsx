"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { FixationScreenGeometryInput } from "../types"
import type { StimulusPlacementDraft } from "../stimulusPlacement"

interface StimulusPlacementEditorProps {
  placements: StimulusPlacementDraft[]
  fixationGeometry?: FixationScreenGeometryInput
  disabled?: boolean
  onChange: (sourceEntryPath: string, update: Partial<StimulusPlacementDraft>) => void
}

const numericFields: Array<{
  key: keyof StimulusPlacementDraft
  label: string
  positive?: boolean
}> = [
  { key: "screenWidthPx", label: "Pantalla ancho (px)", positive: true },
  { key: "screenHeightPx", label: "Pantalla alto (px)", positive: true },
  { key: "stimulusLeftPx", label: "Origen X (px)" },
  { key: "stimulusTopPx", label: "Origen Y (px)" },
  { key: "stimulusWidthPx", label: "Ancho mostrado (px)", positive: true },
  { key: "stimulusHeightPx", label: "Alto mostrado (px)", positive: true },
]

const viewportFields: Array<{
  key: keyof StimulusPlacementDraft
  label: string
  nonNegative?: boolean
  positive?: boolean
}> = [
  { key: "viewportLeftPx", label: "Viewport X" },
  { key: "viewportTopPx", label: "Viewport Y" },
  { key: "viewportWidthPx", label: "Viewport ancho", positive: true },
  { key: "viewportHeightPx", label: "Viewport alto", positive: true },
  { key: "scrollXPx", label: "Scroll X", nonNegative: true },
  { key: "scrollYPx", label: "Scroll Y", nonNegative: true },
]

export const StimulusPlacementEditor = ({
  placements,
  fixationGeometry,
  disabled = false,
  onChange,
}: StimulusPlacementEditorProps) => {
  if (placements.length === 0) return null

  const physicalWidth = fixationGeometry?.widthPx || ""
  const physicalHeight = fixationGeometry?.heightPx || ""

  const togglePlacement = (placement: StimulusPlacementDraft, enabled: boolean) => {
    const defaults: Partial<StimulusPlacementDraft> = { enabled }
    if (enabled) {
      if (!placement.screenWidthPx && physicalWidth) defaults.screenWidthPx = physicalWidth
      if (!placement.screenHeightPx && physicalHeight) defaults.screenHeightPx = physicalHeight
    }
    onChange(placement.sourceEntryPath, defaults)
  }

  const changeMode = (
    placement: StimulusPlacementDraft,
    displayMode: StimulusPlacementDraft["displayMode"],
  ) => {
    const update: Partial<StimulusPlacementDraft> = { displayMode }
    const screenWidth = placement.screenWidthPx || physicalWidth
    const screenHeight = placement.screenHeightPx || physicalHeight
    if (displayMode === "fullscreen") {
      Object.assign(update, {
        stimulusLeftPx: "0",
        stimulusTopPx: "0",
        stimulusWidthPx: screenWidth,
        stimulusHeightPx: screenHeight,
        viewportEnabled: false,
      })
    } else if (displayMode === "cover" || displayMode === "crop") {
      Object.assign(update, {
        viewportEnabled: true,
        viewportLeftPx: placement.viewportLeftPx || "0",
        viewportTopPx: placement.viewportTopPx || "0",
        viewportWidthPx: placement.viewportWidthPx || screenWidth,
        viewportHeightPx: placement.viewportHeightPx || screenHeight,
      })
    }
    onChange(placement.sourceEntryPath, update)
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div>
        <h4 className="font-medium text-foreground">Ubicación del estímulo en pantalla</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Activa y registra la geometría usada durante la adquisición para cada archivo.
          Si se omite, el proyecto conserva el comportamiento legado y mostrará una advertencia;
          nunca se asumirá pantalla completa.
        </p>
      </div>

      {placements.map((placement) => (
        <div key={placement.sourceEntryPath} className="space-y-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`placement-${placement.sourceEntryPath}`}
              checked={placement.enabled}
              onCheckedChange={(checked) => togglePlacement(placement, checked === true)}
              disabled={disabled}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <Label htmlFor={`placement-${placement.sourceEntryPath}`} className="cursor-pointer">
                Registrar transformación
              </Label>
              <p className="break-all text-xs text-muted-foreground">{placement.sourceEntryPath}</p>
            </div>
          </div>

          {placement.enabled && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`placement-mode-${placement.sourceEntryPath}`}>Modo de presentación</Label>
                <select
                  id={`placement-mode-${placement.sourceEntryPath}`}
                  value={placement.displayMode}
                  onChange={(event) => changeMode(
                    placement,
                    event.target.value as StimulusPlacementDraft["displayMode"],
                  )}
                  disabled={disabled}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                  <option value="crop">Crop</option>
                  <option value="fullscreen">Fullscreen explícito</option>
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {numericFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    <Input
                      type="number"
                      min={field.positive ? "0.000001" : undefined}
                      step="any"
                      value={String(placement[field.key] ?? "")}
                      onChange={(event) => onChange(placement.sourceEntryPath, {
                        [field.key]: event.target.value,
                      } as Partial<StimulusPlacementDraft>)}
                      disabled={disabled}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id={`placement-viewport-${placement.sourceEntryPath}`}
                  checked={placement.viewportEnabled}
                  onCheckedChange={(checked) => onChange(placement.sourceEntryPath, {
                    viewportEnabled: checked === true,
                  })}
                  disabled={disabled || placement.displayMode === "fullscreen"}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor={`placement-viewport-${placement.sourceEntryPath}`}>
                    Limitar a viewport/crop visible
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    El origen del estímulo ya debe incluir el desplazamiento constante de scroll.
                  </p>
                </div>
              </div>

              {placement.viewportEnabled && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {viewportFields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label>{field.label} (px)</Label>
                      <Input
                        type="number"
                        min={field.positive ? "0.000001" : field.nonNegative ? "0" : undefined}
                        step="any"
                        value={String(placement[field.key] ?? "")}
                        onChange={(event) => onChange(placement.sourceEntryPath, {
                          [field.key]: event.target.value,
                        } as Partial<StimulusPlacementDraft>)}
                        disabled={disabled}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  )
}

