"use client"

import { AlertTriangle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { InfoChip } from "./InfoChip"

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
    // The reason used to live in a title attribute, which keyboards never open.
    return (
      <InfoChip
        tone="warning"
        Icon={AlertTriangle}
        label="Comparación no disponible"
        detail="Vuelve a procesar los archivos del proyecto para generar las variantes de duración."
      />
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
    <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className="hidden whitespace-nowrap sm:inline">
        {checkingAvailability ? "Comprobando umbrales" : "Duración mínima"}
      </span>
      <Select
        value={String(value)}
        disabled={checkingAvailability}
        onValueChange={(value) =>
          onChange(Number(value) as FixationDurationMs)
        }
      >
        <SelectTrigger aria-label="Duración mínima de fijación"><SelectValue /></SelectTrigger>
        <SelectContent>
        {durations.map((duration) => (
          <SelectItem key={duration} value={String(duration)}>
            {duration} ms
          </SelectItem>
        ))}
        </SelectContent>
      </Select>
    </div>
  )
}
