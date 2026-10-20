import type { ComponentProps, ReactNode } from "react"
import { HintTooltip } from "@/components/HintTooltip"
import { Button } from "@/components/ui/button"

// Frame and buttons add up to the 36 px of the large header buttons beside them.
function SelectionFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-[3px]">
      {children}
    </div>
  )
}

// Spreads the rest so HintTooltip can attach its ref and trigger handlers.
function SelectionButton({ pressed, ...props }: ComponentProps<typeof Button> & { pressed: boolean }) {
  return <Button variant="selection" size="sm" aria-pressed={pressed} className="border-transparent sm:text-sm" {...props} />
}

export function AnalyticsModeSelector<T extends string>({ value, options, onValueChange }: {
  value: T
  options: ReadonlyArray<{ key: T; label: string; hint?: string }>
  onValueChange: (value: T) => void
}) {
  return (
    <SelectionFrame label="Modo de visualización">
      {options.map((option) => (
        <HintTooltip key={option.key} hint={option.hint}>
          <SelectionButton pressed={value === option.key} onClick={() => onValueChange(option.key)}>
            {option.label}
          </SelectionButton>
        </HintTooltip>
      ))}
    </SelectionFrame>
  )
}

/** A single on/off option drawn like the mode selector beside it. */
export function AnalyticsToggle({ label, hint, pressed, onPressedChange }: {
  label: string
  hint?: string
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
}) {
  return (
    <SelectionFrame label={label}>
      <HintTooltip hint={hint}>
        <SelectionButton pressed={pressed} onClick={() => onPressedChange(!pressed)}>
          {label}
        </SelectionButton>
      </HintTooltip>
    </SelectionFrame>
  )
}

/** «Ajustar»: brings the vertical axis in to the chart's values instead of zero. */
export function FitAxisToggle({ pressed, onPressedChange }: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
}) {
  return (
    <AnalyticsToggle
      label="Ajustar"
      hint="Acerca el eje vertical a los valores de la gráfica."
      pressed={pressed}
      onPressedChange={onPressedChange}
    />
  )
}
