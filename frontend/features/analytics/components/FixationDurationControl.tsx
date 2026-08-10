"use client"

import { FIXATION_DURATION_OPTIONS_MS, type FixationDurationMs } from "../types"

interface FixationDurationControlProps {
  value: FixationDurationMs
  onChange: (value: FixationDurationMs) => void
  availableDurations?: readonly FixationDurationMs[]
  loading?: boolean
  error?: string | null
}

export function FixationDurationControl({
  value,
  onChange,
  availableDurations,
  loading = false,
  error = null,
}: FixationDurationControlProps) {
  if (availableDurations && availableDurations.length === 0) {
    return (
      <p
        className="text-right text-xs text-amber-700 dark:text-amber-300"
        title="Vuelve a procesar los archivos del proyecto para generar las variantes de duración."
      >
        Comparación no disponible; reprocesa los datos
      </p>
    )
  }

  if (error && !availableDurations) {
    return (
      <p className="text-right text-xs text-red-600 dark:text-red-400">
        No se pudieron comprobar los umbrales disponibles
      </p>
    )
  }

  const durations = availableDurations ?? FIXATION_DURATION_OPTIONS_MS
  const checkingAvailability = loading || availableDurations === undefined

  return (
    <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className="hidden whitespace-nowrap sm:inline">
        {checkingAvailability ? "Comprobando umbrales" : "Duración mínima"}
      </span>
      <select
        aria-label="Duración mínima de fijación"
        value={value}
        disabled={checkingAvailability}
        onChange={(event) =>
          onChange(Number(event.target.value) as FixationDurationMs)
        }
        className="h-8 rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground shadow-sm transition-colors outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
      >
        {durations.map((duration) => (
          <option key={duration} value={duration}>
            {duration} ms
          </option>
        ))}
      </select>
    </label>
  )
}
