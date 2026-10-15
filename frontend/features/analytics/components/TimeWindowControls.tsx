"use client"

import { useState } from "react"
import { ChevronDown, Clock } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { normalizeZoomRange } from "../chartZoom"

export type TimeWindow = {
  start: number | null
  end: number | null
}

export type TimeWindowDraft = {
  start: string
  end: string
}

export const EMPTY_TIME_WINDOW: TimeWindow = { start: null, end: null }
export const EMPTY_TIME_WINDOW_DRAFT: TimeWindowDraft = { start: "", end: "" }

export function parseTimeWindowValue(value: string): number | null {
  const trimmed = value.trim().replace(",", ".")
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function formatWindowBound(value: number | null, fallback: string) {
  return value == null ? fallback : `${value.toFixed(2)} s`
}

export function validateTimeWindowDraft(draft: TimeWindowDraft): { window: TimeWindow | null; error: string | null } {
  const start = parseTimeWindowValue(draft.start)
  const end = parseTimeWindowValue(draft.end)

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { window: null, error: "Usa valores numéricos válidos para la ventana temporal." }
  }

  if ((start != null && start < 0) || (end != null && end < 0)) {
    return { window: null, error: "Los segundos deben ser mayores o iguales a 0." }
  }

  if (start != null && end != null && end <= start) {
    return { window: null, error: "El segundo final debe ser mayor que el segundo inicial." }
  }

  return {
    window: {
      start: start == null ? null : Number(start.toFixed(4)),
      end: end == null ? null : Number(end.toFixed(4)),
    },
    error: null,
  }
}

/** Window for a range dragged on a time chart. */
export function timeWindowFromDrag(start: number, end: number): TimeWindow | null {
  return normalizeZoomRange(start, end, { min: 0 })
}

/** Input text that shows an applied window. */
export function timeWindowDraftOf(window: TimeWindow | null): TimeWindowDraft {
  return {
    start: window?.start == null ? "" : String(window.start),
    end: window?.end == null ? "" : String(window.end),
  }
}

export function hasTimeWindow(window: TimeWindow) {
  return window.start != null || window.end != null
}

export function TimeWindowControls({
  draftStart,
  draftEnd,
  appliedWindow,
  error,
  loading,
  onDraftStartChange,
  onDraftEndChange,
  onApply,
  onReset,
  zoomHint = "También puedes arrastrar sobre la gráfica para ampliar una zona.",
}: {
  draftStart: string
  draftEnd: string
  appliedWindow: TimeWindow
  error: string | null
  loading?: boolean
  onDraftStartChange: (value: string) => void
  onDraftEndChange: (value: string) => void
  onApply: () => void
  onReset: () => void
  zoomHint?: string
}) {
  const [open, setOpen] = useState(false)
  const hasWindow = hasTimeWindow(appliedWindow)
  const range = `${formatWindowBound(appliedWindow.start, "inicio")} - ${formatWindowBound(appliedWindow.end, "fin")}`

  const apply = () => {
    // The owner validates again and shows the error; keep the panel open for it.
    const { error: draftError } = validateTimeWindowDraft({ start: draftStart, end: draftEnd })
    onApply()
    if (!draftError) setOpen(false)
  }

  const reset = () => {
    onReset()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          aria-label={`Ventana temporal: ${hasWindow ? range : "Todo el experimento"}`}
          className="max-w-full min-w-0"
        >
          <Clock data-icon="inline-start" className="text-muted-foreground" />
          <span className="font-semibold text-foreground">
            {hasWindow ? "Ventana activa" : "Todo el experimento"}
          </span>
          {hasWindow ? <span className="truncate text-muted-foreground">{range}</span> : null}
          <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-3">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            apply()
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Ventana temporal
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Label className="block space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Inicio
              </span>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={draftStart}
                onChange={(event) => onDraftStartChange(event.target.value)}
                placeholder="20"
                className="h-9 w-full"
              />
            </Label>

            <Label className="block space-y-1">
              <span className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Fin
              </span>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={draftEnd}
                onChange={(event) => onDraftEndChange(event.target.value)}
                placeholder="25"
                className="h-9 w-full"
              />
            </Label>
          </div>

          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="lg" type="button" onClick={reset} disabled={loading || !hasWindow}>
              Restablecer
            </Button>
            <Button size="lg" type="submit" disabled={loading}>
              Aplicar
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{zoomHint}</p>
        </form>
      </PopoverContent>
    </Popover>
  )
}
