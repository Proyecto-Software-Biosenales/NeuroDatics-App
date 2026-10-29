"use client"
import { useId } from "react"
import { ScreenMeasureFields, type ScreenMeasure } from "../components/ScreenMeasureFields"
import type { PreExperimentConfig } from "./types"

const KEYS = {
  widthPx: "width_px",
  heightPx: "height_px",
  widthCm: "width_cm",
  heightCm: "height_cm",
} as const satisfies Record<ScreenMeasure, keyof PreExperimentConfig["screen"]>

const text = (value: number | null) => (value === null ? "" : String(value))

/** The screen's four measures, laid out like «Pantalla distinta a la configuración».
 *  They start from Configuración (`withScreenDefaults`); every field is optional. */
export function PlanningScreen({
  value,
  onChange,
}: {
  value: PreExperimentConfig
  onChange: (value: PreExperimentConfig) => void
}) {
  const baseId = useId()
  const { screen } = value
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <ScreenMeasureFields
        idPrefix={baseId}
        values={{
          widthPx: text(screen.width_px),
          heightPx: text(screen.height_px),
          widthCm: text(screen.width_cm),
          heightCm: text(screen.height_cm),
        }}
        onChange={(measure, next) =>
          onChange({
            ...value,
            screen: { ...screen, [KEYS[measure]]: next === "" ? null : Number(next) },
          })
        }
      />
    </div>
  )
}
